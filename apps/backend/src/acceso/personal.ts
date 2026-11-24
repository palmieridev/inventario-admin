import type { CuentaPersonal } from '@inventario/contracts';
import type { Pool } from 'pg';
import { enTransaccion } from '../db/transaccion.js';
import { ErrorInventario, identificador, invalidos, objeto, texto } from '../inventario/validacion.js';
import { nombreCuenta, prepararClave } from './credenciales.js';
import { autorizar, type IdentidadSesion } from './identidad.js';

const camposPersonal = 'id, nombre, cuenta, activo';

async function guardarCuenta<T>(operacion: () => Promise<T>): Promise<T> {
  try {
    return await operacion();
  } catch (error) {
    if (error instanceof Error && 'constraint' in error && error.constraint === 'usuarios_cuenta_key') {
      throw new ErrorInventario('cuenta_ocupada', 'Elige otro nombre de cuenta.');
    }
    throw error;
  }
}

export function crearServicioPersonal(pool: Pool) {
  return {
    listar(identidad: IdentidadSesion): Promise<CuentaPersonal[]> {
      return enTransaccion(pool, async (cliente) => {
        const { negocio_id } = await autorizar(cliente, identidad, 'admin');
        const { rows } = await cliente.query<CuentaPersonal>(
          'SELECT ' + camposPersonal + " FROM usuarios WHERE negocio_id = $1 AND rol = 'staff' ORDER BY nombre, id",
          [negocio_id],
        );
        return rows;
      });
    },

    darDeAlta(identidad: IdentidadSesion, entrada: unknown): Promise<CuentaPersonal> {
      return guardarCuenta(() => enTransaccion(pool, async (cliente) => {
        const { negocio_id } = await autorizar(cliente, identidad, 'admin');
        const datos = objeto(entrada);
        const nombre = texto(datos.nombre, 'El nombre', 120);
        const cuenta = nombreCuenta(datos.cuenta);
        const clave = await prepararClave(datos.contrasena);
        const { rows: [personal] } = await cliente.query<CuentaPersonal>(
          "INSERT INTO usuarios (negocio_id, nombre, cuenta, clave_derivada, rol) VALUES ($1, $2, $3, $4, 'staff') " +
          'RETURNING ' + camposPersonal,
          [negocio_id, nombre, cuenta, clave],
        );
        return personal!;
      }));
    },

    cambiarAcceso(identidad: IdentidadSesion, personalId: string, entrada: unknown): Promise<CuentaPersonal> {
      return guardarCuenta(() => enTransaccion(pool, async (cliente) => {
        const { negocio_id } = await autorizar(cliente, identidad, 'admin');
        const id = identificador(personalId, 'La persona');
        const datos = objeto(entrada);
        const { activo } = datos;
        if (typeof activo !== 'boolean') invalidos('Indica si se habilitará el acceso.');

        const { rows: [actual] } = await cliente.query<CuentaPersonal>(
          'SELECT ' + camposPersonal + " FROM usuarios WHERE negocio_id = $1 AND id = $2 AND rol = 'staff' FOR UPDATE",
          [negocio_id, id],
        );
        if (!actual) throw new ErrorInventario('no_encontrado', 'La cuenta de personal no existe en el negocio.');

        let cuentaNueva: string | null = null;
        let claveNueva: string | null = null;
        if (activo && actual.cuenta === null) {
          const credenciales = objeto(datos.credenciales);
          cuentaNueva = nombreCuenta(credenciales.cuenta);
          claveNueva = await prepararClave(credenciales.contrasena);
        } else if (datos.credenciales !== undefined) {
          invalidos('Las credenciales solo se asignan al habilitar una cuenta por primera vez.');
        }

        const { rows: [personal] } = await cliente.query<CuentaPersonal>(
          'UPDATE usuarios SET activo = $2, cuenta = COALESCE($3, cuenta), clave_derivada = COALESCE($4, clave_derivada) ' +
          'WHERE id = $1 RETURNING ' + camposPersonal,
          [id, activo, cuentaNueva, claveNueva],
        );
        if (!activo) await cliente.query('DELETE FROM sesiones WHERE usuario_id = $1', [id]);
        return personal!;
      }));
    },
  };
}
