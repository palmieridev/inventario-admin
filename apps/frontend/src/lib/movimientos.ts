import {
  type CausaMerma, type CuentaSesion, type Elemento, type Existencia, type JornadaAbierta,
  type LineaMovimiento,
  type MovimientoConfirmado, type RegistroMovimiento, type TipoMovimiento, type Unidad,
} from '@inventario/contracts';
import { ErrorApi, solicitar } from './api';
import { fechaJornada, validarCantidad } from './cantidades';
import { cargarCatalogo, nombreElemento } from './catalogo';
import { errorCampo, limpiarFormulario, textoValido } from './formularios';
import { mensajeError, mostrarAviso, revisarSesion } from './sesion';

const rutaPagina = '/inventario/movimientos/';
const rutaApi = '/inventario/movimientos';
const opciones = {
  compra: { titulo: 'Registrar entrada', cantidad: 'Cantidad que entra', confirmar: 'Confirmar entrada' },
  tanda: { titulo: 'Registrar tanda', cantidad: 'Cantidad obtenida', confirmar: 'Confirmar tanda completa' },
  salida: { titulo: 'Registrar salida', cantidad: 'Cantidad que sale', confirmar: 'Confirmar salida' },
  consumo: { titulo: 'Registrar consumo', cantidad: 'Cantidad consumida', confirmar: 'Confirmar consumo' },
  merma: { titulo: 'Registrar merma', cantidad: 'Cantidad que se retira', confirmar: 'Confirmar merma' },
  ajuste: { titulo: 'Corregir existencia', cantidad: 'Conteo físico', confirmar: 'Confirmar corrección' },
} satisfies Record<TipoMovimiento, { titulo: string; cantidad: string; confirmar: string }>;

const causas: Record<CausaMerma, string> = {
  deterioro: 'Deterioro',
  caducidad: 'Caducidad',
  dano_traslado: 'Daño en traslado',
  error_preparacion: 'Error de preparación',
  otra: 'Otra',
};

const motivosSalida = ['Venta', 'Muestra', 'Regalo', 'Otra salida'];
const motivosConsumo = ['Consumo del personal', 'Uso en el puesto', 'Otro consumo'];

type Captura = keyof typeof opciones;
type Detalles = Record<string, { nombre: string; simbolo: string }>;
interface Intento {
  solicitud: RegistroMovimiento & { tipo: Captura };
  detalles: Detalles;
}

function rutaCaptura(tipo: Captura, elemento?: string | null): string {
  return rutaPagina + '?' + new URLSearchParams({ tipo, ...(elemento && { elemento }) });
}

function esCaptura(tipo: string | null): tipo is Captura {
  return tipo !== null && Object.hasOwn(opciones, tipo);
}

