// Código generado con pnpm db:generate.
import type { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const buscarUnidadQuery = `-- name: BuscarUnidad :one
SELECT id FROM unidades_medida WHERE negocio_id = $1 AND id = $2`;

export interface BuscarUnidadArgs {
    negocioId: string;
    unidadId: string;
}

export interface BuscarUnidadRow {
    id: string;
}

export async function buscarUnidad(client: Client, args: BuscarUnidadArgs): Promise<BuscarUnidadRow | null> {
    const result = await client.query({
        text: buscarUnidadQuery,
        values: [args.negocioId, args.unidadId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0]
    };
}

export const listarUnidadesQuery = `-- name: ListarUnidades :many
SELECT id, nombre, simbolo, decimales
FROM unidades_medida
WHERE negocio_id = $1
ORDER BY nombre, id`;

export interface ListarUnidadesArgs {
    negocioId: string;
}

export interface ListarUnidadesRow {
    id: string;
    nombre: string;
    simbolo: string;
    decimales: number;
}

export async function listarUnidades(client: Client, args: ListarUnidadesArgs): Promise<ListarUnidadesRow[]> {
    const result = await client.query({
        text: listarUnidadesQuery,
        values: [args.negocioId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            nombre: row[1],
            simbolo: row[2],
            decimales: row[3]
        };
    });
}

export const crearUnidadQuery = `-- name: CrearUnidad :one
INSERT INTO unidades_medida (negocio_id, nombre, simbolo, decimales)
VALUES ($1, $2, $3, $4)
RETURNING id, nombre, simbolo, decimales`;

export interface CrearUnidadArgs {
    negocioId: string;
    nombre: string;
    simbolo: string;
    decimales: number;
}

export interface CrearUnidadRow {
    id: string;
    nombre: string;
    simbolo: string;
    decimales: number;
}

export async function crearUnidad(client: Client, args: CrearUnidadArgs): Promise<CrearUnidadRow | null> {
    const result = await client.query({
        text: crearUnidadQuery,
        values: [args.negocioId, args.nombre, args.simbolo, args.decimales],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        nombre: row[1],
        simbolo: row[2],
        decimales: row[3]
    };
}

export const bloquearUnidadQuery = `-- name: BloquearUnidad :one
SELECT id, nombre, simbolo, decimales
FROM unidades_medida
WHERE negocio_id = $1 AND id = $2
FOR UPDATE`;

export interface BloquearUnidadArgs {
    negocioId: string;
    unidadId: string;
}

export interface BloquearUnidadRow {
    id: string;
    nombre: string;
    simbolo: string;
    decimales: number;
}

export async function bloquearUnidad(client: Client, args: BloquearUnidadArgs): Promise<BloquearUnidadRow | null> {
    const result = await client.query({
        text: bloquearUnidadQuery,
        values: [args.negocioId, args.unidadId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        nombre: row[1],
        simbolo: row[2],
        decimales: row[3]
    };
}

export const buscarAperturaDeUnidadQuery = `-- name: BuscarAperturaDeUnidad :one
SELECT elemento_id
FROM aperturas_inventario
WHERE negocio_id = $1 AND unidad_id = $2
LIMIT 1`;

export interface BuscarAperturaDeUnidadArgs {
    negocioId: string;
    unidadId: string;
}

export interface BuscarAperturaDeUnidadRow {
    elementoId: string;
}

export async function buscarAperturaDeUnidad(client: Client, args: BuscarAperturaDeUnidadArgs): Promise<BuscarAperturaDeUnidadRow | null> {
    const result = await client.query({
        text: buscarAperturaDeUnidadQuery,
        values: [args.negocioId, args.unidadId],
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

export const actualizarUnidadQuery = `-- name: ActualizarUnidad :one
UPDATE unidades_medida
SET nombre = $1, simbolo = $2, decimales = $3
WHERE negocio_id = $4 AND id = $5
RETURNING id, nombre, simbolo, decimales`;

export interface ActualizarUnidadArgs {
    nombre: string;
    simbolo: string;
    decimales: number;
    negocioId: string;
    unidadId: string;
}

export interface ActualizarUnidadRow {
    id: string;
    nombre: string;
    simbolo: string;
    decimales: number;
}

export async function actualizarUnidad(client: Client, args: ActualizarUnidadArgs): Promise<ActualizarUnidadRow | null> {
    const result = await client.query({
        text: actualizarUnidadQuery,
        values: [args.nombre, args.simbolo, args.decimales, args.negocioId, args.unidadId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        nombre: row[1],
        simbolo: row[2],
        decimales: row[3]
    };
}

export const listarElementosQuery = `-- name: ListarElementos :many
SELECT id, unidad_id, categoria, nombre, variante, activo
FROM elementos_inventario
WHERE negocio_id = $1 AND (activo OR $2::boolean)
ORDER BY categoria, nombre, variante, id`;

export interface ListarElementosArgs {
    negocioId: string;
    incluirInactivos: boolean;
}

export interface ListarElementosRow {
    id: string;
    unidadId: string;
    categoria: string;
    nombre: string;
    variante: string | null;
    activo: boolean;
}

export async function listarElementos(client: Client, args: ListarElementosArgs): Promise<ListarElementosRow[]> {
    const result = await client.query({
        text: listarElementosQuery,
        values: [args.negocioId, args.incluirInactivos],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            unidadId: row[1],
            categoria: row[2],
            nombre: row[3],
            variante: row[4],
            activo: row[5]
        };
    });
}

export const crearElementoQuery = `-- name: CrearElemento :one
INSERT INTO elementos_inventario (negocio_id, unidad_id, categoria, nombre, variante, activo)
VALUES ($1, $2, $3, $4,
        $5, $6)
RETURNING id, unidad_id, categoria, nombre, variante, activo`;

export interface CrearElementoArgs {
    negocioId: string;
    unidadId: string;
    categoria: string;
    nombre: string;
    variante: string | null;
    activo: boolean;
}

export interface CrearElementoRow {
    id: string;
    unidadId: string;
    categoria: string;
    nombre: string;
    variante: string | null;
    activo: boolean;
}

export async function crearElemento(client: Client, args: CrearElementoArgs): Promise<CrearElementoRow | null> {
    const result = await client.query({
        text: crearElementoQuery,
        values: [args.negocioId, args.unidadId, args.categoria, args.nombre, args.variante, args.activo],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        unidadId: row[1],
        categoria: row[2],
        nombre: row[3],
        variante: row[4],
        activo: row[5]
    };
}

export const bloquearElementoQuery = `-- name: BloquearElemento :one
SELECT id, unidad_id, categoria, nombre, variante, activo
FROM elementos_inventario
WHERE negocio_id = $1 AND id = $2
FOR UPDATE`;

export interface BloquearElementoArgs {
    negocioId: string;
    elementoId: string;
}

export interface BloquearElementoRow {
    id: string;
    unidadId: string;
    categoria: string;
    nombre: string;
    variante: string | null;
    activo: boolean;
}

export async function bloquearElemento(client: Client, args: BloquearElementoArgs): Promise<BloquearElementoRow | null> {
    const result = await client.query({
        text: bloquearElementoQuery,
        values: [args.negocioId, args.elementoId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        unidadId: row[1],
        categoria: row[2],
        nombre: row[3],
        variante: row[4],
        activo: row[5]
    };
}

export const buscarAperturaDeElementoQuery = `-- name: BuscarAperturaDeElemento :one
SELECT elemento_id
FROM aperturas_inventario
WHERE negocio_id = $1 AND elemento_id = $2`;

export interface BuscarAperturaDeElementoArgs {
    negocioId: string;
    elementoId: string;
}

export interface BuscarAperturaDeElementoRow {
    elementoId: string;
}

export async function buscarAperturaDeElemento(client: Client, args: BuscarAperturaDeElementoArgs): Promise<BuscarAperturaDeElementoRow | null> {
    const result = await client.query({
        text: buscarAperturaDeElementoQuery,
        values: [args.negocioId, args.elementoId],
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

export const actualizarElementoQuery = `-- name: ActualizarElemento :one
UPDATE elementos_inventario
SET unidad_id = $1, categoria = $2, nombre = $3,
    variante = $4, activo = $5
WHERE negocio_id = $6 AND id = $7
RETURNING id, unidad_id, categoria, nombre, variante, activo`;

export interface ActualizarElementoArgs {
    unidadId: string;
    categoria: string;
    nombre: string;
    variante: string | null;
    activo: boolean;
    negocioId: string;
    elementoId: string;
}

export interface ActualizarElementoRow {
    id: string;
    unidadId: string;
    categoria: string;
    nombre: string;
    variante: string | null;
    activo: boolean;
}

export async function actualizarElemento(client: Client, args: ActualizarElementoArgs): Promise<ActualizarElementoRow | null> {
    const result = await client.query({
        text: actualizarElementoQuery,
        values: [args.unidadId, args.categoria, args.nombre, args.variante, args.activo, args.negocioId, args.elementoId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        unidadId: row[1],
        categoria: row[2],
        nombre: row[3],
        variante: row[4],
        activo: row[5]
    };
}

export const leerUnidadBloqueadaQuery = `-- name: LeerUnidadBloqueada :one
SELECT nombre, simbolo, decimales
FROM unidades_medida
WHERE negocio_id = $1 AND id = $2
FOR SHARE`;

export interface LeerUnidadBloqueadaArgs {
    negocioId: string;
    unidadId: string;
}

export interface LeerUnidadBloqueadaRow {
    nombre: string;
    simbolo: string;
    decimales: number;
}

export async function leerUnidadBloqueada(client: Client, args: LeerUnidadBloqueadaArgs): Promise<LeerUnidadBloqueadaRow | null> {
    const result = await client.query({
        text: leerUnidadBloqueadaQuery,
        values: [args.negocioId, args.unidadId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        nombre: row[0],
        simbolo: row[1],
        decimales: row[2]
    };
}
