import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { enTransaccion } from '../db/transaccion.js';
import { ErrorInventario, objeto } from '../inventario/validacion.js';
import { coincideClave, contrasenaValida, nombreCuenta } from './credenciales.js';
import { autorizar, datosSesion, huellaSesion, type IdentidadSesion, type UsuarioInventario } from './identidad.js';

export const DURACION_SESION_SEGUNDOS = 12 * 60 * 60;

function credencialesInvalidas(): never {
  throw new ErrorInventario('credenciales_invalidas', 'La cuenta o la contraseña es incorrecta.');
}

export function crearServicioSesion(pool: Pool) {
  return {
    async iniciar(entrada: unknown) {
      const datos = objeto(entrada);
      const cuenta = nombreCuenta(datos.cuenta);
      const contrasena = datos.contrasena;
      if (!contrasenaValida(contrasena)) credencialesInvalidas();

      const { rows: [usuario] } = await pool.query<{ id: string; clave_derivada: string }>(
        'SELECT id, clave_derivada FROM usuarios WHERE cuenta = $1 AND activo',
        [cuenta],
      );
      if (!await coincideClave(contrasena, usuario?.clave_derivada) || !usuario) credencialesInvalidas();

      return enTransaccion(pool, async (cliente) => {
        const { rows: [vigente] } = await cliente.query<UsuarioInventario>(
          'SELECT id, negocio_id, nombre, rol FROM usuarios WHERE id = $1 AND activo AND clave_derivada = $2 FOR SHARE',
          [usuario.id, usuario.clave_derivada],
        );
        if (!vigente) credencialesInvalidas();

        const token = randomBytes(32).toString('base64url');
        await cliente.query(
          'DELETE FROM sesiones WHERE usuario_id = $1 AND vence_en <= clock_timestamp()',
          [vigente.id],
        );
        await cliente.query(
          "INSERT INTO sesiones (huella, usuario_id, vence_en) VALUES ($1, $2, clock_timestamp() + $3 * interval '1 second')",
          [huellaSesion(token), vigente.id, DURACION_SESION_SEGUNDOS],
        );
        return { token, cuenta: datosSesion(vigente) };
      });
    },

    consultar(identidad: IdentidadSesion) {
      return enTransaccion(pool, async (cliente) => datosSesion(await autorizar(cliente, identidad)));
    },

    async cerrar(identidad: IdentidadSesion): Promise<void> {
      await pool.query('DELETE FROM sesiones WHERE huella = $1', [identidad.huellaSesion]);
    },
  };
}
