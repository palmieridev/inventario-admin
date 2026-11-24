import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const raiz = new URL('../../../', import.meta.url);
const consultas = new URL('apps/backend/queries/', raiz);
const salida = new URL('apps/backend/src/db/consultas/', raiz);

const archivosEsperados = new Set(readdirSync(consultas)
  .filter((nombre) => nombre.endsWith('.sql'))
  .map((nombre) => nombre.replace(/\.sql$/, '_sql.ts')));

execFileSync('sqlc', ['generate'], { cwd: raiz, stdio: 'inherit' });

for (const nombre of readdirSync(salida)) {
  if (!nombre.endsWith('_sql.ts')) continue;
  const archivo = new URL(nombre, salida);
  if (!archivosEsperados.has(nombre)) {
    unlinkSync(archivo);
    continue;
  }
  const codigo = readFileSync(archivo, 'utf8');
  // El complemento comprueba que hay una fila antes de acceder a rows[0].
  const compatible = codigo
    .replace(/^import \{ QueryArrayConfig, QueryArrayResult \} from "pg";/m,
      'import type { QueryArrayConfig, QueryArrayResult } from "pg";')
    .replaceAll('const row = result.rows[0];', 'const row = result.rows[0]!;');
  writeFileSync(archivo, '// Código generado con pnpm db:generate.\n' + compatible.trimEnd() + '\n');
}
