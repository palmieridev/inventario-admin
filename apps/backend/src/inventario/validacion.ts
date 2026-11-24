type CodigoInventario =
  | 'datos_invalidos'
  | 'credenciales_invalidas'
  | 'cuenta_ocupada'
  | 'sesion_requerida'
  | 'sesion_cambiada'
  | 'acceso_denegado'
  | 'no_encontrado'
  | 'catalogo_duplicado'
  | 'unidad_con_historial'
  | 'elemento_inactivo'
  | 'jornada_no_iniciada'
  | 'jornada_cerrada'
  | 'apertura_existente'
  | 'reintento_distinto';

export class ErrorInventario extends Error {
  constructor(readonly codigo: CodigoInventario, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorInventario';
  }
}

export function invalidos(mensaje: string): never {
  throw new ErrorInventario('datos_invalidos', mensaje);
}

export function objeto(valor: unknown): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    invalidos('Proporciona los datos de la operación.');
  }
  return valor as Record<string, unknown>;
}

export function identificador(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(valor)) {
    invalidos(campo + ' debe ser un UUID.');
  }
  return valor.toLowerCase();
}

export function texto(valor: unknown, campo: string, maximo: number): string {
  if (typeof valor !== 'string') invalidos(campo + ' debe ser texto.');
  const limpio = valor.trim();
  if (!limpio || [...limpio].length > maximo || /\p{Cc}/u.test(limpio)) {
    invalidos(campo + ' debe contener entre 1 y ' + maximo + ' caracteres válidos.');
  }
  return limpio;
}
