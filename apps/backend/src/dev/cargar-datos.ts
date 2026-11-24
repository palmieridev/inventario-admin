import { prepararClave } from '../acceso/credenciales.js';
import { config } from '../config.js';
import { crearElemento, crearUnidad } from '../db/consultas/catalogo_sql.js';
import {
  bloquearNegocioDemostracion, buscarCuentaDemostracion, insertarCuentaDemostracion, insertarNegocioDemostracion,
  insertarPrimeraJornada,
} from '../db/consultas/demostracion_sql.js';
import { pool } from '../db/pool.js';
import { enTransaccion } from '../db/transaccion.js';

const negocios = [
  {
    id: '4462d54b-07de-4f58-975d-8188dd9cb051',
    nombre: 'Tamales de demostración',
    sufijo: 'tamales',
    elementos: [
      { categoria: 'preparado', nombre: 'Tamal', variante: 'Dulce' },
      { categoria: 'preparado', nombre: 'Tamal', variante: 'Verde' },
    ],
  },
  {
    id: 'e426dcc6-e29b-4535-ba41-8a334e51b0a3',
    nombre: 'Bebidas de demostración',
    sufijo: 'bebidas',
    elementos: [{ categoria: 'bebida', nombre: 'Agua', variante: null }],
  },
];

async function cargarDatos(): Promise<void> {
  if (process.env.NODE_ENV === 'production' || !['127.0.0.1', '::1', 'localhost'].includes(config.database.host)) {
    throw new Error('La carga de demostración requiere PostgreSQL de desarrollo local.');
  }
  const contrasena = process.env.INVENTARIO_DEV_PASSWORD;
  if (!contrasena) throw new Error('Define INVENTARIO_DEV_PASSWORD con una contraseña de desarrollo.');

  await enTransaccion(pool, async (cliente) => {
    for (const negocio of negocios) {
      const negocioId = negocio.id;
      await insertarNegocioDemostracion(cliente, { negocioId, nombre: negocio.nombre });
      // Una segunda ejecución conserva cuentas, jornadas, catálogo y conteos existentes.
      await bloquearNegocioDemostracion(cliente, { negocioId });

      for (const rol of ['admin', 'staff'] as const) {
        const cuenta = 'demo.' + rol + '.' + negocio.sufijo;
        const actual = await buscarCuentaDemostracion(cliente, { cuenta });
        if (actual) {
          if (actual.negocioId !== negocioId || actual.rol !== rol) {
            throw new Error('Una cuenta de demostración ya está asignada a otro negocio o rol.');
          }
          continue;
        }
        await insertarCuentaDemostracion(cliente, {
          negocioId, nombre: rol === 'admin' ? 'Encargado de prueba' : 'Personal de prueba',
          cuenta, claveDerivada: await prepararClave(contrasena), rol,
        });
      }

      // El catálogo se carga solo al crear la jornada de demostración.
      if (!await insertarPrimeraJornada(cliente, { negocioId })) continue;
      const unidad = await crearUnidad(cliente, { negocioId, nombre: 'Pieza', simbolo: 'pza', decimales: 0 });
      for (const elemento of negocio.elementos) {
        await crearElemento(cliente, { negocioId, unidadId: unidad!.id, ...elemento, activo: true });
      }
    }
  });

  for (const { nombre, sufijo } of negocios) {
    console.log(nombre + ' · demo.admin.' + sufijo + ' · demo.staff.' + sufijo);
  }
}

try {
  await cargarDatos();
} catch (error) {
  if (error instanceof Error && !('code' in error)) {
    console.error(error.message);
  } else {
    console.error('No se pudieron cargar los datos de demostración. Comprueba la conexión y las migraciones.');
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
