import type { DatosUnidad, Elemento, Unidad } from '@inventario/contracts';
import type { Pool, PoolClient } from 'pg';
import {
  actualizarElemento, actualizarUnidad, bloquearElemento, bloquearUnidad, buscarAperturaDeElemento,
  buscarAperturaDeUnidad, buscarUnidad, crearElemento, crearUnidad, listarElementos, listarUnidades,
  type ListarElementosRow,
} from '../db/consultas/catalogo_sql.js';
import { enTransaccion } from '../db/transaccion.js';
import { autorizar, type IdentidadInventario } from '../acceso/identidad.js';
import { ErrorInventario, identificador, invalidos, objeto, texto } from './validacion.js';

function esCategoria(categoria: unknown): categoria is Elemento['categoria'] {
  return categoria === 'insumo' || categoria === 'preparado' || categoria === 'bebida' || categoria === 'empaque';
}

function elementoDelCatalogo(elemento: ListarElementosRow): Elemento {
  if (!esCategoria(elemento.categoria)) throw new Error('El elemento tiene una categoría inválida.');
  return { ...elemento, categoria: elemento.categoria };
}

function datosUnidad(entrada: unknown): DatosUnidad {
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
  if (!esCategoria(categoria)) {
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
  const existe = await buscarUnidad(cliente, { negocioId, unidadId });
  if (!existe) throw new ErrorInventario('no_encontrado', 'La unidad no existe en el negocio.');
}

export function crearCatalogo(pool: Pool) {
  return {
    listarUnidades(identidad: IdentidadInventario): Promise<Unidad[]> {
      return enTransaccion(pool, async (cliente) => {
        const { negocioId } = await autorizar(cliente, identidad);
        return listarUnidades(cliente, { negocioId });
      });
    },

    crearUnidad(identidad: IdentidadInventario, entrada: unknown): Promise<Unidad> {
      return guardarUnico(() => enTransaccion(pool, async (cliente) => {
        const { negocioId } = await autorizar(cliente, identidad, 'admin');
        const datos = datosUnidad(entrada);
        const unidad = await crearUnidad(cliente, { negocioId, ...datos });
        return unidad!;
      }));
    },

    modificarUnidad(identidad: IdentidadInventario, unidadId: string, entrada: unknown): Promise<Unidad> {
      return guardarUnico(() => enTransaccion(pool, async (cliente) => {
        const { negocioId } = await autorizar(cliente, identidad, 'admin');
        const id = identificador(unidadId, 'La unidad');
        const datos = datosUnidad(entrada);
        const actual = await bloquearUnidad(cliente, { negocioId, unidadId: id });
        if (!actual) throw new ErrorInventario('no_encontrado', 'La unidad no existe en el negocio.');
        if (actual.nombre === datos.nombre && actual.simbolo === datos.simbolo &&
          actual.decimales === datos.decimales) return actual;

        const apertura = await buscarAperturaDeUnidad(cliente, { negocioId, unidadId: id });
        if (apertura) {
          throw new ErrorInventario('unidad_con_historial', 'La unidad ya se usó en un conteo inicial.');
        }
        const unidad = await actualizarUnidad(cliente, { negocioId, unidadId: id, ...datos });
        return unidad!;
      }));
    },

    listarElementos(identidad: IdentidadInventario): Promise<Elemento[]> {
      return enTransaccion(pool, async (cliente) => {
        const usuario = await autorizar(cliente, identidad);
        const elementos = await listarElementos(cliente, {
          negocioId: usuario.negocioId, incluirInactivos: usuario.rol === 'admin',
        });
        return elementos.map(elementoDelCatalogo);
      });
    },

    crearElemento(identidad: IdentidadInventario, entrada: unknown): Promise<Elemento> {
      return guardarUnico(() => enTransaccion(pool, async (cliente) => {
        const { negocioId } = await autorizar(cliente, identidad, 'admin');
        const datos = datosElemento(entrada);
        await comprobarUnidad(cliente, negocioId, datos.unidadId);
        const elemento = await crearElemento(cliente, { negocioId, ...datos, activo: datos.activo ?? true });
        return elementoDelCatalogo(elemento!);
      }));
    },

    modificarElemento(identidad: IdentidadInventario, elementoId: string, entrada: unknown): Promise<Elemento> {
      return guardarUnico(() => enTransaccion(pool, async (cliente) => {
        const { negocioId } = await autorizar(cliente, identidad, 'admin');
        const id = identificador(elementoId, 'El elemento');
        const datos = datosElemento(entrada);
        const actual = await bloquearElemento(cliente, { negocioId, elementoId: id });
        if (!actual) throw new ErrorInventario('no_encontrado', 'El elemento no existe en el negocio.');
        if (actual.unidadId !== datos.unidadId) {
          await comprobarUnidad(cliente, negocioId, datos.unidadId);
          const apertura = await buscarAperturaDeElemento(cliente, { negocioId, elementoId: id });
          if (apertura) {
            throw new ErrorInventario('unidad_con_historial', 'El elemento ya tiene un conteo inicial.');
          }
        }

        const elemento = await actualizarElemento(cliente, {
          negocioId, elementoId: id, ...datos, activo: datos.activo ?? actual.activo,
        });
        return elementoDelCatalogo(elemento!);
      }));
    },
  };
}
