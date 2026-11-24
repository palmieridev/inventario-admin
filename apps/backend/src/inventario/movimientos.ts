import { CAUSAS_MERMA, type LineaConfirmada, type LineaMovimiento, type MovimientoConfirmado,
  type TipoMovimiento } from '@inventario/contracts';
import type { Pool, PoolClient } from 'pg';
import { autorizar, type IdentidadInventario } from '../acceso/identidad.js';
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

function validar(entrada: unknown): { clave: string; datos: Datos } {
  const v = objeto(entrada);
  if (typeof v.tipo !== 'string' || !['compra', 'tanda', 'salida', 'consumo', 'merma', 'ajuste'].includes(v.tipo)) {
    invalidos('Selecciona un tipo de movimiento válido.');
  }
  const tipo = v.tipo as TipoMovimiento;
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
  return { clave: identificador(v.claveReintento, 'La clave de reintento'), datos: {
    tipo, jornadaId: identificador(v.jornadaId, 'La jornada'), motivo,
    observacion: v.observacion === undefined ? null : texto(v.observacion, 'La observación', 500),
    lineas: detalles,
  } };
}

async function consultar(cliente: PoolClient, negocioId: string, operacionId: string): Promise<MovimientoConfirmado> {
  const { rows: [movimiento] } = await cliente.query<Omit<MovimientoConfirmado, 'lineas' | 'registradaEn'> & { registradaEn: Date }>(
    'SELECT o.id AS "operacionId", o.autor_id AS "autorId", o.jornada_id AS "jornadaId", o.tipo, ' +
    'o.registrada_en AS "registradaEn", m.motivo, m.observacion FROM operaciones_inventario o ' +
    'JOIN movimientos_inventario m ON m.negocio_id = o.negocio_id AND m.operacion_id = o.id ' +
    'WHERE o.negocio_id = $1 AND o.id = $2', [negocioId, operacionId],
  );
  if (!movimiento) throw new ErrorInventario('no_encontrado', 'El movimiento no existe en el negocio.');
  const { rows: lineas } = await cliente.query<LineaConfirmada>(
    'SELECT elemento_id AS "elementoId", unidad_id AS "unidadId", saldo_anterior::text AS "saldoAnterior", ' +
    'saldo_resultante::text AS "saldoResultante", variacion::text AS variacion FROM lineas_movimiento ' +
    'WHERE negocio_id = $1 AND operacion_id = $2 ORDER BY elemento_id', [negocioId, operacionId],
  );
  return { ...movimiento, registradaEn: movimiento.registradaEn.toISOString(), lineas };
}

