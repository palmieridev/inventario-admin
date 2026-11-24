import type { CuentaSesion } from '@inventario/contracts';
import { ErrorApi, solicitar, vincularCuenta } from './api';

export function mostrarAviso(aviso: HTMLElement, mensaje: string): void {
  aviso.textContent = mensaje;
  aviso.hidden = !mensaje;
}

export function revisarSesion(error: unknown): boolean {
  if (!(error instanceof ErrorApi)) return false;
  if (error.codigo === 'sesion_requerida') {
    location.replace('/?sesion=vencida');
    return true;
  }
  if (error.codigo === 'sesion_cambiada') {
    location.replace('/inventario/?sesion=cambiada');
    return true;
  }
  return false;
}

export function mensajeError(error: unknown): string {
  return error instanceof ErrorApi ? error.message : 'No se pudo completar la operación. Intenta de nuevo.';
}

export async function conSesion(cargar: (sesion: CuentaSesion) => void | Promise<void>, soloAdmin = false) {
  const estado = document.querySelector<HTMLElement>('#estado-sesion')!;
  const contenido = document.querySelector<HTMLElement>('#contenido-interno')!;
  const salida = document.querySelector<HTMLButtonElement>('#cerrar-sesion')!;
  const errorSalida = document.querySelector<HTMLElement>('#error-salida')!;

  try {
    const sesion = await solicitar<CuentaSesion>('/sesion');
    if (soloAdmin && sesion.rol !== 'admin') {
      location.replace('/inventario/');
      return;
    }

    vincularCuenta(sesion.id);
    if (new URLSearchParams(location.search).get('sesion') === 'cambiada') {
      mostrarAviso(document.querySelector<HTMLElement>('#aviso-cuenta')!,
        'La cuenta cambió. Abre un formulario desde el inventario de esta cuenta.');
      history.replaceState(null, '', location.pathname);
    }

    document.querySelector<HTMLElement>('#nombre-cuenta')!.textContent = sesion.nombre;
    document.querySelector<HTMLElement>('#rol-cuenta')!.textContent =
      sesion.rol === 'admin' ? 'Propietario o encargado' : 'Personal que atiende clientes';

    salida.addEventListener('click', async () => {
      salida.disabled = true;
      mostrarAviso(errorSalida, '');
      try {
        await solicitar<void>('/sesion', 'DELETE');
        location.replace('/');
      } catch (error) {
        if (revisarSesion(error)) return;
        mostrarAviso(errorSalida, mensajeError(error));
        salida.disabled = false;
      }
    });

    await cargar(sesion);
    estado.hidden = true;
    contenido.hidden = false;
  } catch (error) {
    if (revisarSesion(error)) return;
    estado.textContent = mensajeError(error);
    document.querySelector<HTMLButtonElement>('#reintentar-carga')!.hidden = false;
  }
}

export function recargarAlVolver(): void {
  window.addEventListener('pageshow', (evento) => {
    if (evento.persisted) location.reload();
  });
}
