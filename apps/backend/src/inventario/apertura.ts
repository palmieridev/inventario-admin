import type {
  AperturaConfirmada, DatosUnidad, Elemento, Existencia as ExistenciaRespuesta, JornadaAbierta, RegistroApertura,
} from '@inventario/contracts';
import type { Pool, PoolClient } from 'pg';
import { enTransaccion } from '../db/transaccion.js';
import { autorizar, type IdentidadInventario } from '../acceso/identidad.js';
import { ErrorInventario, identificador, invalidos, objeto } from './validacion.js';

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

function cantidadDecimal(valor: unknown): string {
  if (typeof valor !== 'string' || valor !== valor.trim() || !/^\d{1,12}(?:\.\d{1,6})?$/.test(valor)) {
    invalidos('Escribe una cantidad no negativa con hasta doce cifras enteras y seis decimales.');
  }
  const [entero = '0', fraccion = ''] = valor.split('.');
  const base = entero.replace(/^0+(?=\d)/, '');
  const decimales = fraccion.replace(/0+$/, '');
  return decimales ? base + '.' + decimales : base;
}

async function buscarApertura(cliente: PoolClient, negocioId: string, clave: string): Promise<Apertura | undefined> {
  const { rows: [apertura] } = await cliente.query<Apertura>(
    'SELECT o.id AS "operacionId", o.autor_id AS "autorId", o.jornada_id AS "jornadaId", ' +
    'o.registrada_en AS "registradaEn", a.elemento_id AS "elementoId", a.unidad_id AS "unidadId", ' +
    'a.cantidad::text AS cantidad FROM operaciones_inventario AS o JOIN aperturas_inventario AS a ' +
    'ON a.negocio_id = o.negocio_id AND a.operacion_id = o.id WHERE o.negocio_id = $1 AND o.clave_reintento = $2',
    [negocioId, clave],
  );
  return apertura;
}

