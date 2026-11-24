import type { AperturaConfirmada, Existencia } from '@inventario/contracts';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { identidadSesion } from '../acceso/rutas-sesion.js';
import { crearServicioApertura } from './apertura.js';
import { crearCatalogo } from './catalogo.js';

interface ParametrosId {
  Params: { id: string };
}

export function registrarRutasInventario(app: FastifyInstance, pool: Pool): void {
  const catalogo = crearCatalogo(pool);
  const inventario = crearServicioApertura(pool);

  app.get('/inventario/unidades', async (request) => catalogo.listarUnidades(identidadSesion(request)));

  app.post('/inventario/unidades', async (request, reply) => {
    const unidad = await catalogo.crearUnidad(identidadSesion(request), request.body);
    return reply.code(201).send(unidad);
  });

  app.put<ParametrosId>('/inventario/unidades/:id', async (request) =>
    catalogo.modificarUnidad(identidadSesion(request), request.params.id, request.body));

  app.get('/inventario/elementos', async (request) => catalogo.listarElementos(identidadSesion(request)));

  app.post('/inventario/elementos', async (request, reply) => {
    const elemento = await catalogo.crearElemento(identidadSesion(request), request.body);
    return reply.code(201).send(elemento);
  });

  app.put<ParametrosId>('/inventario/elementos/:id', async (request) =>
    catalogo.modificarElemento(identidadSesion(request), request.params.id, request.body));

  app.get('/inventario/jornadas', async (request) => inventario.listarJornadasAbiertas(identidadSesion(request)));

  app.get<ParametrosId & { Reply: { existencia: Existencia | null } }>(
    '/inventario/elementos/:id/existencia', async (request) => {
      const saldo = await inventario.consultarExistencia(identidadSesion(request), request.params.id);
      return { existencia: saldo && { ...saldo, actualizadaEn: saldo.actualizadaEn.toISOString() } };
    },
  );

  app.post<{ Reply: AperturaConfirmada }>('/inventario/aperturas', async (request) => {
    const apertura = await inventario.registrarApertura(identidadSesion(request), request.body);
    return { ...apertura, registradaEn: apertura.registradaEn.toISOString() };
  });
}
