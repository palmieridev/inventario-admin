export interface HealthResponse {
  status: 'ok';
}

export interface ReadinessResponse {
  status: 'ok' | 'unavailable';
  database: 'connected' | 'unavailable';
}

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