export async function iniciarMovimientos(sesion: CuentaSesion): Promise<void> {
  const parametros = new URLSearchParams(location.search);
  const seleccion = parametros.get('tipo');
  const preseleccion = parametros.get('elemento');
  const claveLocal = ['movimiento', sesion.negocioId, sesion.id].join(':');
  const guardado = sessionStorage.getItem(claveLocal);
  let pendiente = guardado ? JSON.parse(guardado) as Intento : undefined;
  const tipo = pendiente?.solicitud.tipo ?? seleccion;
  const titulo = document.querySelector<HTMLElement>('#titulo-movimiento')!;
  const aviso = document.querySelector<HTMLElement>('#aviso-movimiento')!;
  const error = document.querySelector<HTMLElement>('#error-movimiento')!;
  const formulario = document.querySelector<HTMLFormElement>('#formulario-movimiento')!;
  const boton = formulario.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const reintentar = document.querySelector<HTMLButtonElement>('#reintentar-movimiento')!;
  const nuevo = document.querySelector<HTMLAnchorElement>('#nuevo-movimiento')!;
  const volver = document.querySelector<HTMLAnchorElement>('#volver-a-capturar')!;

  const administra = sesion.rol === 'admin';
  if (tipo === 'ajuste' && !administra) {
    mostrarAviso(aviso, 'Solo el propietario o encargado puede confirmar correcciones.');
  }

  if (!esCaptura(tipo) || (tipo === 'ajuste' && !administra)) {
    const menu = document.querySelector<HTMLElement>('#tipos-movimiento')!;
    for (const valor of Object.keys(opciones).filter(esCaptura)) {
      if (valor === 'ajuste' && !administra) continue;
      const enlace = document.createElement('a');
      enlace.className = 'boton secundario';
      enlace.href = rutaCaptura(valor, preseleccion);
      enlace.textContent = opciones[valor].titulo;
      menu.append(enlace);
    }
    menu.hidden = false;
    return;
  }

  const opcion = opciones[tipo];
  titulo.textContent = opcion.titulo;
  boton.textContent = opcion.confirmar;
  volver.href = rutaCaptura(tipo, preseleccion);
  let enviando = false;

  async function enviar(esReintento: boolean): Promise<void> {
    if (enviando || !pendiente) return;
    const intento = pendiente;
    enviando = true;
    formulario.hidden = true;
    reintentar.hidden = true;
    mostrarAviso(error, '');
    mostrarAviso(aviso, 'Esperando confirmación del servidor…');

    try {
      const resultado = await confirmar(intento.solicitud, esReintento);
      sessionStorage.removeItem(claveLocal);
      pendiente = undefined;
      mostrarAviso(aviso, '');
      mostrarConfirmacion(resultado, intento.detalles);
      nuevo.hidden = false;
    } catch (fallo) {
      if (revisarSesion(fallo)) return;

      mostrarAviso(error, mensajeError(fallo));
      if (fallo instanceof ErrorApi && fallo.estado >= 400 && fallo.estado < 500) {
        sessionStorage.removeItem(claveLocal);
        pendiente = undefined;
        mostrarAviso(aviso, '');
        const recargar = Boolean(guardado) || ['jornada_cerrada', 'jornada_no_iniciada', 'saldo_cambiado'].includes(fallo.codigo);
        volver.hidden = !recargar;
        formulario.hidden = recargar;
      } else {
        mostrarAviso(aviso, 'La confirmación está pendiente. Reintenta para verificar el mismo movimiento.');
        reintentar.hidden = false;
      }
      error.focus();
    } finally {
      enviando = false;
    }
  }

  reintentar.addEventListener('click', () => void enviar(true));
  if (pendiente) {
    mostrarAviso(aviso, 'La confirmación está pendiente. Reintenta para verificar el mismo movimiento.');
    reintentar.hidden = false;
    return;
  }

  const [{ elementos, unidades }, jornadas] = await Promise.all([
    cargarCatalogo(),
    solicitar<JornadaAbierta[]>('/inventario/jornadas'),
  ]);
  if (jornadas.length === 0) {
    mostrarAviso(aviso, 'Se necesita una jornada abierta para registrar un movimiento.');
    return;
  }

  const activos = elementos.filter((elemento) => elemento.activo && unidades.has(elemento.unidadId));
  const productos = tipo === 'tanda' ? activos.filter((elemento) => elemento.categoria === 'preparado') : activos;
  if (!productos.length) {
    mostrarAviso(aviso, 'No hay elementos activos para registrar este movimiento.');
    return;
  }

  const turno = formulario.querySelector<HTMLSelectElement>('#jornada-movimiento')!;
  const unica = jornadas.length === 1 ? jornadas[0] : undefined;
  if (!unica) turno.add(new Option('Selecciona una jornada', ''));
  for (const jornada of jornadas) turno.add(new Option(fechaJornada.format(new Date(jornada.iniciadaEn)), jornada.id));
  if (unica) {
    formulario.querySelector<HTMLElement>('#selector-turno')!.hidden = true;
    mostrarAviso(formulario.querySelector<HTMLElement>('#turno-movimiento')!,
      'Jornada iniciada el ' + fechaJornada.format(new Date(unica.iniciadaEn)));
  }

  const grupoProductos = formulario.querySelector<HTMLFieldSetElement>('#productos-movimiento')!;
  const grupoInsumos = formulario.querySelector<HTMLFieldSetElement>('#insumos-movimiento')!;
  const plantilla = document.querySelector<HTMLTemplateElement>('#linea-movimiento')!;
  const motivo = formulario.querySelector<HTMLSelectElement>('#motivo')!;
  const motivoAjuste = formulario.querySelector<HTMLInputElement>('#motivo-ajuste')!;
  const correccion = tipo === 'ajuste';
  if (correccion) {
    formulario.querySelector<HTMLElement>('#leyenda-productos')!.textContent = 'Saldo y conteo';
    formulario.querySelector<HTMLElement>('#campo-motivo-ajuste')!.hidden = false;
    motivoAjuste.required = true;
  }
  const observacion = formulario.querySelector<HTMLInputElement>('#observacion')!;
  let secuencia = 0;
  let versionAjuste: string | undefined;

  if (tipo === 'tanda') {
    formulario.querySelector<HTMLElement>('#leyenda-productos')!.textContent = 'Productos obtenidos';
    grupoInsumos.hidden = false;
    habilitarLineas(grupoProductos, productos, 'Producto obtenido', opcion.cantidad, true);
    habilitarLineas(grupoInsumos, activos.filter((elemento) => elemento.categoria === 'insumo'),
      'Insumo utilizado', 'Cantidad utilizada', false);
  }

  const razones = tipo === 'merma' ? Object.entries(causas) :
    (tipo === 'salida' ? motivosSalida : tipo === 'consumo' ? motivosConsumo : []).map((valor) => [valor, valor]);
  if (razones.length) {
    formulario.querySelector<HTMLElement>('#campo-motivo')!.hidden = false;
    if (tipo === 'merma') formulario.querySelector<HTMLLabelElement>('label[for=motivo]')!.textContent = 'Causa de merma';
    motivo.required = true;
    motivo.add(new Option('Selecciona una opción', ''));
    for (const [valor, etiqueta] of razones) motivo.add(new Option(etiqueta, valor));
  }
  formulario.querySelector<HTMLElement>('#campo-observacion')!.hidden = tipo !== 'merma';

  agregarLinea(grupoProductos, productos, tipo === 'tanda' ? 'Producto obtenido' : 'Elemento',
    opcion.cantidad, false, preseleccion);
  formulario.hidden = false;

  function habilitarLineas(
    grupo: HTMLFieldSetElement, disponibles: Elemento[], etiqueta: string, cantidad: string, primeraObligatoria: boolean,
  ): void {
    const agregar = grupo.querySelector<HTMLButtonElement>('.agregar')!;
    const maximo = Math.min(disponibles.length, 100);
    const contenedor = grupo.querySelector<HTMLElement>('.lineas')!;
    const actualizar = () => { agregar.hidden = contenedor.childElementCount >= maximo; };
    agregar.hidden = maximo <= Number(primeraObligatoria);
    agregar.addEventListener('click', () => {
      agregarLinea(grupo, disponibles, etiqueta, cantidad, true).focus();
      actualizar();
    });
    contenedor.addEventListener('click', (evento) => {
      if (!(evento.target instanceof HTMLButtonElement) || !evento.target.matches('.quitar')) return;
      const linea = evento.target.closest('.linea')!;
      const siguiente = linea.nextElementSibling ?? linea.previousElementSibling;
      linea.remove();
      actualizar();
      (siguiente?.querySelector('.elemento') as HTMLSelectElement | null ?? agregar).focus();
    });
  }

  function agregarLinea(
    grupo: HTMLFieldSetElement, disponibles: Elemento[], etiqueta: string, etiquetaCantidad: string,
    permiteQuitar: boolean, seleccionado?: string | null,
  ): HTMLSelectElement {
    const frag = plantilla.content.cloneNode(true) as DocumentFragment;
    const selector = frag.querySelector<HTMLSelectElement>('.elemento')!;
    const cantidad = frag.querySelector<HTMLInputElement>('.cantidad')!;
    const labelElemento = frag.querySelector<HTMLLabelElement>('.etiqueta-elemento')!;
    const labelCantidad = frag.querySelector<HTMLLabelElement>('.etiqueta-cantidad')!;
    const saldo = frag.querySelector<HTMLElement>('.saldo')!;
    const quitar = frag.querySelector<HTMLButtonElement>('.quitar')!;
    const indice = ++secuencia;

    selector.id = 'elemento-' + indice;
    cantidad.id = 'cantidad-' + indice;
    labelElemento.htmlFor = selector.id;
    labelElemento.textContent = etiqueta;
    labelCantidad.htmlFor = cantidad.id;
    saldo.id = 'saldo-' + indice;
    frag.querySelector<HTMLElement>('.error-elemento')!.id = 'error-' + selector.id;
    frag.querySelector<HTMLElement>('.error-cantidad')!.id = 'error-' + cantidad.id;
    selector.setAttribute('aria-describedby', saldo.id + ' error-' + selector.id);
    cantidad.setAttribute('aria-describedby', 'error-' + cantidad.id);
    quitar.hidden = !permiteQuitar;

    selector.add(new Option('Selecciona un elemento', ''));
    for (const elemento of disponibles) selector.add(new Option(nombreElemento(elemento), elemento.id));
    if (seleccionado && disponibles.some((elemento) => elemento.id === seleccionado)) selector.value = seleccionado;
    grupo.querySelector('.lineas')!.append(frag);

    let ultimaConsulta = 0;
    async function actualizarUnidad(): Promise<void> {
      const consulta = ++ultimaConsulta;
      const elemento = disponibles.find((candidato) => candidato.id === selector.value);
      const unidad = elemento && unidades.get(elemento.unidadId);
      cantidad.inputMode = unidad?.decimales === 0 ? 'numeric' : 'decimal';
      labelCantidad.textContent = unidad ? etiquetaCantidad + ' (' + unidad.simbolo + ')' : etiquetaCantidad;
      mostrarAviso(saldo, '');
      if (correccion) {
        versionAjuste = undefined;
        cantidad.disabled = true;
        boton.disabled = true;
      }
      if (!elemento || !unidad) return;
      if (correccion) mostrarAviso(saldo, 'Consultando saldo registrado…');
      try {
        const { existencia } = await solicitar<{ existencia: Existencia | null }>(
          '/inventario/elementos/' + elemento.id + '/existencia',
        );
        if (consulta !== ultimaConsulta || !selector.isConnected) return;
        const saldoVigente = existencia?.unidadId === unidad.id ? existencia : null;
        const mensaje = saldoVigente ? 'Saldo registrado: ' + saldoVigente.cantidad + ' ' + unidad.simbolo :
          existencia ? 'La unidad cambió. Vuelve a abrir la captura.' :
            'Sin conteo inicial. Registra el conteo desde el inventario.';
        mostrarAviso(saldo, mensaje);
        if (correccion && saldoVigente?.version) {
          versionAjuste = saldoVigente.version;
          cantidad.disabled = false;
          boton.disabled = false;
        }
      } catch (fallo) {
        if (consulta === ultimaConsulta && selector.isConnected && !revisarSesion(fallo)) {
          mostrarAviso(saldo, correccion
            ? 'No se pudo consultar el saldo registrado. Vuelve a abrir la captura para reintentar.'
            : 'No se pudo consultar el saldo registrado.');
        }
      }
    }
    selector.addEventListener('change', () => {
      cantidad.value = '';
      limpiarFormulario(formulario);
      void actualizarUnidad();
    });
    void actualizarUnidad();
    return selector;
  }

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (boton.disabled || pendiente || enviando) return;
    limpiarFormulario(formulario);
    mostrarAviso(error, '');
    const detalles: Detalles = {};
    const lineas = leerLineas(grupoProductos, activos, unidades, detalles, correccion);
    if (!lineas) return;

    const nota = observacion.value.trim();
    if (nota && !textoValido(nota, 500)) {
      errorCampo(observacion, 'Escribe una observación válida de hasta 500 caracteres.');
      return;
    }
    const base = { jornadaId: turno.value, claveReintento: crypto.randomUUID() };
    let solicitud: Intento['solicitud'];
    switch (tipo) {
      case 'compra':
        solicitud = { ...base, tipo, lineas };
        break;
      case 'tanda': {
        const insumos = leerLineas(grupoInsumos, activos, unidades, detalles);
        if (!insumos) return;
        solicitud = { ...base, tipo, productos: lineas, insumos };
        break;
      }
      case 'merma':
        solicitud = { ...base, tipo, lineas, motivo: motivo.value as CausaMerma, ...(nota && { observacion: nota }) };
        break;
      case 'ajuste': {
        const razon = motivoAjuste.value.trim();
        if (!textoValido(razon, 240)) {
          errorCampo(motivoAjuste, 'Escribe el motivo de la corrección en hasta 240 caracteres.');
          return;
        }
        if (!versionAjuste) return;
        const versionExistencia = versionAjuste;
        solicitud = { ...base, tipo, lineas: lineas.map((linea) => ({ ...linea, versionExistencia })), motivo: razon };
        break;
      }
      case 'salida':
      case 'consumo':
        solicitud = { ...base, tipo, lineas, motivo: motivo.value };
        break;
    }

    const intento = { solicitud, detalles };
    try {
      sessionStorage.setItem(claveLocal, JSON.stringify(intento));
    } catch {
      mostrarAviso(error, 'No se pudo conservar la captura para un reintento. Revisa el almacenamiento del navegador.');
      error.focus();
      return;
    }
    pendiente = intento;
    void enviar(false);
  });
}

