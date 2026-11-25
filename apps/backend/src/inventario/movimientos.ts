import { CAUSAS_MERMA, type LineaMovimiento, type MovimientoConfirmado,
  type TipoMovimiento } from '@inventario/contracts';
import type { Pool, PoolClient } from 'pg';
import { autorizar, type IdentidadInventario } from '../acceso/identidad.js';
import { leerJornadaBloqueada, registrarOperacion } from '../db/consultas/apertura_sql.js';
import { bloquearElemento, leerUnidadBloqueada } from '../db/consultas/catalogo_sql.js';
import {
  actualizarFechaOperacion, actualizarSaldo, buscarMovimiento, buscarReintentoMovimiento, calcularSaldoBloqueado,
  insertarLineaMovimiento, insertarMovimiento, listarLineasMovimiento,
} from '../db/consultas/movimientos_sql.js';
import { enTransaccion } from '../db/transaccion.js';
import { cantidadDecimal, ErrorInventario, identificador, invalidos, objeto, texto } from './validacion.js';

type Linea = LineaMovimiento & { efecto: 'sumar' | 'restar' | 'contar'; categoria?: 'insumo' | 'preparado' };
interface Datos {
  tipo: TipoMovimiento;
  jornadaId: string;
  motivo: string | null;
  observacion: string | null;
  lineas: Linea[];
}

function esTipoMovimiento(tipo: unknown): tipo is TipoMovimiento {
  return tipo === 'compra' || tipo === 'tanda' || tipo === 'salida' ||
    tipo === 'consumo' || tipo === 'merma' || tipo === 'ajuste';
}

function validar(entrada: unknown): { clave: string; datos: Datos; soloConfirmada: boolean } {
  const v = objeto(entrada);
  const { tipo, soloConfirmada } = v;
  if (soloConfirmada !== undefined && typeof soloConfirmada !== 'boolean') {
    invalidos('Indica si solo se consultará un movimiento confirmado.');
  }
  if (!esTipoMovimiento(tipo)) {
    invalidos('Selecciona un tipo de movimiento válido.');
  }
  const motivo = ['salida', 'consumo', 'merma', 'ajuste'].includes(tipo)
    ? texto(v.motivo, 'El motivo', 240) : null;
  if (tipo === 'merma' && !CAUSAS_MERMA.some((causa) => causa === motivo)) {
    invalidos('Selecciona una causa de merma válida.');
  }
  function lineas(valor: unknown, efecto: Linea['efecto'], categoria?: Linea['categoria']): Linea[] {
    if (!Array.isArray(valor) || valor.length > 100 || (!valor.length && categoria !== 'insumo')) {
      invalidos('Indica entre una y cien líneas; los insumos de una tanda pueden omitirse con una lista vacía.');
    }
    return valor.map((entrada) => {
      const l = objeto(entrada);
      const cantidad = cantidadDecimal(l.cantidad);
      if (cantidad === '0' && efecto !== 'contar') invalidos('La cantidad debe ser mayor que cero.');
      return { elementoId: identificador(l.elementoId, 'El elemento'),
        unidadId: identificador(l.unidadId, 'La unidad'), cantidad, efecto,
        ...(categoria && { categoria }) };
    });
  }
  const detalles = tipo === 'tanda'
    ? [...lineas(v.insumos, 'restar', 'insumo'), ...lineas(v.productos, 'sumar', 'preparado')]
    : lineas(v.lineas, tipo === 'compra' ? 'sumar' : tipo === 'ajuste' ? 'contar' : 'restar');
  if (new Set(detalles.map((l) => l.elementoId)).size !== detalles.length) {
    invalidos('Cada elemento debe aparecer una sola vez en la operación.');
  }
  detalles.sort((a, b) => a.elementoId.localeCompare(b.elementoId));
  return {
    clave: identificador(v.claveReintento, 'La clave de reintento'),
    soloConfirmada: soloConfirmada ?? false,
    datos: {
      tipo, jornadaId: identificador(v.jornadaId, 'La jornada'), motivo,
      observacion: v.observacion === undefined ? null : texto(v.observacion, 'La observación', 500),
      lineas: detalles,
    },
  };
}

async function consultar(cliente: PoolClient, negocioId: string, operacionId: string): Promise<MovimientoConfirmado> {
  const movimiento = await buscarMovimiento(cliente, { negocioId, operacionId });
  if (!movimiento) throw new ErrorInventario('no_encontrado', 'El movimiento no existe en el negocio.');
  const { tipo, registradaEn } = movimiento;
  if (!esTipoMovimiento(tipo)) throw new Error('La operación tiene un tipo de movimiento inválido.');
  const lineas = await listarLineasMovimiento(cliente, { negocioId, operacionId });
  return { ...movimiento, tipo, registradaEn: registradaEn.toISOString(), lineas };
}

