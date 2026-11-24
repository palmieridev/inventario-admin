import type { CuentaPersonal } from '@inventario/contracts';
import type { Pool } from 'pg';
import {
  actualizarAccesoPersonal, bloquearPersonal, crearPersonal, eliminarSesionesDeUsuario, listarPersonal,
} from '../db/consultas/acceso_sql.js';
import { enTransaccion } from '../db/transaccion.js';
import { ErrorInventario, identificador, invalidos, objeto, texto } from '../inventario/validacion.js';
import { nombreCuenta, prepararClave } from './credenciales.js';
import { autorizar, type IdentidadSesion } from './identidad.js';

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
        const { negocioId } = await autorizar(cliente, identidad, 'admin');
        return listarPersonal(cliente, { negocioId });
      });
    },

    darDeAlta(identidad: IdentidadSesion, entrada: unknown): Promise<CuentaPersonal> {
      return guardarCuenta(() => enTransaccion(pool, async (cliente) => {
        const { negocioId } = await autorizar(cliente, identidad, 'admin');
        const datos = objeto(entrada);
        const nombre = texto(datos.nombre, 'El nombre', 120);
        const cuenta = nombreCuenta(datos.cuenta);
        const clave = await prepararClave(datos.contrasena);
        const personal = await crearPersonal(cliente, { negocioId, nombre, cuenta, claveDerivada: clave });
        return personal!;
      }));
    },

    cambiarAcceso(identidad: IdentidadSesion, personalId: string, entrada: unknown): Promise<CuentaPersonal> {
      return guardarCuenta(() => enTransaccion(pool, async (cliente) => {
        const { negocioId } = await autorizar(cliente, identidad, 'admin');
        const id = identificador(personalId, 'La persona');
        const datos = objeto(entrada);
        const { activo } = datos;
        if (typeof activo !== 'boolean') invalidos('Indica si se habilitará el acceso.');

        const actual = await bloquearPersonal(cliente, { negocioId, usuarioId: id });
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

        const personal = await actualizarAccesoPersonal(cliente, {
          usuarioId: id, activo, cuenta: cuentaNueva, claveDerivada: claveNueva,
        });
        if (!activo) await eliminarSesionesDeUsuario(cliente, { usuarioId: id });
        return personal!;
      }));
    },
  };
}