function leerLineas(
  grupo: HTMLFieldSetElement, elementos: Elemento[], unidades: Map<string, Unidad>, detalles: Detalles,
  admiteCero = false,
): LineaMovimiento[] | undefined {
  const lineas: LineaMovimiento[] = [];
  for (const fila of grupo.querySelectorAll('.linea')) {
    const selector = fila.querySelector<HTMLSelectElement>('.elemento')!;
    const entrada = fila.querySelector<HTMLInputElement>('.cantidad')!;
    const elemento = elementos.find(({ id }) => id === selector.value);
    const unidad = elemento && unidades.get(elemento.unidadId);
    if (!elemento || !unidad) {
      errorCampo(selector, 'Selecciona un elemento disponible.');
      return;
    }
    if (detalles[elemento.id]) {
      errorCampo(selector, 'Este elemento ya aparece en el movimiento. Agrupa la cantidad en una sola línea.');
      return;
    }
    let cantidad: string;
    try {
      cantidad = validarCantidad(entrada.value, unidad, admiteCero);
    } catch (fallo) {
      errorCampo(entrada, (fallo as Error).message);
      return;
    }
    lineas.push({ elementoId: elemento.id, unidadId: unidad.id, cantidad });
    detalles[elemento.id] = { nombre: nombreElemento(elemento), simbolo: unidad.simbolo };
  }
  return lineas;
}