async function recuperar(cliente: PoolClient, negocioId: string, autorId: string, claveReintento: string, solicitud: string) {
  const previa = await buscarReintentoMovimiento(cliente, { negocioId, claveReintento, autorId, solicitud });
  if (!previa) return undefined;
  if (!previa.coincide) throw new ErrorInventario('reintento_distinto', 'La clave ya corresponde a otra operación.');
  return consultar(cliente, negocioId, previa.id);
}

export function crearServicioMovimientos(pool: Pool) {
  return {
    consultar(identidad: IdentidadInventario, id: string): Promise<MovimientoConfirmado> {
      return enTransaccion(pool, async (cliente) => {
        const usuario = await autorizar(cliente, identidad);
        return consultar(cliente, usuario.negocioId, identificador(id, 'El movimiento'));
      });
    },

    registrar(identidad: IdentidadInventario, entrada: unknown): Promise<MovimientoConfirmado> {
      return enTransaccion(pool, async (cliente) => {
        const usuario = await autorizar(cliente, identidad);
        const { clave, datos, soloConfirmada } = validar(entrada);
        if (datos.tipo === 'ajuste' && usuario.rol !== 'admin') {
          throw new ErrorInventario('acceso_denegado', 'Solo el propietario o encargado puede autorizar ajustes.');
        }
        const { negocioId, id: autorId } = usuario;
        const solicitud = JSON.stringify(datos);
        const previa = await recuperar(cliente, negocioId, autorId, clave, solicitud);
        if (previa) return previa;
        if (soloConfirmada) {
          throw new ErrorInventario('movimiento_no_confirmado', 'Todavía no hay un movimiento confirmado con esta clave.');
        }
        const jornada = await leerJornadaBloqueada(cliente, { negocioId, jornadaId: datos.jornadaId });
        if (!jornada) throw new ErrorInventario('no_encontrado', 'La jornada no existe en el negocio.');
        const operacion = await registrarOperacion(cliente, {
          negocioId, autorId, jornadaId: datos.jornadaId, tipo: datos.tipo, claveReintento: clave,
        });
        if (!operacion) {
          const resultado = await recuperar(cliente, negocioId, autorId, clave, solicitud);
          if (!resultado) throw new Error('No se pudo recuperar la operación confirmada.');
          return resultado;
        }
        if (!jornada.iniciada) throw new ErrorInventario('jornada_no_iniciada', 'La jornada todavía no ha iniciado.');
        if (jornada.cerradaEn) throw new ErrorInventario('jornada_cerrada', 'La jornada ya se cerró.');
        const operacionId = operacion.id;
        await insertarMovimiento(cliente, {
          negocioId, operacionId, solicitud, motivo: datos.motivo, observacion: datos.observacion,
        });
        const saldos: { linea: Linea; anterior: string; siguiente: string }[] = [];
        // Orden estable para bloquear todos los elementos de una tanda sin invertir los bloqueos.
        for (const linea of datos.lineas) {
          const elemento = await bloquearElemento(cliente, { negocioId, elementoId: linea.elementoId });
          if (!elemento) throw new ErrorInventario('no_encontrado', 'El elemento no existe en el negocio.');
          if (!elemento.activo) throw new ErrorInventario('elemento_inactivo', 'El elemento está inactivo.');
          if (elemento.unidadId !== linea.unidadId) invalidos('Usa la unidad de control del elemento.');
          if (linea.categoria && elemento.categoria !== linea.categoria) {
            invalidos('Una tanda consume insumos y obtiene productos preparados.');
          }
          const unidad = await leerUnidadBloqueada(cliente, { negocioId, unidadId: linea.unidadId });
          if (!unidad || (linea.cantidad.split('.')[1]?.length ?? 0) > unidad.decimales) {
            invalidos('La cantidad excede los decimales permitidos por la unidad de control.');
          }
          const saldo = await calcularSaldoBloqueado(cliente, {
            negocioId, elementoId: linea.elementoId, cantidad: linea.cantidad, efecto: linea.efecto,
          });
          if (!saldo) throw new ErrorInventario('conteo_requerido', 'Registra primero el conteo inicial del elemento.');
          if (saldo.insuficiente) throw new ErrorInventario('saldo_insuficiente', 'La cantidad supera la existencia. Revisa el saldo y la captura.');
          if (saldo.excedido) throw new ErrorInventario('saldo_excedido', 'El saldo resultante excede el límite de doce cifras enteras.');
          saldos.push({ linea, anterior: saldo.anterior, siguiente: saldo.siguiente });
        }
        // La fecha debe reflejar el orden de los cambios sobre un mismo elemento.
        await actualizarFechaOperacion(cliente, { negocioId, operacionId });
        for (const { linea, anterior, siguiente } of saldos) {
          await insertarLineaMovimiento(cliente, {
            negocioId, operacionId, elementoId: linea.elementoId, unidadId: linea.unidadId,
            saldoAnterior: anterior, saldoResultante: siguiente,
          });
          await actualizarSaldo(cliente, { negocioId, operacionId, elementoId: linea.elementoId, cantidad: siguiente });
        }
        return consultar(cliente, negocioId, operacionId);
      });
    },
  };
}
