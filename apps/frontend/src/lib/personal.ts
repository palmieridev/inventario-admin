import type { AltaPersonal, CambioAccesoPersonal, CuentaPersonal } from '@inventario/contracts';
import { ErrorApi, solicitar } from './api';
import { errorCampo, limpiarFormulario, textoValido } from './formularios';
import { mensajeError, mostrarAviso, revisarSesion } from './sesion';

export async function iniciarPersonal(): Promise<void> {
  const ruta = '/personal';
  const personal = await solicitar<CuentaPersonal[]>(ruta);
  const lista = document.querySelector<HTMLUListElement>('#lista-personal')!;
  const plantilla = document.querySelector<HTMLTemplateElement>('#fila-personal')!;
  const sinPersonal = document.querySelector<HTMLElement>('#sin-personal')!;
  const alta = document.querySelector<HTMLButtonElement>('#alta-personal')!;
  const formulario = document.querySelector<HTMLFormElement>('#formulario-personal')!;
  const nombre = formulario.querySelector<HTMLInputElement>('#nombre-personal')!;
  const cuenta = formulario.querySelector<HTMLInputElement>('#cuenta-personal')!;
  const contrasena = formulario.querySelector<HTMLInputElement>('#clave-personal')!;
  const guardar = formulario.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const cancelar = formulario.querySelector<HTMLButtonElement>('#cancelar-alta-personal')!;
  const errorAlta = formulario.querySelector<HTMLElement>('#error-alta-personal')!;
  const confirmacion = document.querySelector<HTMLElement>('#confirmacion-personal')!;
  let porHabilitar: CuentaPersonal | undefined;
  let actualizandoAcceso = false;

  function abrirFormulario(persona?: CuentaPersonal) {
    porHabilitar = persona;
    formulario.reset();
    limpiarFormulario(formulario);
    mostrarAviso(confirmacion, '');
    formulario.querySelector('h2')!.textContent = persona ? 'Habilitar acceso de ' + persona.nombre : 'Dar de alta al personal';
    formulario.querySelector<HTMLElement>('#campo-nombre-personal')!.hidden = Boolean(persona);
    nombre.disabled = Boolean(persona);
    formulario.hidden = false;
    (persona ? cuenta : nombre).focus();
  }

  function mostrarConfirmacion(persona: CuentaPersonal) {
    const accion = persona.activo ? 'Acceso habilitado para ' : 'Acceso revocado para ';
    mostrarAviso(confirmacion, accion + persona.nombre + '.');
    confirmacion.focus();
  }

  function renderizar() {
    sinPersonal.hidden = personal.length > 0;
    const filas = personal.map((persona, indice) => {
      const fila = plantilla.content.cloneNode(true) as DocumentFragment;
      const boton = fila.querySelector('button')!;
      const errorAcceso = fila.querySelector<HTMLElement>('.error')!;
      const tieneAcceso = persona.activo && persona.cuenta !== null;
      fila.querySelector('strong')!.textContent = persona.nombre;
      fila.querySelector('.texto-secundario')!.textContent = persona.cuenta
        ? persona.cuenta + ' · ' + (tieneAcceso ? 'Acceso activo' : 'Acceso revocado')
        : 'Sin cuenta de acceso';
      boton.textContent = tieneAcceso ? 'Revocar acceso' : 'Habilitar acceso';
      boton.setAttribute('aria-label', boton.textContent + ' de ' + persona.nombre);
      boton.addEventListener('click', async () => {
        if (guardar.disabled || actualizandoAcceso) return;
        if (!persona.cuenta) {
          abrirFormulario(persona);
          return;
        }
        if (tieneAcceso && !window.confirm('¿Revocar el acceso de ' + persona.nombre + '? Su sesión se cerrará.')) return;

        mostrarAviso(confirmacion, '');
        mostrarAviso(errorAcceso, '');
        actualizandoAcceso = true;
        boton.disabled = true;
        const datos: CambioAccesoPersonal = { activo: !tieneAcceso };
        try {
          const actualizada = await solicitar<CuentaPersonal>(ruta + '/' + persona.id, 'PATCH', datos);
          personal[indice] = actualizada;
          renderizar();
          mostrarConfirmacion(actualizada);
        } catch (error) {
          if (revisarSesion(error)) return;
          mostrarAviso(errorAcceso, mensajeError(error));
        } finally {
          boton.disabled = false;
          actualizandoAcceso = false;
        }
      });
      return fila;
    });
    lista.replaceChildren(...filas);
  }

  alta.addEventListener('click', () => abrirFormulario());
  cancelar.addEventListener('click', () => {
    formulario.reset();
    formulario.hidden = true;
    alta.focus();
  });
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (guardar.disabled || actualizandoAcceso) return;
    limpiarFormulario(formulario);

    const datos: AltaPersonal = {
      nombre: nombre.value.trim(),
      cuenta: cuenta.value.trim(),
      contrasena: contrasena.value,
    };
    if (!porHabilitar && !textoValido(datos.nombre, 120)) {
      errorCampo(nombre, 'Escribe un nombre de hasta 120 caracteres.');
      return;
    }
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(datos.cuenta)) {
      errorCampo(cuenta, 'Usa de 3 a 64 caracteres: letras sin acentos, números, punto, guion o guion bajo.');
      return;
    }
    if (!datos.contrasena.trim() || [...datos.contrasena].length < 12 ||
      new TextEncoder().encode(datos.contrasena).length > 256) {
      errorCampo(contrasena, 'Usa al menos 12 caracteres y una contraseña de hasta 256 bytes.');
      return;
    }

    guardar.disabled = true;
    cancelar.disabled = true;
    alta.disabled = true;
    try {
      let actualizada: CuentaPersonal;
      if (porHabilitar) {
        const cambio: CambioAccesoPersonal = {
          activo: true, credenciales: { cuenta: datos.cuenta, contrasena: datos.contrasena },
        };
        actualizada = await solicitar<CuentaPersonal>(ruta + '/' + porHabilitar.id, 'PATCH', cambio);
        personal[personal.findIndex((persona) => persona.id === actualizada.id)] = actualizada;
      } else {
        actualizada = await solicitar<CuentaPersonal>(ruta, 'POST', datos);
        personal.push(actualizada);
      }
      formulario.reset();
      formulario.hidden = true;
      renderizar();
      mostrarConfirmacion(actualizada);
    } catch (error) {
      if (revisarSesion(error)) return;
      if (error instanceof ErrorApi && error.codigo === 'cuenta_ocupada') {
        errorCampo(cuenta, 'Ese nombre de cuenta ya está en uso. Elige otro.');
      } else {
        mostrarAviso(errorAlta, mensajeError(error));
      }
    } finally {
      guardar.disabled = false;
      cancelar.disabled = false;
      alta.disabled = false;
    }
  });

  renderizar();
}
