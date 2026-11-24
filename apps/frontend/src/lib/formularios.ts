import { mostrarAviso } from './sesion';

export function limpiarFormulario(formulario: HTMLFormElement): void {
  formulario.querySelectorAll<HTMLElement>('.error').forEach((aviso) => mostrarAviso(aviso, ''));
  formulario.querySelectorAll('[aria-invalid]').forEach((campo) => campo.removeAttribute('aria-invalid'));
}

export function errorCampo(campo: HTMLInputElement | HTMLSelectElement, mensaje: string): void {
  const aviso = document.getElementById('error-' + campo.id);
  if (aviso) mostrarAviso(aviso, mensaje);
  campo.setAttribute('aria-invalid', 'true');
  campo.focus();
}

export function textoValido(texto: string, maximo: number): boolean {
  return texto.length > 0 && [...texto].length <= maximo && !/\p{Cc}/u.test(texto);
}
