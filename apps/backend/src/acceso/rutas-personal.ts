import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { crearServicioPersonal } from './personal.js';
import { identidadSesion } from './rutas-sesion.js';

export function registrarRutasPersonal(app: FastifyInstance, pool: Pool): void {
  const personal = crearServicioPersonal(pool);

  app.get('/personal', async (request) => personal.listar(identidadSesion(request)));

  app.post('/personal', async (request, reply) => {
    const cuenta = await personal.darDeAlta(identidadSesion(request), request.body);
    return reply.code(201).send(cuenta);
  });

  app.patch<{ Params: { id: string } }>('/personal/:id', async (request) =>
    personal.cambiarAcceso(identidadSesion(request), request.params.id, request.body));
}
