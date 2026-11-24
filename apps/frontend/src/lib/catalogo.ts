import type { Elemento, Unidad } from '@inventario/contracts';
import { solicitar } from './api';

export const categorias: Record<Elemento['categoria'], string> = {
  insumo: 'Insumos',
  preparado: 'Productos preparados',
  bebida: 'Bebidas',
  empaque: 'Empaques',
};

export function nombreElemento(elemento: Elemento): string {
  return elemento.variante ? elemento.nombre + ' · ' + elemento.variante : elemento.nombre;
}

export async function cargarCatalogo() {
  const [elementos, unidades] = await Promise.all([
    solicitar<Elemento[]>('/inventario/elementos'),
    solicitar<Unidad[]>('/inventario/unidades'),
  ]);
  return { elementos, unidades: new Map(unidades.map((unidad) => [unidad.id, unidad])) };
}
