// Código generado con pnpm db:generate.
import type { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const comprobarConexionQuery = `-- name: ComprobarConexion :exec
SELECT 1 AS disponible`;

export interface ComprobarConexionRow {
    disponible: string;
}

export async function comprobarConexion(client: Client): Promise<void> {
    await client.query({
        text: comprobarConexionQuery,
        values: [],
        rowMode: "array"
    });
}