async function recuperar(cliente: PoolClient, negocioId: string, autorId: string, clave: string, datos: Datos) {
  const { rows: [previa] } = await cliente.query<{ id: string; coincide: boolean }>(
    'SELECT o.id, (o.autor_id = $3 AND m.solicitud = $4::jsonb) AS coincide ' +
    'FROM operaciones_inventario o LEFT JOIN movimientos_inventario m ' +
    'ON m.negocio_id = o.negocio_id AND m.operacion_id = o.id WHERE o.negocio_id = $1 AND o.clave_reintento = $2',
    [negocioId, clave, autorId, JSON.stringify(datos)],
  );
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
        const { clave, datos } = validar(entrada);
        if (datos.tipo === 'ajuste' && usuario.rol !== 'admin') {
          throw new ErrorInventario('acceso_denegado', 'Solo el propietario o encargado puede autorizar ajustes.');
        }
        const negocioId = usuario.negocioId;
        const previa = await recuperar(cliente, negocioId, usuario.id, clave, datos);
        if (previa) return previa;
        const { rows: [jornada] } = await cliente.query<{ iniciada: boolean; cerrada_en: Date | null }>(
          'SELECT iniciada_en <= CURRENT_TIMESTAMP AS iniciada, cerrada_en FROM jornadas ' +
          'WHERE negocio_id = $1 AND id = $2 FOR SHARE', [negocioId, datos.jornadaId],
        );
        if (!jornada) throw new ErrorInventario('no_encontrado', 'La jornada no existe en el negocio.');
        const { rows: [operacion] } = await cliente.query<{ id: string }>(
          'INSERT INTO operaciones_inventario (negocio_id, autor_id, jornada_id, tipo, clave_reintento) ' +
          'VALUES ($1, $2, $3, $4, $5) ON CONFLICT (negocio_id, clave_reintento) DO NOTHING RETURNING id',
          [negocioId, usuario.id, datos.jornadaId, datos.tipo, clave],
        );
        if (!operacion) {
          const resultado = await recuperar(cliente, negocioId, usuario.id, clave, datos);
          if (!resultado) throw new Error('No se pudo recuperar la operación confirmada.');
          return resultado;
        }
        if (!jornada.iniciada) throw new ErrorInventario('jornada_no_iniciada', 'La jornada todavía no ha iniciado.');
        if (jornada.cerrada_en) throw new ErrorInventario('jornada_cerrada', 'La jornada ya se cerró.');
        await cliente.query(
          'INSERT INTO movimientos_inventario (negocio_id, operacion_id, solicitud, motivo, observacion) ' +
          'VALUES ($1, $2, $3, $4, $5)',
          [negocioId, operacion.id, JSON.stringify(datos), datos.motivo, datos.observacion],
        );
        const saldos: { linea: Linea; anterior: string; siguiente: string }[] = [];
        // Orden estable para bloquear todos los elementos de una tanda sin invertir los bloqueos.
        for (const linea of datos.lineas) {
          const { rows: [elemento] } = await cliente.query<{ unidad_id: string; activo: boolean; categoria: string }>(
            'SELECT unidad_id, activo, categoria FROM elementos_inventario WHERE negocio_id = $1 AND id = $2 FOR UPDATE',
            [negocioId, linea.elementoId],
          );
          if (!elemento) throw new ErrorInventario('no_encontrado', 'El elemento no existe en el negocio.');
          if (!elemento.activo) throw new ErrorInventario('elemento_inactivo', 'El elemento está inactivo.');
          if (elemento.unidad_id !== linea.unidadId) invalidos('Usa la unidad de control del elemento.');
          if (linea.categoria && elemento.categoria !== linea.categoria) {
            invalidos('Una tanda consume insumos y obtiene productos preparados.');
          }
          const { rows: [unidad] } = await cliente.query<{ decimales: number }>(
            'SELECT decimales FROM unidades_medida WHERE negocio_id = $1 AND id = $2 FOR SHARE',
            [negocioId, linea.unidadId],
          );
          if (!unidad || (linea.cantidad.split('.')[1]?.length ?? 0) > unidad.decimales) {
            invalidos('La cantidad excede los decimales permitidos por la unidad de control.');
          }
          const { rows: [saldo] } = await cliente.query<{ anterior: string; siguiente: string; insuficiente: boolean; excedido: boolean }>(
            'SELECT cantidad::text AS anterior, calculo::text AS siguiente, calculo < 0 AS insuficiente, ' +
            'calculo >= 1000000000000 AS excedido FROM existencias_inventario, LATERAL (SELECT CASE $4::text ' +
            "WHEN 'sumar' THEN cantidad + $3::numeric WHEN 'restar' THEN cantidad - $3::numeric ELSE $3::numeric END AS calculo) c " +
            'WHERE negocio_id = $1 AND elemento_id = $2 FOR UPDATE OF existencias_inventario',
            [negocioId, linea.elementoId, linea.cantidad, linea.efecto],
          );
          if (!saldo) throw new ErrorInventario('conteo_requerido', 'Registra primero el conteo inicial del elemento.');
          if (saldo.insuficiente) throw new ErrorInventario('saldo_insuficiente', 'La cantidad supera la existencia. Revisa el saldo y la captura.');
          if (saldo.excedido) throw new ErrorInventario('saldo_excedido', 'El saldo resultante excede el límite de doce cifras enteras.');
          saldos.push({ linea, anterior: saldo.anterior, siguiente: saldo.siguiente });
        }
        // La fecha debe reflejar el orden de los cambios sobre un mismo elemento.
        await cliente.query(
          'UPDATE operaciones_inventario SET registrada_en = clock_timestamp() WHERE negocio_id = $1 AND id = $2',
          [negocioId, operacion.id],
        );
        for (const { linea, anterior, siguiente } of saldos) {
          await cliente.query(
            'INSERT INTO lineas_movimiento (negocio_id, operacion_id, elemento_id, unidad_id, saldo_anterior, saldo_resultante) ' +
            'VALUES ($1, $2, $3, $4, $5, $6)',
            [negocioId, operacion.id, linea.elementoId, linea.unidadId, anterior, siguiente],
          );
          await cliente.query(
            'UPDATE existencias_inventario e SET cantidad = $3, actualizada_en = o.registrada_en ' +
            'FROM operaciones_inventario o WHERE e.negocio_id = $1 AND e.elemento_id = $2 ' +
            'AND o.negocio_id = e.negocio_id AND o.id = $4',
            [negocioId, linea.elementoId, siguiente, operacion.id],
          );
        }
        return consultar(cliente, negocioId, operacion.id);
      });
    },
  };
}
