import { prepararClave } from '../acceso/credenciales.js';
import { config } from '../config.js';
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
      await cliente.query('INSERT INTO negocios (id, nombre) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [negocio.id, negocio.nombre]);
      // Una segunda ejecución conserva cuentas, jornadas, catálogo y conteos existentes.
      await cliente.query('SELECT id FROM negocios WHERE id = $1 FOR UPDATE', [negocio.id]);

      for (const rol of ['admin', 'staff'] as const) {
        const cuenta = 'demo.' + rol + '.' + negocio.sufijo;
        const { rows: [actual] } = await cliente.query<{ negocio_id: string; rol: string }>(
          'SELECT negocio_id, rol FROM usuarios WHERE cuenta = $1',
          [cuenta],
        );
        if (actual) {
          if (actual.negocio_id !== negocio.id || actual.rol !== rol) {
            throw new Error('Una cuenta de demostración ya está asignada a otro negocio o rol.');
          }
          continue;
        }
        await cliente.query(
          'INSERT INTO usuarios (negocio_id, nombre, cuenta, clave_derivada, rol) VALUES ($1, $2, $3, $4, $5)',
          [negocio.id, rol === 'admin' ? 'Encargado de prueba' : 'Personal de prueba', cuenta, await prepararClave(contrasena), rol],
        );
      }

      // El catálogo se carga solo al crear la jornada de demostración.
      const primera = await cliente.query(
        'INSERT INTO jornadas (negocio_id) SELECT $1::uuid WHERE NOT EXISTS ' +
        '(SELECT 1 FROM jornadas WHERE negocio_id = $1)',
        [negocio.id],
      );
      if (!primera.rowCount) continue;

      const { rows: [unidad] } = await cliente.query<{ id: string }>(
        "INSERT INTO unidades_medida (negocio_id, nombre, simbolo, decimales) VALUES ($1, 'Pieza', 'pza', 0) RETURNING id",
        [negocio.id],
      );
      for (const elemento of negocio.elementos) {
        await cliente.query(
          'INSERT INTO elementos_inventario (negocio_id, unidad_id, categoria, nombre, variante) VALUES ($1, $2, $3, $4, $5)',
          [negocio.id, unidad!.id, elemento.categoria, elemento.nombre, elemento.variante],
        );
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
