import { createHash } from 'node:crypto';
import type { CuentaSesion } from '@inventario/contracts';
import type { PoolClient } from 'pg';
import {
  buscarSesionVigente, buscarUsuarioActivo, buscarUsuarioDeSesion, type BuscarUsuarioActivoRow,
} from '../db/consultas/acceso_sql.js';
import { ErrorInventario, identificador } from '../inventario/validacion.js';

export interface IdentidadSesion {
  huellaSesion: string;
  cuentaEsperada?: string;
}

// Las llamadas internas de A05 pueden usar un identificador de confianza.
export type IdentidadInventario = string | IdentidadSesion;

export function huellaSesion(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sesionRequerida(): never {
  throw new ErrorInventario('sesion_requerida', 'Inicia sesión para acceder al inventario.');
}

export function comprobarCuentaEsperada(identidad: IdentidadSesion, cuentaId: string): void {
  if (identidad.cuentaEsperada && identidad.cuentaEsperada !== cuentaId) {
    throw new ErrorInventario('sesion_cambiada', 'La cuenta cambió. Vuelve a abrir la pantalla para continuar.');
  }
}

export async function autorizar(
  cliente: PoolClient,
  identidad: IdentidadInventario,
  rol?: 'admin',
): Promise<BuscarUsuarioActivoRow> {
  const usuario = typeof identidad === 'string'
    ? await buscarUsuarioActivo(cliente, { usuarioId: identificador(identidad, 'El usuario') })
    : await buscarUsuarioDeSesion(cliente, { huella: identidad.huellaSesion });

  if (typeof identidad !== 'string') {
    if (!usuario) sesionRequerida();
    // La cuenta se bloquea antes de la sesión, en el mismo orden que la revocación.
    const vigente = await buscarSesionVigente(cliente, { huella: identidad.huellaSesion, usuarioId: usuario.id });
    if (!vigente) sesionRequerida();
    comprobarCuentaEsperada(identidad, usuario.id);
  }

  if (!usuario || (rol && usuario.rol !== rol)) {
    throw new ErrorInventario('acceso_denegado', 'La cuenta no tiene permiso para realizar esta operación.');
  }
  return usuario;
}

export function datosSesion({ id, negocioId, nombre, rol }: BuscarUsuarioActivoRow): CuentaSesion {
  if (rol !== 'admin' && rol !== 'staff') throw new Error('La cuenta tiene un rol inválido.');
  return { id, negocioId, nombre, rol };
}
