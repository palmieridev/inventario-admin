import { defineConfig } from 'astro/config';
import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { parseEnv } from 'node:util';

const archivoEntorno = new URL('../../.env', import.meta.url);
const entorno = existsSync(archivoEntorno) ? parseEnv(readFileSync(archivoEntorno, 'utf8')) : {};
const hostApi = process.env.API_HOST ?? entorno.API_HOST ?? '127.0.0.1';
const puertoApi = process.env.API_PORT ?? entorno.API_PORT ?? '3000';
const destino = { '0.0.0.0': '127.0.0.1', '::': '[::1]' }[hostApi] ??
  (isIP(hostApi) === 6 ? '[' + hostApi + ']' : hostApi);

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 4321,
  },
  vite: {
    server: {
      proxy: {
        '/api': 'http://' + destino + ':' + puertoApi,
      },
    },
  },
});