async function confirmar(solicitud: RegistroMovimiento, esReintento: boolean): Promise<MovimientoConfirmado> {
  if (esReintento) {
    try {
      return await solicitar(rutaApi, 'POST', { ...solicitud, soloConfirmada: true });
    } catch (fallo) {
      if (!(fallo instanceof ErrorApi) || fallo.codigo !== 'movimiento_no_confirmado') throw fallo;
    }
  }
  return solicitar(rutaApi, 'POST', solicitud);
}

function mostrarConfirmacion(resultado: MovimientoConfirmado, detalles: Detalles): void {
  const confirmacion = document.querySelector<HTMLElement>('#movimiento-confirmado')!;
  const correccion = resultado.tipo === 'ajuste';
  document.querySelector<HTMLElement>('#titulo-confirmacion')!.textContent =
    correccion ? 'Corrección confirmada' : 'Movimiento confirmado';
  const fecha = fechaJornada.format(new Date(resultado.registradaEn));
  const motivo = resultado.tipo === 'merma' ? causas[resultado.motivo as CausaMerma] : resultado.motivo;
  document.querySelector<HTMLElement>('#fecha-movimiento')!.textContent = [fecha, motivo].filter(Boolean).join(' · ');
  const lista = document.querySelector<HTMLElement>('#saldos-confirmados')!;
  for (const linea of resultado.lineas) {
    const { nombre, simbolo } = detalles[linea.elementoId]!;
    const renglon = document.createElement('li');
    const saldoAnterior = linea.saldoAnterior + ' ' + simbolo;
    const saldoResultante = linea.saldoResultante + ' ' + simbolo;
    renglon.textContent = correccion
      ? nombre + ' · Saldo anterior: ' + saldoAnterior + ' · Conteo confirmado: ' + saldoResultante +
        ' · Ajuste: ' + linea.variacion + ' ' + simbolo
      : nombre + ': ' + saldoAnterior + ' → ' + saldoResultante;
    lista.append(renglon);
  }
  confirmacion.hidden = false;
  confirmacion.focus();
}
