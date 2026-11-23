import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const command = process.argv[2];
const migrations = fileURLToPath(new URL('../migrations/', import.meta.url));

function required(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error('Falta la variable ' + name + '.');
  return value;
}

function connectionString() {
  if (process.env.GOOSE_DBSTRING) return process.env.GOOSE_DBSTRING;

  const port = required('POSTGRES_PORT');
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('POSTGRES_PORT debe ser un puerto entre 1 y 65535.');
  }

  const host = required('POSTGRES_HOST');
  const url = new URL('postgresql://' + host + ':' + port);
  if (url.username || url.password || url.pathname || url.search || url.hash) {
    throw new Error('POSTGRES_HOST debe contener solo el nombre o la dirección del servidor.');
  }
  url.pathname = '/' + encodeURIComponent(required('POSTGRES_DB'));
  url.username = encodeURIComponent(required('POSTGRES_USER'));
  url.password = encodeURIComponent(required('POSTGRES_PASSWORD'));
  url.searchParams.set('sslmode', 'disable');
  return url.toString();
}

try {
  if (command !== 'up' && command !== 'status') {
    throw new Error('Indica up o status.');
  }

  const result = spawnSync('goose', ['-dir', migrations, command], {
    env: { ...process.env, GOOSE_DRIVER: 'postgres', GOOSE_DBSTRING: connectionString() },
    stdio: 'inherit',
  });
  if (result.error?.code === 'ENOENT') throw new Error('Instala goose y agrégalo al PATH.');
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof TypeError ? 'Revisa la configuración de PostgreSQL.' : error.message);
  process.exitCode = 1;
}
