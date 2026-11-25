import type { DatosUnidad } from '@inventario/contracts';

export function validarCantidad(valor: string, unidad: DatosUnidad, admiteCero = true): string {
  const cantidad = valor.trim().replace(',', '.');
  if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(cantidad)) {
    throw new Error('Escribe una cantidad de cero o más, con hasta doce cifras enteras y seis decimales.');
  }
  const decimales = cantidad.split('.')[1]?.replace(/0+$/, '').length ?? 0;
  if (decimales > unidad.decimales) {
    throw new Error(unidad.decimales === 0
      ? 'Escribe una cantidad entera para esta unidad.'
      : 'Esta unidad admite hasta ' + unidad.decimales + ' decimales.');
  }
  if (!admiteCero && !/[1-9]/.test(cantidad)) {
    throw new Error('Escribe una cantidad mayor que cero.');
  }
  return cantidad;
}

export const fechaJornada = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City',
});
