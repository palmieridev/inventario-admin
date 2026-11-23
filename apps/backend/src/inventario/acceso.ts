import type { PoolClient } from 'pg';
import { ErrorInventario, identificador } from './validacion.js';

interface UsuarioInventario {
  id: string;
  negocio_id: string;
  rol: 'admin' | 'staff';
}

// El id debe proceder de la identidad autenticada del servidor, no de la solicitud.
export async function autorizar(cliente: PoolClient, usuarioId: string, rol?: 'admin'): Promise<UsuarioInventario> {
  const { rows: [usuario] } = await cliente.query<UsuarioInventario>(
    'SELECT id, negocio_id, rol FROM usuarios WHERE id = $1 AND activo FOR SHARE',
    [identificador(usuarioId, 'El usuario')],
  );
  if (!usuario || (rol && usuario.rol !== rol)) {
    throw new ErrorInventario('acceso_denegado', 'La cuenta no tiene permiso para realizar esta operación.');
  }
  return usuario;
}
