import { createHash } from 'node:crypto';
import type { CuentaSesion, RolUsuario } from '@inventario/contracts';
import type { PoolClient } from 'pg';
import { ErrorInventario, identificador } from '../inventario/validacion.js';

export interface UsuarioInventario {
  id: string;
  negocio_id: string;
  nombre: string;
  rol: RolUsuario;
}

export interface IdentidadSesion {
  huellaSesion: string;
}

// Las llamadas internas de A05 pueden usar un identificador de confianza.
export type IdentidadInventario = string | IdentidadSesion;

export function huellaSesion(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sesionRequerida(): never {
  throw new ErrorInventario('sesion_requerida', 'Inicia sesión para acceder al inventario.');
}

export async function autorizar(
  cliente: PoolClient,
  identidad: IdentidadInventario,
  rol?: 'admin',
): Promise<UsuarioInventario> {
  const sesion = typeof identidad === 'string' ? undefined : identidad.huellaSesion;
  const { rows: [usuario] } = await cliente.query<UsuarioInventario>(
    'SELECT id, negocio_id, nombre, rol FROM usuarios WHERE activo AND id = ' +
      (sesion !== undefined ? '(SELECT usuario_id FROM sesiones WHERE huella = $1)' : '$1') +
      ' FOR SHARE',
    [typeof identidad === 'string' ? identificador(identidad, 'El usuario') : identidad.huellaSesion],
  );

  if (sesion !== undefined) {
    if (!usuario) sesionRequerida();
    // La cuenta se bloquea antes de la sesión, en el mismo orden que la revocación.
    const vigente = await cliente.query(
      'SELECT 1 FROM sesiones WHERE huella = $1 AND usuario_id = $2 AND vence_en > clock_timestamp() FOR SHARE',
      [sesion, usuario.id],
    );
    if (!vigente.rowCount) sesionRequerida();
  }

  if (!usuario || (rol && usuario.rol !== rol)) {
    throw new ErrorInventario('acceso_denegado', 'La cuenta no tiene permiso para realizar esta operación.');
  }
  return usuario;
}

export function datosSesion(usuario: UsuarioInventario): CuentaSesion {
  return { id: usuario.id, negocioId: usuario.negocio_id, nombre: usuario.nombre, rol: usuario.rol };
}
