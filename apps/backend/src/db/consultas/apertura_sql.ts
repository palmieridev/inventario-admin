// Código generado con pnpm db:generate.
import type { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const buscarAperturaPorClaveQuery = `-- name: BuscarAperturaPorClave :one
SELECT o.id AS operacion_id, o.autor_id, o.jornada_id, o.registrada_en, a.elemento_id, a.unidad_id,
       a.cantidad::text AS cantidad
FROM operaciones_inventario AS o
JOIN aperturas_inventario AS a ON a.negocio_id = o.negocio_id AND a.operacion_id = o.id
WHERE o.negocio_id = $1 AND o.clave_reintento = $2`;

export interface BuscarAperturaPorClaveArgs {
    negocioId: string;
    claveReintento: string;
}

export interface BuscarAperturaPorClaveRow {
    operacionId: string;
    autorId: string;
    jornadaId: string;
    registradaEn: Date;
    elementoId: string;
    unidadId: string;
    cantidad: string;
}

export async function buscarAperturaPorClave(client: Client, args: BuscarAperturaPorClaveArgs): Promise<BuscarAperturaPorClaveRow | null> {
    const result = await client.query({
        text: buscarAperturaPorClaveQuery,
        values: [args.negocioId, args.claveReintento],
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
        registradaEn: row[3],
        elementoId: row[4],
        unidadId: row[5],
        cantidad: row[6]
    };
}

export const listarJornadasAbiertasQuery = `-- name: ListarJornadasAbiertas :many
SELECT id, iniciada_en
FROM jornadas
WHERE negocio_id = $1 AND iniciada_en <= CURRENT_TIMESTAMP AND cerrada_en IS NULL
ORDER BY iniciada_en DESC, id`;

export interface ListarJornadasAbiertasArgs {
    negocioId: string;
}

export interface ListarJornadasAbiertasRow {
    id: string;
    iniciadaEn: Date;
}

export async function listarJornadasAbiertas(client: Client, args: ListarJornadasAbiertasArgs): Promise<ListarJornadasAbiertasRow[]> {
    const result = await client.query({
        text: listarJornadasAbiertasQuery,
        values: [args.negocioId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            iniciadaEn: row[1]
        };
    });
}

export const leerJornadaBloqueadaQuery = `-- name: LeerJornadaBloqueada :one
SELECT (iniciada_en <= CURRENT_TIMESTAMP)::boolean AS iniciada, cerrada_en
FROM jornadas
WHERE negocio_id = $1 AND id = $2
FOR SHARE`;

export interface LeerJornadaBloqueadaArgs {
    negocioId: string;
    jornadaId: string;
}

export interface LeerJornadaBloqueadaRow {
    iniciada: boolean;
    cerradaEn: Date | null;
}

export async function leerJornadaBloqueada(client: Client, args: LeerJornadaBloqueadaArgs): Promise<LeerJornadaBloqueadaRow | null> {
    const result = await client.query({
        text: leerJornadaBloqueadaQuery,
        values: [args.negocioId, args.jornadaId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        iniciada: row[0],
        cerradaEn: row[1]
    };
}

export const registrarOperacionQuery = `-- name: RegistrarOperacion :one
INSERT INTO operaciones_inventario (negocio_id, autor_id, jornada_id, tipo, clave_reintento)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (negocio_id, clave_reintento) DO NOTHING
RETURNING id, registrada_en`;

export interface RegistrarOperacionArgs {
    negocioId: string;
    autorId: string;
    jornadaId: string;
    tipo: string;
    claveReintento: string;
}

export interface RegistrarOperacionRow {
    id: string;
    registradaEn: Date;
}

export async function registrarOperacion(client: Client, args: RegistrarOperacionArgs): Promise<RegistrarOperacionRow | null> {
    const result = await client.query({
        text: registrarOperacionQuery,
        values: [args.negocioId, args.autorId, args.jornadaId, args.tipo, args.claveReintento],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        registradaEn: row[1]
    };
}

export const insertarAperturaQuery = `-- name: InsertarApertura :one
INSERT INTO aperturas_inventario (negocio_id, elemento_id, unidad_id, operacion_id, cantidad)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (negocio_id, elemento_id) DO NOTHING
RETURNING elemento_id`;

export interface InsertarAperturaArgs {
    negocioId: string;
    elementoId: string;
    unidadId: string;
    operacionId: string;
    cantidad: string;
}

export interface InsertarAperturaRow {
    elementoId: string;
}

export async function insertarApertura(client: Client, args: InsertarAperturaArgs): Promise<InsertarAperturaRow | null> {
    const result = await client.query({
        text: insertarAperturaQuery,
        values: [args.negocioId, args.elementoId, args.unidadId, args.operacionId, args.cantidad],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        elementoId: row[0]
    };
}

export const insertarExistenciaQuery = `-- name: InsertarExistencia :exec
INSERT INTO existencias_inventario (negocio_id, elemento_id, cantidad, actualizada_en)
SELECT $1, $2::uuid, $3::numeric, registrada_en
FROM operaciones_inventario
WHERE negocio_id = $1 AND id = $4`;

export interface InsertarExistenciaArgs {
    negocioId: string;
    elementoId: string;
    cantidad: string;
    operacionId: string;
}

export async function insertarExistencia(client: Client, args: InsertarExistenciaArgs): Promise<void> {
    await client.query({
        text: insertarExistenciaQuery,
        values: [args.negocioId, args.elementoId, args.cantidad, args.operacionId],
        rowMode: "array"
    });
}

export const buscarExistenciaQuery = `-- name: BuscarExistencia :one
SELECT e.id AS elemento_id, e.unidad_id, s.cantidad, s.actualizada_en
FROM elementos_inventario AS e
LEFT JOIN existencias_inventario AS s ON s.negocio_id = e.negocio_id AND s.elemento_id = e.id
WHERE e.negocio_id = $1 AND e.id = $2
  AND (e.activo OR $3::boolean)`;

export interface BuscarExistenciaArgs {
    negocioId: string;
    elementoId: string;
    incluirInactivos: boolean;
}

export interface BuscarExistenciaRow {
    elementoId: string;
    unidadId: string;
    cantidad: string | null;
    actualizadaEn: Date | null;
}

export async function buscarExistencia(client: Client, args: BuscarExistenciaArgs): Promise<BuscarExistenciaRow | null> {
    const result = await client.query({
        text: buscarExistenciaQuery,
        values: [args.negocioId, args.elementoId, args.incluirInactivos],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        elementoId: row[0],
        unidadId: row[1],
        cantidad: row[2],
        actualizadaEn: row[3]
    };
}
