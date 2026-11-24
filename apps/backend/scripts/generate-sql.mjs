import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const raiz = new URL('../../../', import.meta.url);
const salida = new URL('apps/backend/src/db/consultas/', raiz);

execFileSync('sqlc', ['generate'], { cwd: raiz, stdio: 'inherit' });

for (const nombre of readdirSync(salida)) {
  if (!nombre.endsWith('_sql.ts')) continue;
  const archivo = new URL(nombre, salida);
  const codigo = readFileSync(archivo, 'utf8');
  // El complemento comprueba que hay una fila antes de acceder a rows[0].
  const compatible = codigo
    .replace(/^import \{ QueryArrayConfig, QueryArrayResult \} from "pg";/m,
      'import type { QueryArrayConfig, QueryArrayResult } from "pg";')
    .replaceAll('const row = result.rows[0];', 'const row = result.rows[0]!;');
  writeFileSync(archivo, '// Código generado con pnpm db:generate.\n' + compatible.trimEnd() + '\n');
}
