import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import {
  bloquearCredencialVigente, bloquearSesion, buscarCredencialActiva, crearSesion, eliminarSesion,
  eliminarSesionesExpiradas,
} from '../db/consultas/acceso_sql.js';
import { enTransaccion } from '../db/transaccion.js';
import { ErrorInventario, objeto } from '../inventario/validacion.js';
import { coincideClave, contrasenaValida, nombreCuenta } from './credenciales.js';
import { autorizar, comprobarCuentaEsperada, datosSesion, huellaSesion, type IdentidadSesion } from './identidad.js';

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

      const usuario = await buscarCredencialActiva(pool, { cuenta });
      if (!await coincideClave(contrasena, usuario?.claveDerivada ?? undefined) || !usuario) credencialesInvalidas();

      return enTransaccion(pool, async (cliente) => {
        const vigente = await bloquearCredencialVigente(cliente, {
          usuarioId: usuario.id,
          claveDerivada: usuario.claveDerivada,
        });
        if (!vigente) credencialesInvalidas();

        const token = randomBytes(32).toString('base64url');
        await eliminarSesionesExpiradas(cliente, { usuarioId: vigente.id });
        await crearSesion(cliente, {
          huella: huellaSesion(token),
          usuarioId: vigente.id,
          duracionSegundos: DURACION_SESION_SEGUNDOS,
        });
        return { token, cuenta: datosSesion(vigente) };
      });
    },

    consultar(identidad: IdentidadSesion) {
      return enTransaccion(pool, async (cliente) => datosSesion(await autorizar(cliente, identidad)));
    },

    async cerrar(identidad: IdentidadSesion): Promise<void> {
      await enTransaccion(pool, async (cliente) => {
        if (identidad.cuentaEsperada) {
          const sesion = await bloquearSesion(cliente, { huella: identidad.huellaSesion });
          if (!sesion) return;
          comprobarCuentaEsperada(identidad, sesion.usuarioId);
        }
        await eliminarSesion(cliente, { huella: identidad.huellaSesion });
      });
    },
  };
}
