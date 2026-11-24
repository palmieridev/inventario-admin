import type {
  AperturaConfirmada, Existencia as ExistenciaRespuesta, JornadaAbierta, RegistroApertura,
} from '@inventario/contracts';
import type { Pool } from 'pg';
import {
  buscarAperturaPorClave, buscarExistencia, insertarApertura, insertarExistencia, leerJornadaBloqueada,
  listarJornadasAbiertas, registrarOperacion,
} from '../db/consultas/apertura_sql.js';
import { bloquearElemento, leerUnidadBloqueada } from '../db/consultas/catalogo_sql.js';
import { enTransaccion } from '../db/transaccion.js';
import { autorizar, type IdentidadInventario } from '../acceso/identidad.js';
import { cantidadDecimal, ErrorInventario, identificador, invalidos, objeto } from './validacion.js';

type DatosApertura = Pick<RegistroApertura, 'elementoId' | 'unidadId' | 'jornadaId' | 'cantidad'>;

function catalogoCambiado(): never {
  throw new ErrorInventario('catalogo_cambiado',
    'Cambió el elemento o su unidad de control. Vuelve a abrir el elemento y revisa el conteo.');
}

interface Apertura extends Omit<AperturaConfirmada, 'registradaEn'> {
  registradaEn: Date;
}

interface Existencia extends Omit<ExistenciaRespuesta, 'actualizadaEn'> {
  actualizadaEn: Date;
}

function comprobarReintento(apertura: Apertura | null, autorId: string, datos: DatosApertura): Apertura {
  if (!apertura || apertura.autorId !== autorId || apertura.jornadaId !== datos.jornadaId ||
    apertura.elementoId !== datos.elementoId || apertura.unidadId !== datos.unidadId ||
    apertura.cantidad !== datos.cantidad) {
    throw new ErrorInventario('reintento_distinto', 'La clave ya corresponde a otra operación.');
  }
  return apertura;
}

export function crearServicioApertura(pool: Pool) {
  return {
    listarJornadasAbiertas(identidad: IdentidadInventario): Promise<JornadaAbierta[]> {
      return enTransaccion(pool, async (cliente) => {
        const { negocioId } = await autorizar(cliente, identidad);
        const jornadas = await listarJornadasAbiertas(cliente, { negocioId });
        return jornadas.map(({ id, iniciadaEn }) => ({ id, iniciadaEn: iniciadaEn.toISOString() }));
      });
    },

    registrarApertura(identidad: IdentidadInventario, entrada: unknown): Promise<Apertura> {
      return enTransaccion(pool, async (cliente) => {
        const { negocioId, id: autorId } = await autorizar(cliente, identidad);
        const valores = objeto(entrada);
        const clave = identificador(valores.claveReintento, 'La clave de reintento');
        const soloConfirmada = valores.soloConfirmada;
        if (soloConfirmada !== undefined && typeof soloConfirmada !== 'boolean') {
          invalidos('Indica si solo se consultará una apertura confirmada.');
        }
        const datos: DatosApertura = {
          elementoId: identificador(valores.elementoId, 'El elemento'),
          unidadId: identificador(valores.unidadId, 'La unidad'),
          jornadaId: identificador(valores.jornadaId, 'La jornada'),
          cantidad: cantidadDecimal(valores.cantidad),
        };

        const previa = await buscarAperturaPorClave(cliente, { negocioId, claveReintento: clave });
        if (previa) return comprobarReintento(previa, autorId, datos);
        if (soloConfirmada) {
          throw new ErrorInventario('apertura_no_confirmada',
            'El conteo anterior no tiene confirmación. Vuelve a abrir el elemento y revisa su existencia.');
        }

        const jornada = await leerJornadaBloqueada(cliente, { negocioId, jornadaId: datos.jornadaId });
        if (!jornada) throw new ErrorInventario('no_encontrado', 'La jornada no existe en el negocio.');

        // La restricción de la clave serializa los reintentos sin bloquear otros elementos.
        const operacion = await registrarOperacion(cliente, {
          negocioId, autorId, jornadaId: datos.jornadaId, tipo: 'apertura', claveReintento: clave,
        });
        if (!operacion) {
          const confirmada = await buscarAperturaPorClave(cliente, { negocioId, claveReintento: clave });
          return comprobarReintento(confirmada, autorId, datos);
        }
        if (!jornada.iniciada) throw new ErrorInventario('jornada_no_iniciada', 'La jornada todavía no ha iniciado.');
        if (jornada.cerradaEn) throw new ErrorInventario('jornada_cerrada', 'La jornada ya se cerró.');

        const elemento = await bloquearElemento(cliente, { negocioId, elementoId: datos.elementoId });
        if (!elemento) throw new ErrorInventario('no_encontrado', 'El elemento no existe en el negocio.');
        if (!elemento.activo) throw new ErrorInventario('elemento_inactivo', 'El elemento está inactivo.');
        const definicion = valores.definicion === undefined ? undefined : objeto(valores.definicion);
        if (elemento.unidadId !== datos.unidadId) {
          if (definicion) catalogoCambiado();
          invalidos('Usa la unidad de control del elemento.');
        }

        const unidad = await leerUnidadBloqueada(cliente, { negocioId, unidadId: datos.unidadId });
        if (!unidad) throw new ErrorInventario('no_encontrado', 'La unidad no existe en el negocio.');
        if (definicion) {
          const esperada = objeto(definicion.unidad);
          if (definicion.nombre !== elemento.nombre || definicion.variante !== elemento.variante ||
            definicion.categoria !== elemento.categoria || esperada.nombre !== unidad.nombre ||
            esperada.simbolo !== unidad.simbolo || esperada.decimales !== unidad.decimales) {
            catalogoCambiado();
          }
        }
        if ((datos.cantidad.split('.')[1]?.length ?? 0) > unidad.decimales) {
          invalidos('La cantidad excede los decimales permitidos por la unidad de control.');
        }

        const apertura = await insertarApertura(cliente, { negocioId, operacionId: operacion.id, ...datos });
        if (!apertura) {
          throw new ErrorInventario('apertura_existente', 'El elemento ya tiene un conteo inicial.');
        }
        await insertarExistencia(cliente, { negocioId, operacionId: operacion.id, ...datos });
        return { ...datos, operacionId: operacion.id, autorId, registradaEn: operacion.registradaEn };
      });
    },

    consultarExistencia(identidad: IdentidadInventario, elementoId: string): Promise<Existencia | null> {
      return enTransaccion(pool, async (cliente) => {
        const usuario = await autorizar(cliente, identidad);
        const existencia = await buscarExistencia(cliente, {
          negocioId: usuario.negocioId, elementoId: identificador(elementoId, 'El elemento'),
          incluirInactivos: usuario.rol === 'admin',
        });
        if (!existencia) throw new ErrorInventario('no_encontrado', 'El elemento no existe en el negocio.');
        const { cantidad, actualizadaEn } = existencia;
        return cantidad === null || actualizadaEn === null ? null : { ...existencia, cantidad, actualizadaEn };
      });
    },
  };
}
