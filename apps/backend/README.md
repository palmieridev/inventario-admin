# Backend

API en TypeScript y Fastify. Solo incluye la base del servidor y el pool de PostgreSQL; todavía no implementa funciones de inventario ni autenticación.

Desde la raíz, después de crear `.env` e instalar dependencias:

```bash
pnpm --filter @inventario/contracts build
pnpm --filter @inventario/backend dev
```

- `GET http://127.0.0.1:3000/health`: confirma que el proceso responde.
- `GET http://127.0.0.1:3000/ready`: consulta PostgreSQL con `SELECT 1`; devuelve HTTP 503 si no puede conectarse.

El puerto y la conexión se configuran en el `.env` de la raíz. Las credenciales permanecen en el backend y no se incluyen en los contratos compartidos.
