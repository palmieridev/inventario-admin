export class ErrorApi extends Error {
  constructor(readonly estado: number, readonly codigo: string, mensaje: string) {
    super(mensaje);
  }
}

export async function solicitar<T>(ruta: string, metodo = 'GET', datos?: object): Promise<T> {
  try {
    const respuesta = await fetch('/api' + ruta, {
      method: metodo,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      ...(datos && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) }),
    });

    if (respuesta.status === 204) return undefined as T;

    const contenido = await respuesta.json();
    if (!respuesta.ok) {
      throw new ErrorApi(respuesta.status, contenido.codigo, contenido.mensaje);
    }
    return contenido as T;
  } catch (error) {
    if (error instanceof ErrorApi) throw error;
    throw new ErrorApi(0, 'sin_respuesta', 'No se recibió una respuesta del servidor. Intenta de nuevo.');
  }
}
