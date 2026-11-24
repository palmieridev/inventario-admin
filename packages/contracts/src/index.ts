export interface HealthResponse {
  status: 'ok';
}

export interface ReadinessResponse {
  status: 'ok' | 'unavailable';
  database: 'connected' | 'unavailable';
}

export const CABECERA_CUENTA_ESPERADA = 'x-inventario-cuenta';

export type RolUsuario = 'admin' | 'staff';

export interface InicioSesion {
  cuenta: string;
  contrasena: string;
}

export interface CuentaSesion {
  id: string;
  negocioId: string;
  nombre: string;
  rol: RolUsuario;
}

export interface AltaPersonal extends InicioSesion {
  nombre: string;
}

export interface CuentaPersonal {
  id: string;
  nombre: string;
  cuenta: string | null;
  activo: boolean;
}

export type CambioAccesoPersonal =
  | { activo: false }
  | { activo: true; credenciales?: InicioSesion };

export interface DatosUnidad {
  nombre: string;
  simbolo: string;
  decimales: number;
}

export interface Unidad extends DatosUnidad {
  id: string;
}

export interface DatosElemento {
  unidadId: string;
  categoria: 'insumo' | 'preparado' | 'bebida' | 'empaque';
  nombre: string;
  variante?: string | null;
  activo?: boolean;
}

export interface Elemento extends DatosElemento {
  id: string;
  variante: string | null;
  activo: boolean;
}

export interface JornadaAbierta {
  id: string;
  iniciadaEn: string;
}

export interface DefinicionApertura extends Pick<Elemento, 'nombre' | 'variante' | 'categoria'> {
  unidad: DatosUnidad;
}

export interface RegistroApertura {
  elementoId: string;
  unidadId: string;
  jornadaId: string;
  cantidad: string;
  claveReintento: string;
  definicion?: DefinicionApertura;
  soloConfirmada?: boolean;
}

export interface AperturaConfirmada extends Omit<RegistroApertura, 'claveReintento' | 'definicion' | 'soloConfirmada'> {
  operacionId: string;
  autorId: string;
  registradaEn: string;
}

export interface Existencia {
  elementoId: string;
  unidadId: string;
  cantidad: string;
  actualizadaEn: string;
}

export type TipoMovimiento = 'compra' | 'tanda' | 'salida' | 'consumo' | 'merma' | 'ajuste';
export const CAUSAS_MERMA = ['deterioro', 'caducidad', 'dano_traslado', 'error_preparacion', 'otra'] as const;
export type CausaMerma = typeof CAUSAS_MERMA[number];

export interface LineaMovimiento {
  elementoId: string;
  unidadId: string;
  /** Cantidad positiva; en un ajuste representa el conteo físico, incluido cero. */
  cantidad: string;
}

interface BaseMovimiento {
  jornadaId: string;
  claveReintento: string;
  observacion?: string;
}

export type RegistroMovimiento = BaseMovimiento & (
  | { tipo: 'compra'; lineas: LineaMovimiento[] }
  | { tipo: 'salida' | 'consumo' | 'ajuste'; motivo: string; lineas: LineaMovimiento[] }
  | { tipo: 'merma'; motivo: CausaMerma; lineas: LineaMovimiento[] }
  | { tipo: 'tanda'; insumos: LineaMovimiento[]; productos: LineaMovimiento[] }
);

export interface LineaConfirmada {
  elementoId: string;
  unidadId: string;
  saldoAnterior: string;
  saldoResultante: string;
  variacion: string;
}

export interface MovimientoConfirmado {
  operacionId: string;
  autorId: string;
  jornadaId: string;
  tipo: TipoMovimiento;
  registradaEn: string;
  motivo: string | null;
  observacion: string | null;
  lineas: LineaConfirmada[];
}
