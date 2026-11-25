import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type { HealthResponse, ReadinessResponse } from '@inventario/contracts';
import type { Pool } from 'pg';
import { registrarRutasPersonal } from './acceso/rutas-personal.js';
import { registrarRutasSesion } from './acceso/rutas-sesion.js';
import { comprobarConexion } from './db/consultas/conexion_sql.js';
import { registrarRutasInventario } from './inventario/rutas.js';
import { ErrorInventario } from './inventario/validacion.js';

interface OpcionesApp {
  cookieSegura: boolean;
  logger?: boolean;
  proxiesDeConfianza?: string[];
}

const estadosError: Record<ErrorInventario['codigo'], number> = {
  datos_invalidos: 400,
  credenciales_invalidas: 401,
  cuenta_ocupada: 409,
  sesion_requerida: 401,
  sesion_cambiada: 409,
  acceso_denegado: 403,
  no_encontrado: 404,
  catalogo_duplicado: 409,
  catalogo_cambiado: 409,
  unidad_con_historial: 409,
  elemento_inactivo: 409,
  jornada_no_iniciada: 409,
  jornada_cerrada: 409,
  apertura_existente: 409,
  apertura_no_confirmada: 409,
  movimiento_no_confirmado: 409,
  reintento_distinto: 409,
  conteo_requerido: 409,
  saldo_insuficiente: 409,
  saldo_excedido: 409,
};

export function createApp(pool: Pool, { cookieSegura, logger = true, proxiesDeConfianza = [] }: OpcionesApp) {
  const app = Fastify({
    logger,
    trustProxy: proxiesDeConfianza.length > 0 ? proxiesDeConfianza : false,
  });

  const registrarErrorPool = (error: Error) => {
    app.log.error(
      { codigo: 'code' in error ? error.code : undefined },
      'Error en una conexión inactiva de PostgreSQL',
    );
  };
  pool.on('error', registrarErrorPool);

  app.get<{ Reply: HealthResponse }>('/health', async () => ({ status: 'ok' }));

  app.get<{ Reply: ReadinessResponse }>('/ready', async (_request, reply) => {
    try {
      await comprobarConexion(pool);
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      app.log.error({ codigo: error instanceof Error && 'code' in error ? error.code : undefined },
        'PostgreSQL no está disponible');
      return reply.code(503).send({ status: 'unavailable', database: 'unavailable' });
    }
  });

  app.addHook('onClose', async () => {
    await pool.end();
    pool.off('error', registrarErrorPool);
  });

  app.register(async (api) => {
    api.addHook('onRequest', async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
    });
    api.setErrorHandler((error, request, reply) => {
      if (error instanceof ErrorInventario) {
        return reply.code(estadosError[error.codigo]).send({ codigo: error.codigo, mensaje: error.message });
      }
      const estado = error instanceof Error && 'statusCode' in error ? Number(error.statusCode) : 500;
      if (estado === 429) {
        return reply.code(429).send({ codigo: 'limite_de_intentos', mensaje: 'Espera un minuto para volver a intentar.' });
      }
      if (estado >= 400 && estado < 500) {
        return reply.code(estado).send({ codigo: 'datos_invalidos', mensaje: 'Revisa el formato de la solicitud.' });
      }
      request.log.error({ codigo: error instanceof Error && 'code' in error ? error.code : undefined },
        'Error al procesar la solicitud');
      return reply.code(500).send({ codigo: 'error_interno', mensaje: 'No se pudo completar la operación.' });
    });
    await api.register(cookie);
    await api.register(rateLimit, { global: false });
    registrarRutasSesion(api, pool, cookieSegura);
    registrarRutasPersonal(api, pool);
    registrarRutasInventario(api, pool);
  }, { prefix: '/api' });

  return app;
}
