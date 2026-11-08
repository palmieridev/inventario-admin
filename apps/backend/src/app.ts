import Fastify from 'fastify';
import type { HealthResponse, ReadinessResponse } from '@inventario/contracts';
import { pool } from './db/pool.js';

export function createApp() {
  const app = Fastify({ logger: true });

  pool.on('error', (error) => {
    app.log.error(
      { message: error.message, stack: error.stack },
      'Error en una conexión inactiva de PostgreSQL',
    );
  });

  app.get<{ Reply: HealthResponse }>('/health', async () => ({ status: 'ok' }));

  app.get<{ Reply: ReadinessResponse }>('/ready', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      app.log.error(error, 'PostgreSQL no está disponible');
      return reply.code(503).send({ status: 'unavailable', database: 'unavailable' });
    }
  });

  app.addHook('onClose', async () => {
    await pool.end();
  });

  return app;
}
