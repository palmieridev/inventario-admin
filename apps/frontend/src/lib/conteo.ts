import type {
  AperturaConfirmada, CuentaSesion, Existencia, JornadaAbierta, RegistroApertura,
} from '@inventario/contracts';
import { ErrorApi, solicitar } from './api';
import { fechaJornada, validarCantidad } from './cantidades';
import { cargarCatalogo, nombreElemento } from './catalogo';
import { mensajeError, mostrarAviso, revisarSesion } from './sesion';

export async function iniciarConteo(sesion: CuentaSesion): Promise<void> {
  const id = new URLSearchParams(location.search).get('elemento');
  if (!id) {
    document.querySelector<HTMLElement>('#detalle-no-disponible')!.hidden = false;
    return;
  }

  const claveLocal = ['apertura', sesion.negocioId, sesion.id, id].join(':');
  const guardado = sessionStorage.getItem(claveLocal);
  let pendiente = guardado ? JSON.parse(guardado) as RegistroApertura : undefined;
  const definicionPendiente = pendiente?.definicion;

  // Una apertura confirmada puede recuperarse aunque el elemento ya no esté en el catálogo operativo.
  const catalogo = definicionPendiente ? undefined : await cargarCatalogo();
  const elemento = catalogo?.elementos.find((entrada) => entrada.id === id);
  const unidadId = pendiente?.unidadId ?? elemento?.unidadId;
  const unidad = definicionPendiente?.unidad ?? (unidadId && catalogo?.unidades.get(unidadId));
  if ((!pendiente && !elemento) || !unidad) {
    document.querySelector<HTMLElement>('#detalle-no-disponible')!.hidden = false;
    return;
  }

  let existencia: Existencia | null = null;
  let jornadas: JornadaAbierta[] = [];
  if (!pendiente && elemento) {
    const [saldo, abiertas] = await Promise.all([
      solicitar<{ existencia: Existencia | null }>('/inventario/elementos/' + elemento.id + '/existencia'),
      solicitar<JornadaAbierta[]>('/inventario/jornadas'),
    ]);
    existencia = saldo.existencia;
    jornadas = abiertas;
  }

  const definicion = definicionPendiente ?? elemento;
  const titulo = definicion ? nombreElemento(definicion) : 'Elemento del conteo pendiente';
  const detalle = document.querySelector<HTMLElement>('#detalle-conteo')!;
  const estado = document.querySelector<HTMLElement>('#estado-conteo')!;
  const confirmacion = document.querySelector<HTMLElement>('#confirmacion-conteo')!;
  const formulario = document.querySelector<HTMLFormElement>('#formulario-conteo')!;
  const cantidad = formulario.querySelector<HTMLInputElement>('#cantidad')!;
  const jornada = formulario.querySelector<HTMLSelectElement>('#jornada')!;
  const boton = formulario.querySelector<HTMLButtonElement>('button')!;
  const selectorJornada = formulario.querySelector<HTMLElement>('#selector-jornada')!;
  const jornadaFija = formulario.querySelector<HTMLElement>('#jornada-conteo')!;
  const errorJornada = formulario.querySelector<HTMLElement>('#error-jornada')!;
  const errorCantidad = formulario.querySelector<HTMLElement>('#error-cantidad')!;
  const errorConteo = formulario.querySelector<HTMLElement>('#error-conteo')!;

  const mensajePendiente = 'La confirmación está pendiente. Reintenta para verificar el mismo conteo.';

  function mostrarPendiente(mensaje = mensajePendiente) {
    if (!pendiente) return;
    cantidad.value = pendiente.cantidad;
    cantidad.readOnly = true;
    jornada.disabled = true;
    selectorJornada.hidden = true;
    jornadaFija.hidden = true;
    boton.textContent = 'Reintentar confirmación';
    mostrarAviso(estado, mensaje);
  }

  document.querySelector<HTMLElement>('#elemento-conteo')!.textContent = titulo;
  document.querySelector<HTMLElement>('#unidad-conteo')!.textContent =
    'Unidad de control: ' + unidad.nombre + ' (' + unidad.simbolo + ')';
  detalle.hidden = false;
  if (elemento?.activo && existencia && jornadas.length) {
    const movimientos = document.querySelector<HTMLAnchorElement>('#movimientos-elemento')!;
    movimientos.href = '/inventario/movimientos/?' + new URLSearchParams({ elemento: elemento.id });
    movimientos.hidden = false;
  }

  if (!pendiente && (!elemento?.activo || existencia || jornadas.length === 0)) {
    if (!elemento?.activo) mostrarAviso(estado, 'El elemento está inactivo.');
    else if (existencia) mostrarAviso(estado, 'Existencia registrada: ' + existencia.cantidad + ' ' + unidad.simbolo + '.');
    else mostrarAviso(estado, 'Se necesita una jornada abierta para registrar el conteo inicial.');
    return;
  }

  // El formulario conserva el dato exacto como texto hasta que lo valide el servidor.
  cantidad.inputMode = unidad.decimales === 0 ? 'numeric' : 'decimal';
  document.querySelector<HTMLElement>('#simbolo-cantidad')!.textContent = '(' + unidad.simbolo + ')';
  document.querySelector<HTMLElement>('#ayuda-cantidad')!.textContent = unidad.decimales === 0
    ? 'Escribe una cantidad entera.'
    : 'Usa punto o coma decimal. Se admiten hasta ' + unidad.decimales + ' decimales.';

  const primeraJornada = jornadas[0];
  if (jornadas.length > 1) jornada.add(new Option('Selecciona una jornada', ''));
  for (const turno of jornadas) {
    jornada.add(new Option(fechaJornada.format(new Date(turno.iniciadaEn)), turno.id));
  }
  if (jornadas.length === 1 && primeraJornada) {
    jornadaFija.textContent = 'Jornada iniciada el ' + fechaJornada.format(new Date(primeraJornada.iniciadaEn));
  }
  selectorJornada.hidden = jornadas.length <= 1;
  jornada.required = jornadas.length > 1;
  jornadaFija.hidden = jornadas.length !== 1;
  formulario.hidden = false;
  mostrarPendiente();

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (boton.disabled) return;
    for (const aviso of [errorCantidad, errorJornada, errorConteo]) mostrarAviso(aviso, '');
    cantidad.removeAttribute('aria-invalid');

    if (!pendiente) {
      if (!elemento) return;
      let valor: string;
      try {
        valor = validarCantidad(cantidad.value, unidad);
      } catch (error) {
        cantidad.setAttribute('aria-invalid', 'true');
        mostrarAviso(errorCantidad, (error as Error).message);
        cantidad.focus();
        return;
      }
      const intento: RegistroApertura = {
        elementoId: elemento.id,
        unidadId: elemento.unidadId,
        jornadaId: jornada.value,
        cantidad: valor,
        claveReintento: crypto.randomUUID(),
        definicion: {
          nombre: elemento.nombre,
          variante: elemento.variante,
          categoria: elemento.categoria,
          unidad: { nombre: unidad.nombre, simbolo: unidad.simbolo, decimales: unidad.decimales },
        },
      };
      sessionStorage.setItem(claveLocal, JSON.stringify(intento));
      pendiente = intento;
    }

    boton.disabled = true;
    mostrarPendiente('Confirmando el conteo…');
    try {
      const solicitud = pendiente.definicion ? pendiente : { ...pendiente, soloConfirmada: true };
      const apertura = await solicitar<AperturaConfirmada>('/inventario/aperturas', 'POST', solicitud);
      sessionStorage.removeItem(claveLocal);
      formulario.hidden = true;
      mostrarAviso(estado, '');
      mostrarAviso(confirmacion, 'Conteo confirmado de ' + titulo + ': ' + apertura.cantidad + ' ' + unidad.simbolo + '.');
      confirmacion.focus();
    } catch (error) {
      if (revisarSesion(error)) return;
      boton.disabled = false;
      if (error instanceof ErrorApi && error.estado >= 400 && error.estado < 500) {
        sessionStorage.removeItem(claveLocal);
        pendiente = undefined;
        cantidad.readOnly = false;
        jornada.disabled = false;
        selectorJornada.hidden = jornadas.length <= 1;
        jornadaFija.hidden = jornadas.length !== 1;
        boton.textContent = 'Confirmar conteo inicial';
        mostrarAviso(estado, '');
        const mensaje = mensajeError(error);
        if (error.codigo === 'datos_invalidos' && mensaje.startsWith('La cantidad')) {
          cantidad.setAttribute('aria-invalid', 'true');
          mostrarAviso(errorCantidad, mensaje);
          cantidad.focus();
        } else if (error.codigo === 'jornada_cerrada' || error.codigo === 'jornada_no_iniciada') {
          mostrarAviso(selectorJornada.hidden ? errorConteo : errorJornada,
            mensaje + ' Vuelve a abrir el elemento para consultar las jornadas abiertas.');
        } else {
          mostrarAviso(errorConteo, mensaje);
        }
        if (jornadas.length === 0 ||
          ['apertura_existente', 'elemento_inactivo', 'catalogo_cambiado'].includes(error.codigo)) {
          boton.disabled = true;
        }
      } else {
        mostrarPendiente();
        mostrarAviso(errorConteo, mensajeError(error));
      }
    }
  });
}
