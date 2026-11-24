import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = new URL('../../../', import.meta.url);
const rutaSalida = 'apps/backend/src/db/consultas/';
const salida = new URL(rutaSalida, raiz);
const temporal = mkdtempSync(join(tmpdir(), 'inventario-sqlc-'));

try {
  copyFileSync(new URL('sqlc.yaml', raiz), join(temporal, 'sqlc.yaml'));
  for (const ruta of ['apps/backend/migrations/', 'apps/backend/queries/']) {
    cpSync(new URL(ruta, raiz), join(temporal, ruta), { recursive: true });
  }

  const generacion = join(temporal, rutaSalida);
  mkdirSync(generacion, { recursive: true });
  execFileSync('sqlc', ['generate'], { cwd: temporal, stdio: 'inherit' });

  const generados = new Set(readdirSync(generacion));
  mkdirSync(salida, { recursive: true });

  for (const nombre of generados) {
    const codigo = readFileSync(join(generacion, nombre), 'utf8');
    // El complemento comprueba que hay una fila antes de acceder a rows[0].
    const compatible = codigo
      .replace(/^import \{ QueryArrayConfig, QueryArrayResult \} from "pg";/m,
        'import type { QueryArrayConfig, QueryArrayResult } from "pg";')
      .replaceAll('const row = result.rows[0];', 'const row = result.rows[0]!;');
    writeFileSync(new URL(nombre, salida), '// Código generado con pnpm db:generate.\n' + compatible.trimEnd() + '\n');
  }

  for (const nombre of readdirSync(salida)) {
    if (nombre.endsWith('_sql.ts') && !generados.has(nombre)) unlinkSync(new URL(nombre, salida));
  }
} finally {
  rmSync(temporal, { recursive: true, force: true });
}
