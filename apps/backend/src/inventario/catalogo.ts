import type { Pool, PoolClient } from 'pg';
import { enTransaccion } from '../db/transaccion.js';
import { autorizar } from '../acceso/identidad.js';
import { ErrorInventario, identificador, invalidos, objeto, texto } from './validacion.js';

type Categoria = 'insumo' | 'preparado' | 'bebida' | 'empaque';

interface Unidad {
  id: string;
  nombre: string;
  simbolo: string;
  decimales: number;
}

interface Elemento {
  id: string;
  unidadId: string;
  categoria: Categoria;
  nombre: string;
  variante: string | null;
  activo: boolean;
}

const camposUnidad = 'id, nombre, simbolo, decimales';
const camposElemento = 'id, unidad_id AS "unidadId", categoria, nombre, variante, activo';

function datosUnidad(entrada: unknown): Omit<Unidad, 'id'> {
  const datos = objeto(entrada);
  const { decimales } = datos;
  if (typeof decimales !== 'number' || !Number.isInteger(decimales) || decimales < 0 || decimales > 6) {
    invalidos('La unidad debe admitir entre cero y seis decimales.');
  }
  return {
    nombre: texto(datos.nombre, 'El nombre de la unidad', 60),
    simbolo: texto(datos.simbolo, 'El símbolo', 12),
    decimales,
  };
}

function datosElemento(entrada: unknown): Omit<Elemento, 'id' | 'activo'> & { activo: boolean | undefined } {
  const datos = objeto(entrada);
  const { categoria, activo } = datos;
  if (categoria !== 'insumo' && categoria !== 'preparado' && categoria !== 'bebida' && categoria !== 'empaque') {
    invalidos('Selecciona una categoría del catálogo.');
  }
  if (activo !== undefined && typeof activo !== 'boolean') invalidos('Indica si el elemento está activo.');
  return {
    unidadId: identificador(datos.unidadId, 'La unidad'),
    categoria,
    nombre: texto(datos.nombre, 'El nombre del elemento', 120),
    variante: datos.variante == null ? null : texto(datos.variante, 'La variante', 80),
    activo,
  };
}

async function guardarUnico<T>(guardar: () => Promise<T>): Promise<T> {
  try {
    return await guardar();
  } catch (error) {
    if (error instanceof Error && 'constraint' in error &&
      (error.constraint === 'unidades_medida_nombre_unico' ||
        error.constraint === 'elementos_inventario_variante_unica')) {
      throw new ErrorInventario('catalogo_duplicado', 'Ya existe una unidad o un elemento con esos datos.');
    }
    throw error;
  }
}

async function comprobarUnidad(cliente: PoolClient, negocioId: string, unidadId: string): Promise<void> {
  const existe = await cliente.query(
    'SELECT id FROM unidades_medida WHERE negocio_id = $1 AND id = $2',
    [negocioId, unidadId],
  );
  if (existe.rowCount === 0) throw new ErrorInventario('no_encontrado', 'La unidad no existe en el negocio.');
}

