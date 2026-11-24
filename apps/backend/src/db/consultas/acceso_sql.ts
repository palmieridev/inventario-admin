// Código generado con pnpm db:generate.
import type { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const buscarUsuarioActivoQuery = `-- name: BuscarUsuarioActivo :one
SELECT id, negocio_id, nombre, rol
FROM usuarios
WHERE activo AND id = $1
FOR SHARE`;

export interface BuscarUsuarioActivoArgs {
    usuarioId: string;
}

export interface BuscarUsuarioActivoRow {
    id: string;
    negocioId: string;
    nombre: string;
    rol: string;
}

export async function buscarUsuarioActivo(client: Client, args: BuscarUsuarioActivoArgs): Promise<BuscarUsuarioActivoRow | null> {
    const result = await client.query({
        text: buscarUsuarioActivoQuery,
        values: [args.usuarioId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        negocioId: row[1],
        nombre: row[2],
        rol: row[3]
    };
}

export const buscarUsuarioDeSesionQuery = `-- name: BuscarUsuarioDeSesion :one
SELECT id, negocio_id, nombre, rol
FROM usuarios
WHERE activo AND id = (SELECT usuario_id FROM sesiones WHERE huella = $1)
FOR SHARE`;

export interface BuscarUsuarioDeSesionArgs {
    huella: string;
}

export interface BuscarUsuarioDeSesionRow {
    id: string;
    negocioId: string;
    nombre: string;
    rol: string;
}

export async function buscarUsuarioDeSesion(client: Client, args: BuscarUsuarioDeSesionArgs): Promise<BuscarUsuarioDeSesionRow | null> {
    const result = await client.query({
        text: buscarUsuarioDeSesionQuery,
        values: [args.huella],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        negocioId: row[1],
        nombre: row[2],
        rol: row[3]
    };
}

export const buscarSesionVigenteQuery = `-- name: BuscarSesionVigente :one
SELECT huella
FROM sesiones
WHERE huella = $1 AND usuario_id = $2
  AND vence_en > clock_timestamp()
FOR SHARE`;

export interface BuscarSesionVigenteArgs {
    huella: string;
    usuarioId: string;
}

export interface BuscarSesionVigenteRow {
    huella: string;
}

export async function buscarSesionVigente(client: Client, args: BuscarSesionVigenteArgs): Promise<BuscarSesionVigenteRow | null> {
    const result = await client.query({
        text: buscarSesionVigenteQuery,
        values: [args.huella, args.usuarioId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        huella: row[0]
    };
}

export const buscarCredencialActivaQuery = `-- name: BuscarCredencialActiva :one
SELECT id, clave_derivada FROM usuarios WHERE cuenta = $1 AND activo`;

export interface BuscarCredencialActivaArgs {
    cuenta: string | null;
}

export interface BuscarCredencialActivaRow {
    id: string;
    claveDerivada: string | null;
}

export async function buscarCredencialActiva(client: Client, args: BuscarCredencialActivaArgs): Promise<BuscarCredencialActivaRow | null> {
    const result = await client.query({
        text: buscarCredencialActivaQuery,
        values: [args.cuenta],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        claveDerivada: row[1]
    };
}

export const bloquearCredencialVigenteQuery = `-- name: BloquearCredencialVigente :one
SELECT id, negocio_id, nombre, rol
FROM usuarios
WHERE id = $1 AND activo AND clave_derivada = $2
FOR SHARE`;

export interface BloquearCredencialVigenteArgs {
    usuarioId: string;
    claveDerivada: string | null;
}

export interface BloquearCredencialVigenteRow {
    id: string;
    negocioId: string;
    nombre: string;
    rol: string;
}

export async function bloquearCredencialVigente(client: Client, args: BloquearCredencialVigenteArgs): Promise<BloquearCredencialVigenteRow | null> {
    const result = await client.query({
        text: bloquearCredencialVigenteQuery,
        values: [args.usuarioId, args.claveDerivada],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        negocioId: row[1],
        nombre: row[2],
        rol: row[3]
    };
}

export const eliminarSesionesExpiradasQuery = `-- name: EliminarSesionesExpiradas :exec
DELETE FROM sesiones WHERE usuario_id = $1 AND vence_en <= clock_timestamp()`;

export interface EliminarSesionesExpiradasArgs {
    usuarioId: string;
}

export async function eliminarSesionesExpiradas(client: Client, args: EliminarSesionesExpiradasArgs): Promise<void> {
    await client.query({
        text: eliminarSesionesExpiradasQuery,
        values: [args.usuarioId],
        rowMode: "array"
    });
}

export const crearSesionQuery = `-- name: CrearSesion :exec
INSERT INTO sesiones (huella, usuario_id, vence_en)
VALUES ($1, $2, clock_timestamp() + $3::integer * interval '1 second')`;

export interface CrearSesionArgs {
    huella: string;
    usuarioId: string;
    duracionSegundos: number;
}

export async function crearSesion(client: Client, args: CrearSesionArgs): Promise<void> {
    await client.query({
        text: crearSesionQuery,
        values: [args.huella, args.usuarioId, args.duracionSegundos],
        rowMode: "array"
    });
}

export const bloquearSesionQuery = `-- name: BloquearSesion :one
SELECT usuario_id FROM sesiones WHERE huella = $1 FOR UPDATE`;

export interface BloquearSesionArgs {
    huella: string;
}

export interface BloquearSesionRow {
    usuarioId: string;
}

export async function bloquearSesion(client: Client, args: BloquearSesionArgs): Promise<BloquearSesionRow | null> {
    const result = await client.query({
        text: bloquearSesionQuery,
        values: [args.huella],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        usuarioId: row[0]
    };
}

export const eliminarSesionQuery = `-- name: EliminarSesion :exec
DELETE FROM sesiones WHERE huella = $1`;

export interface EliminarSesionArgs {
    huella: string;
}

export async function eliminarSesion(client: Client, args: EliminarSesionArgs): Promise<void> {
    await client.query({
        text: eliminarSesionQuery,
        values: [args.huella],
        rowMode: "array"
    });
}

export const listarPersonalQuery = `-- name: ListarPersonal :many
SELECT id, nombre, cuenta, activo
FROM usuarios
WHERE negocio_id = $1 AND rol = 'staff'
ORDER BY nombre, id`;

export interface ListarPersonalArgs {
    negocioId: string;
}

export interface ListarPersonalRow {
    id: string;
    nombre: string;
    cuenta: string | null;
    activo: boolean;
}

export async function listarPersonal(client: Client, args: ListarPersonalArgs): Promise<ListarPersonalRow[]> {
    const result = await client.query({
        text: listarPersonalQuery,
        values: [args.negocioId],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            nombre: row[1],
            cuenta: row[2],
            activo: row[3]
        };
    });
}

export const crearPersonalQuery = `-- name: CrearPersonal :one
INSERT INTO usuarios (negocio_id, nombre, cuenta, clave_derivada, rol)
VALUES ($1, $2, $3, $4, 'staff')
RETURNING id, nombre, cuenta, activo`;

export interface CrearPersonalArgs {
    negocioId: string;
    nombre: string;
    cuenta: string | null;
    claveDerivada: string | null;
}

export interface CrearPersonalRow {
    id: string;
    nombre: string;
    cuenta: string | null;
    activo: boolean;
}

export async function crearPersonal(client: Client, args: CrearPersonalArgs): Promise<CrearPersonalRow | null> {
    const result = await client.query({
        text: crearPersonalQuery,
        values: [args.negocioId, args.nombre, args.cuenta, args.claveDerivada],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        nombre: row[1],
        cuenta: row[2],
        activo: row[3]
    };
}

export const bloquearPersonalQuery = `-- name: BloquearPersonal :one
SELECT id, nombre, cuenta, activo
FROM usuarios
WHERE negocio_id = $1 AND id = $2 AND rol = 'staff'
FOR UPDATE`;

export interface BloquearPersonalArgs {
    negocioId: string;
    usuarioId: string;
}

export interface BloquearPersonalRow {
    id: string;
    nombre: string;
    cuenta: string | null;
    activo: boolean;
}

export async function bloquearPersonal(client: Client, args: BloquearPersonalArgs): Promise<BloquearPersonalRow | null> {
    const result = await client.query({
        text: bloquearPersonalQuery,
        values: [args.negocioId, args.usuarioId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        nombre: row[1],
        cuenta: row[2],
        activo: row[3]
    };
}

export const actualizarAccesoPersonalQuery = `-- name: ActualizarAccesoPersonal :one
UPDATE usuarios
SET activo = $1,
    cuenta = COALESCE($2, cuenta),
    clave_derivada = COALESCE($3, clave_derivada)
WHERE id = $4
RETURNING id, nombre, cuenta, activo`;

export interface ActualizarAccesoPersonalArgs {
    activo: boolean;
    cuenta: string | null;
    claveDerivada: string | null;
    usuarioId: string;
}

export interface ActualizarAccesoPersonalRow {
    id: string;
    nombre: string;
    cuenta: string | null;
    activo: boolean;
}

export async function actualizarAccesoPersonal(client: Client, args: ActualizarAccesoPersonalArgs): Promise<ActualizarAccesoPersonalRow | null> {
    const result = await client.query({
        text: actualizarAccesoPersonalQuery,
        values: [args.activo, args.cuenta, args.claveDerivada, args.usuarioId],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0]!;
    return {
        id: row[0],
        nombre: row[1],
        cuenta: row[2],
        activo: row[3]
    };
}

export const eliminarSesionesDeUsuarioQuery = `-- name: EliminarSesionesDeUsuario :exec
DELETE FROM sesiones WHERE usuario_id = $1`;

export interface EliminarSesionesDeUsuarioArgs {
    usuarioId: string;
}

export async function eliminarSesionesDeUsuario(client: Client, args: EliminarSesionesDeUsuarioArgs): Promise<void> {
    await client.query({
        text: eliminarSesionesDeUsuarioQuery,
        values: [args.usuarioId],
        rowMode: "array"
    });
}
