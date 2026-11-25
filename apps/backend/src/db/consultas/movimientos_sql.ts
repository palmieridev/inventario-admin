// Código generado con pnpm db:generate.
import type { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const buscarMovimientoQuery = `-- name: BuscarMovimiento :one
SELECT o.id AS operacion_id, o.autor_id, o.jornada_id, o.tipo, o.registrada_en, m.motivo, m.observacion
FROM operaciones_inventario AS o
JOIN movimientos_inventario AS m ON m.negocio_id = o.negocio_id AND m.operacion_id = o.id
WHERE o.negocio_id = $1 AND o.id = $2`;

export interface BuscarMovimientoArgs {
    negocioId: string;
    operacionId: string;
}

export interface BuscarMovimientoRow {
    operacionId: string;
    autorId: string;
    jornadaId: string;
    tipo: string;
    registradaEn: Date;
    motivo: string | null;
    observacion: string | null;
}

export async function buscarMovimiento(client: Client, args: BuscarMovimientoArgs): Promise<BuscarMovimientoRow | null> {
    const result = await client.query({
        text: buscarMovimientoQuery,
        values: [args.negocioId, args.operacionId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        operacionId: row[0],
        autorId: row[1],
        jornadaId: row[2],
        tipo: row[3],
        registradaEn: row[4],
        motivo: row[5],
        observacion: row[6]
    };
}

export const listarLineasMovimientoQuery = `-- name: ListarLineasMovimiento :many
SELECT elemento_id, unidad_id, saldo_anterior::text AS saldo_anterior,
       saldo_resultante::text AS saldo_resultante, variacion::text AS variacion
FROM lineas_movimiento
WHERE negocio_id = $1 AND operacion_id = $2
ORDER BY elemento_id`;

export interface ListarLineasMovimientoArgs {
    negocioId: string;
    operacionId: string;
}

export interface ListarLineasMovimientoRow {
    elementoId: string;
    unidadId: string;
    saldoAnterior: string;
    saldoResultante: string;
    variacion: string;
}

export async function listarLineasMovimiento(client: Client, args: ListarLineasMovimientoArgs): Promise<ListarLineasMovimientoRow[]> {
    const result = await client.query({
        text: listarLineasMovimientoQuery,
        values: [args.negocioId, args.operacionId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            elementoId: row[0],
            unidadId: row[1],
            saldoAnterior: row[2],
            saldoResultante: row[3],
            variacion: row[4]
        };
    });
}

export const buscarReintentoMovimientoQuery = `-- name: BuscarReintentoMovimiento :one
SELECT o.id, COALESCE(o.autor_id = $1 AND m.solicitud = $2::text::jsonb, false)::boolean AS coincide
FROM operaciones_inventario AS o
LEFT JOIN movimientos_inventario AS m ON m.negocio_id = o.negocio_id AND m.operacion_id = o.id
WHERE o.negocio_id = $3 AND o.clave_reintento = $4`;

export interface BuscarReintentoMovimientoArgs {
    autorId: string;
    solicitud: string;
    negocioId: string;
    claveReintento: string;
}

export interface BuscarReintentoMovimientoRow {
    id: string;
    coincide: boolean;
}

export async function buscarReintentoMovimiento(client: Client, args: BuscarReintentoMovimientoArgs): Promise<BuscarReintentoMovimientoRow | null> {
    const result = await client.query({
        text: buscarReintentoMovimientoQuery,
        values: [args.autorId, args.solicitud, args.negocioId, args.claveReintento],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        coincide: row[1]
    };
}

export const insertarMovimientoQuery = `-- name: InsertarMovimiento :exec
INSERT INTO movimientos_inventario (negocio_id, operacion_id, solicitud, motivo, observacion)
VALUES ($1, $2, $3::text::jsonb,
        $4, $5)`;

export interface InsertarMovimientoArgs {
    negocioId: string;
    operacionId: string;
    solicitud: string;
    motivo: string | null;
    observacion: string | null;
}

export async function insertarMovimiento(client: Client, args: InsertarMovimientoArgs): Promise<void> {
    await client.query({
        text: insertarMovimientoQuery,
        values: [args.negocioId, args.operacionId, args.solicitud, args.motivo, args.observacion],
        rowMode: "array"
    });
}

export const calcularSaldoBloqueadoQuery = `-- name: CalcularSaldoBloqueado :one
SELECT e.cantidad::text AS anterior, c.calculo::text AS siguiente, e.version,
       (c.calculo < 0)::boolean AS insuficiente, (c.calculo >= 1000000000000)::boolean AS excedido
FROM existencias_inventario AS e
CROSS JOIN LATERAL (
    SELECT CASE $1::text
        WHEN 'sumar' THEN e.cantidad + $2::numeric
        WHEN 'restar' THEN e.cantidad - $2::numeric
        ELSE $2::numeric
    END AS calculo
) AS c
WHERE e.negocio_id = $3 AND e.elemento_id = $4
FOR UPDATE OF e`;

export interface CalcularSaldoBloqueadoArgs {
    efecto: string;
    cantidad: string;
    negocioId: string;
    elementoId: string;
}

export interface CalcularSaldoBloqueadoRow {
    anterior: string;
    siguiente: string;
    version: string;
    insuficiente: boolean;
    excedido: boolean;
}

export async function calcularSaldoBloqueado(client: Client, args: CalcularSaldoBloqueadoArgs): Promise<CalcularSaldoBloqueadoRow | null> {
    const result = await client.query({
        text: calcularSaldoBloqueadoQuery,
        values: [args.efecto, args.cantidad, args.negocioId, args.elementoId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        anterior: row[0],
        siguiente: row[1],
        version: row[2],
        insuficiente: row[3],
        excedido: row[4]
    };
}

export const actualizarFechaOperacionQuery = `-- name: ActualizarFechaOperacion :exec
UPDATE operaciones_inventario
SET registrada_en = clock_timestamp()
WHERE negocio_id = $1 AND id = $2`;

export interface ActualizarFechaOperacionArgs {
    negocioId: string;
    operacionId: string;
}

export async function actualizarFechaOperacion(client: Client, args: ActualizarFechaOperacionArgs): Promise<void> {
    await client.query({
        text: actualizarFechaOperacionQuery,
        values: [args.negocioId, args.operacionId],
        rowMode: "array"
    });
}

export const insertarLineaMovimientoQuery = `-- name: InsertarLineaMovimiento :exec
INSERT INTO lineas_movimiento (negocio_id, operacion_id, elemento_id, unidad_id, saldo_anterior, saldo_resultante)
VALUES ($1, $2, $3, $4,
        $5, $6)`;

export interface InsertarLineaMovimientoArgs {
    negocioId: string;
    operacionId: string;
    elementoId: string;
    unidadId: string;
    saldoAnterior: string;
    saldoResultante: string;
}

export async function insertarLineaMovimiento(client: Client, args: InsertarLineaMovimientoArgs): Promise<void> {
    await client.query({
        text: insertarLineaMovimientoQuery,
        values: [args.negocioId, args.operacionId, args.elementoId, args.unidadId, args.saldoAnterior, args.saldoResultante],
        rowMode: "array"
    });
}

export const actualizarSaldoQuery = `-- name: ActualizarSaldo :exec
UPDATE existencias_inventario AS e
SET cantidad = $1, actualizada_en = o.registrada_en, version = o.id
FROM operaciones_inventario AS o
WHERE e.negocio_id = $2 AND e.elemento_id = $3
  AND o.negocio_id = e.negocio_id AND o.id = $4`;

export interface ActualizarSaldoArgs {
    cantidad: string;
    negocioId: string;
    elementoId: string;
    operacionId: string;
}

export async function actualizarSaldo(client: Client, args: ActualizarSaldoArgs): Promise<void> {
    await client.query({
        text: actualizarSaldoQuery,
        values: [args.cantidad, args.negocioId, args.elementoId, args.operacionId],
        rowMode: "array"
    });
}