export function crearCatalogo(pool: Pool) {
  return {
    listarUnidades(usuarioId: string): Promise<Unidad[]> {
      return enTransaccion(pool, async (cliente) => {
        const { negocio_id } = await autorizar(cliente, usuarioId);
        const { rows } = await cliente.query<Unidad>(
          'SELECT ' + camposUnidad + ' FROM unidades_medida WHERE negocio_id = $1 ORDER BY nombre, id',
          [negocio_id],
        );
        return rows;
      });
    },

    crearUnidad(usuarioId: string, entrada: unknown): Promise<Unidad> {
      return guardarUnico(() => enTransaccion(pool, async (cliente) => {
        const { negocio_id } = await autorizar(cliente, usuarioId, 'admin');
        const datos = datosUnidad(entrada);
        const { rows: [unidad] } = await cliente.query<Unidad>(
          'INSERT INTO unidades_medida (negocio_id, nombre, simbolo, decimales) VALUES ($1, $2, $3, $4) ' +
          'RETURNING ' + camposUnidad,
          [negocio_id, datos.nombre, datos.simbolo, datos.decimales],
        );
        return unidad!;
      }));
    },

    modificarUnidad(usuarioId: string, unidadId: string, entrada: unknown): Promise<Unidad> {
      return guardarUnico(() => enTransaccion(pool, async (cliente) => {
        const { negocio_id } = await autorizar(cliente, usuarioId, 'admin');
        const id = identificador(unidadId, 'La unidad');
        const datos = datosUnidad(entrada);
        const { rows: [actual] } = await cliente.query<Unidad>(
          'SELECT ' + camposUnidad + ' FROM unidades_medida WHERE negocio_id = $1 AND id = $2 FOR UPDATE',
          [negocio_id, id],
        );
        if (!actual) throw new ErrorInventario('no_encontrado', 'La unidad no existe en el negocio.');
        if (actual.nombre === datos.nombre && actual.simbolo === datos.simbolo &&
          actual.decimales === datos.decimales) return actual;

        const aperturas = await cliente.query(
          'SELECT 1 FROM aperturas_inventario WHERE negocio_id = $1 AND unidad_id = $2 LIMIT 1',
          [negocio_id, id],
        );
        if (aperturas.rowCount) {
          throw new ErrorInventario('unidad_con_historial', 'La unidad ya se usó en un conteo inicial.');
        }
        const { rows: [unidad] } = await cliente.query<Unidad>(
          'UPDATE unidades_medida SET nombre = $3, simbolo = $4, decimales = $5 WHERE negocio_id = $1 AND id = $2 ' +
          'RETURNING ' + camposUnidad,
          [negocio_id, id, datos.nombre, datos.simbolo, datos.decimales],
        );
        return unidad!;
      }));
    },

    listarElementos(usuarioId: string): Promise<Elemento[]> {
      return enTransaccion(pool, async (cliente) => {
        const usuario = await autorizar(cliente, usuarioId);
        const { rows } = await cliente.query<Elemento>(
          'SELECT ' + camposElemento + ' FROM elementos_inventario ' +
          'WHERE negocio_id = $1 AND (activo OR $2) ORDER BY categoria, nombre, variante, id',
          [usuario.negocio_id, usuario.rol === 'admin'],
        );
        return rows;
      });
    },

    crearElemento(usuarioId: string, entrada: unknown): Promise<Elemento> {
      return guardarUnico(() => enTransaccion(pool, async (cliente) => {
        const { negocio_id } = await autorizar(cliente, usuarioId, 'admin');
        const datos = datosElemento(entrada);
        await comprobarUnidad(cliente, negocio_id, datos.unidadId);
        const { rows: [elemento] } = await cliente.query<Elemento>(
          'INSERT INTO elementos_inventario (negocio_id, unidad_id, categoria, nombre, variante, activo) ' +
          'VALUES ($1, $2, $3, $4, $5, $6) RETURNING ' + camposElemento,
          [negocio_id, datos.unidadId, datos.categoria, datos.nombre, datos.variante, datos.activo ?? true],
        );
        return elemento!;
      }));
    },

    modificarElemento(usuarioId: string, elementoId: string, entrada: unknown): Promise<Elemento> {
      return guardarUnico(() => enTransaccion(pool, async (cliente) => {
        const { negocio_id } = await autorizar(cliente, usuarioId, 'admin');
        const id = identificador(elementoId, 'El elemento');
        const datos = datosElemento(entrada);
        const { rows: [actual] } = await cliente.query<Elemento>(
          'SELECT ' + camposElemento + ' FROM elementos_inventario WHERE negocio_id = $1 AND id = $2 FOR UPDATE',
          [negocio_id, id],
        );
        if (!actual) throw new ErrorInventario('no_encontrado', 'El elemento no existe en el negocio.');
        if (actual.unidadId !== datos.unidadId) {
          await comprobarUnidad(cliente, negocio_id, datos.unidadId);
          const aperturas = await cliente.query(
            'SELECT 1 FROM aperturas_inventario WHERE negocio_id = $1 AND elemento_id = $2',
            [negocio_id, id],
          );
          if (aperturas.rowCount) {
            throw new ErrorInventario('unidad_con_historial', 'El elemento ya tiene un conteo inicial.');
          }
        }

        const { rows: [elemento] } = await cliente.query<Elemento>(
          'UPDATE elementos_inventario SET unidad_id = $3, categoria = $4, nombre = $5, variante = $6, activo = $7 ' +
          'WHERE negocio_id = $1 AND id = $2 RETURNING ' + camposElemento,
          [negocio_id, id, datos.unidadId, datos.categoria, datos.nombre, datos.variante, datos.activo ?? actual.activo],
        );
        return elemento!;
      }));
    },
  };
}
