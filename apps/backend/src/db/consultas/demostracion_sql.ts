// Código generado con pnpm db:generate.
import type { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const insertarNegocioDemostracionQuery = `-- name: InsertarNegocioDemostracion :exec
INSERT INTO negocios (id, nombre)
VALUES ($1, $2)
ON CONFLICT (id) DO NOTHING`;

export interface InsertarNegocioDemostracionArgs {
    negocioId: string;
    nombre: string;
}

export async function insertarNegocioDemostracion(client: Client, args: InsertarNegocioDemostracionArgs): Promise<void> {
    await client.query({
        text: insertarNegocioDemostracionQuery,
        values: [args.negocioId, args.nombre],
        rowMode: "array"
    });
}

export const bloquearNegocioDemostracionQuery = `-- name: BloquearNegocioDemostracion :exec
SELECT id FROM negocios WHERE id = $1 FOR UPDATE`;

export interface BloquearNegocioDemostracionArgs {
    negocioId: string;
}

export interface BloquearNegocioDemostracionRow {
    id: string;
}

export async function bloquearNegocioDemostracion(client: Client, args: BloquearNegocioDemostracionArgs): Promise<void> {
    await client.query({
        text: bloquearNegocioDemostracionQuery,
        values: [args.negocioId],
        rowMode: "array"
    });
}

export const buscarCuentaDemostracionQuery = `-- name: BuscarCuentaDemostracion :one
SELECT negocio_id, rol FROM usuarios WHERE cuenta = $1`;

export interface BuscarCuentaDemostracionArgs {
    cuenta: string | null;
}

export interface BuscarCuentaDemostracionRow {
    negocioId: string;
    rol: string;
}

export async function buscarCuentaDemostracion(client: Client, args: BuscarCuentaDemostracionArgs): Promise<BuscarCuentaDemostracionRow | null> {
    const result = await client.query({
        text: buscarCuentaDemostracionQuery,
        values: [args.cuenta],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        negocioId: row[0],
        rol: row[1]
    };
}

export const insertarCuentaDemostracionQuery = `-- name: InsertarCuentaDemostracion :exec
INSERT INTO usuarios (negocio_id, nombre, cuenta, clave_derivada, rol)
VALUES ($1, $2, $3, $4, $5)`;

export interface InsertarCuentaDemostracionArgs {
    negocioId: string;
    nombre: string;
    cuenta: string | null;
    claveDerivada: string | null;
    rol: string;
}

export async function insertarCuentaDemostracion(client: Client, args: InsertarCuentaDemostracionArgs): Promise<void> {
    await client.query({
        text: insertarCuentaDemostracionQuery,
        values: [args.negocioId, args.nombre, args.cuenta, args.claveDerivada, args.rol],
        rowMode: "array"
    });
}

export const insertarPrimeraJornadaQuery = `-- name: InsertarPrimeraJornada :one
INSERT INTO jornadas (negocio_id)
SELECT $1::uuid
WHERE NOT EXISTS (SELECT 1 FROM jornadas WHERE negocio_id = $1)
RETURNING id`;

export interface InsertarPrimeraJornadaArgs {
    negocioId: string;
}

export interface InsertarPrimeraJornadaRow {
    id: string;
}

export async function insertarPrimeraJornada(client: Client, args: InsertarPrimeraJornadaArgs): Promise<InsertarPrimeraJornadaRow | null> {
    const result = await client.query({
        text: insertarPrimeraJornadaQuery,
        values: [args.negocioId],
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