function comprobarReintento(apertura: Apertura | undefined, autorId: string, datos: DatosApertura): Apertura {
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
        const { negocio_id } = await autorizar(cliente, identidad);
        const { rows } = await cliente.query<{ id: string; iniciadaEn: Date }>(
          'SELECT id, iniciada_en AS "iniciadaEn" FROM jornadas ' +
          'WHERE negocio_id = $1 AND iniciada_en <= CURRENT_TIMESTAMP AND cerrada_en IS NULL ' +
          'ORDER BY iniciada_en DESC, id',
          [negocio_id],
        );
        return rows.map(({ id, iniciadaEn }) => ({ id, iniciadaEn: iniciadaEn.toISOString() }));
      });
    },

    registrarApertura(identidad: IdentidadInventario, entrada: unknown): Promise<Apertura> {
      return enTransaccion(pool, async (cliente) => {
        const { negocio_id: negocioId, id: autorId } = await autorizar(cliente, identidad);
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

        const previa = await buscarApertura(cliente, negocioId, clave);
        if (previa) return comprobarReintento(previa, autorId, datos);
        if (soloConfirmada) {
          throw new ErrorInventario('apertura_no_confirmada',
            'El conteo anterior no tiene confirmación. Vuelve a abrir el elemento y revisa su existencia.');
        }

        const { rows: [jornada] } = await cliente.query<{ iniciada: boolean; cerrada_en: Date | null }>(
          'SELECT iniciada_en <= CURRENT_TIMESTAMP AS iniciada, cerrada_en FROM jornadas ' +
          'WHERE negocio_id = $1 AND id = $2 FOR SHARE',
          [negocioId, datos.jornadaId],
        );
        if (!jornada) throw new ErrorInventario('no_encontrado', 'La jornada no existe en el negocio.');

        // La restricción de la clave serializa los reintentos sin bloquear otros elementos.
        const { rows: [operacion] } = await cliente.query<{ id: string; registradaEn: Date }>(
          'INSERT INTO operaciones_inventario (negocio_id, autor_id, jornada_id, tipo, clave_reintento) ' +
          "VALUES ($1, $2, $3, 'apertura', $4) ON CONFLICT (negocio_id, clave_reintento) DO NOTHING " +
          'RETURNING id, registrada_en AS "registradaEn"',
          [negocioId, autorId, datos.jornadaId, clave],
        );
        if (!operacion) {
          return comprobarReintento(await buscarApertura(cliente, negocioId, clave), autorId, datos);
        }
        if (!jornada.iniciada) throw new ErrorInventario('jornada_no_iniciada', 'La jornada todavía no ha iniciado.');
        if (jornada.cerrada_en) throw new ErrorInventario('jornada_cerrada', 'La jornada ya se cerró.');

        const { rows: [elemento] } = await cliente.query<Omit<Elemento, 'id'>>(
          'SELECT unidad_id AS "unidadId", nombre, variante, categoria, activo FROM elementos_inventario ' +
          'WHERE negocio_id = $1 AND id = $2 FOR UPDATE',
          [negocioId, datos.elementoId],
        );
        if (!elemento) throw new ErrorInventario('no_encontrado', 'El elemento no existe en el negocio.');
        if (!elemento.activo) throw new ErrorInventario('elemento_inactivo', 'El elemento está inactivo.');
        const definicion = valores.definicion === undefined ? undefined : objeto(valores.definicion);
        if (elemento.unidadId !== datos.unidadId) {
          if (definicion) catalogoCambiado();
          invalidos('Usa la unidad de control del elemento.');
        }

        const { rows: [unidad] } = await cliente.query<DatosUnidad>(
          'SELECT nombre, simbolo, decimales FROM unidades_medida WHERE negocio_id = $1 AND id = $2 FOR SHARE',
          [negocioId, datos.unidadId],
        );
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

        const apertura = await cliente.query(
          'INSERT INTO aperturas_inventario (negocio_id, elemento_id, unidad_id, operacion_id, cantidad) ' +
          'VALUES ($1, $2, $3, $4, $5) ON CONFLICT (negocio_id, elemento_id) DO NOTHING',
          [negocioId, datos.elementoId, datos.unidadId, operacion.id, datos.cantidad],
        );
        if (!apertura.rowCount) {
          throw new ErrorInventario('apertura_existente', 'El elemento ya tiene un conteo inicial.');
        }
        await cliente.query(
          'INSERT INTO existencias_inventario (negocio_id, elemento_id, cantidad, actualizada_en) ' +
          'SELECT $1, $2, $3, registrada_en FROM operaciones_inventario WHERE negocio_id = $1 AND id = $4',
          [negocioId, datos.elementoId, datos.cantidad, operacion.id],
        );
        return { ...datos, operacionId: operacion.id, autorId, registradaEn: operacion.registradaEn };
      });
    },

    consultarExistencia(identidad: IdentidadInventario, elementoId: string): Promise<Existencia | null> {
      return enTransaccion(pool, async (cliente) => {
        const usuario = await autorizar(cliente, identidad);
        const { rows: [existencia] } = await cliente.query<
          Omit<Existencia, 'cantidad' | 'actualizadaEn'> & { cantidad: string | null; actualizadaEn: Date | null }
        >(
          'SELECT e.id AS "elementoId", e.unidad_id AS "unidadId", s.cantidad::text AS cantidad, ' +
          's.actualizada_en AS "actualizadaEn" FROM elementos_inventario AS e LEFT JOIN existencias_inventario AS s ' +
          'ON s.negocio_id = e.negocio_id AND s.elemento_id = e.id ' +
          'WHERE e.negocio_id = $1 AND e.id = $2 AND (e.activo OR $3)',
          [usuario.negocio_id, identificador(elementoId, 'El elemento'), usuario.rol === 'admin'],
        );
        if (!existencia) throw new ErrorInventario('no_encontrado', 'El elemento no existe en el negocio.');
        const { cantidad, actualizadaEn } = existencia;
        return cantidad === null || actualizadaEn === null ? null : { ...existencia, cantidad, actualizadaEn };
      });
    },
  };
}
