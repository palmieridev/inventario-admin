import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { huellaSesion, sesionRequerida, type IdentidadSesion } from './identidad.js';
import { crearServicioSesion, DURACION_SESION_SEGUNDOS } from './sesiones.js';

const COOKIE_SESION = 'inventario_sesion';

function leerSesion(request: FastifyRequest): IdentidadSesion | undefined {
  const token = request.cookies[COOKIE_SESION];
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) return { huellaSesion: huellaSesion(token) };
}

export function identidadSesion(request: FastifyRequest): IdentidadSesion {
  return leerSesion(request) ?? sesionRequerida();
}

export function registrarRutasSesion(app: FastifyInstance, pool: Pool, cookieSegura: boolean): void {
  const sesiones = crearServicioSesion(pool);
  const cookie = { path: '/api', httpOnly: true, sameSite: 'strict', secure: cookieSegura } as const;

  app.post('/sesion', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { token, cuenta } = await sesiones.iniciar(request.body);
    return reply.setCookie(COOKIE_SESION, token, { ...cookie, maxAge: DURACION_SESION_SEGUNDOS }).send(cuenta);
  });

  app.get('/sesion', async (request) => sesiones.consultar(identidadSesion(request)));

  app.delete('/sesion', async (request, reply) => {
    const identidad = leerSesion(request);
    if (identidad) await sesiones.cerrar(identidad);
    return reply.clearCookie(COOKIE_SESION, cookie).code(204).send();
  });
}
