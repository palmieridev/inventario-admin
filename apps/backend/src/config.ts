import { isIP } from 'node:net';

function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`Falta la variable de entorno ${name}. Revisar el archivo .env.`);
  }
  return value;
}

function port(name: string): number {
  const value = required(name);
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(`${name} debe ser un puerto entero entre 1 y 65535.`);
  }
  return Number(value);
}

function proxiesDeConfianza(): string[] {
  const valor = process.env.API_TRUSTED_PROXIES?.trim();
  if (!valor) return [];

  return valor.split(',').map((entrada) => {
    const proxy = entrada.trim();
    const [direccion = '', prefijo, ...resto] = proxy.split('/');
    const familia = isIP(direccion);
    const maximo = familia === 4 ? 32 : 128;
    if (!familia || resto.length > 0 || (prefijo !== undefined &&
      (!/^\d+$/.test(prefijo) || Number(prefijo) < 1 || Number(prefijo) > maximo))) {
      throw new Error('API_TRUSTED_PROXIES debe contener IP o rangos CIDR específicos, separados por comas.');
    }
    return proxy;
  });
}

const host = required('API_HOST');

export const config = {
  host,
  port: port('API_PORT'),
  cookieSegura: process.env.NODE_ENV === 'production' || !['127.0.0.1', '::1', 'localhost'].includes(host),
  proxiesDeConfianza: proxiesDeConfianza(),
  database: {
    host: required('POSTGRES_HOST'),
    port: port('POSTGRES_PORT'),
    database: required('POSTGRES_DB'),
    user: required('POSTGRES_USER'),
    password: required('POSTGRES_PASSWORD'),
  },
};
