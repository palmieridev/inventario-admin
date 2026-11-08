# PostgreSQL para desarrollo local

`compose.dev.yaml` ejecuta únicamente PostgreSQL 18. Frontend y backend se ejecutan en el equipo mediante pnpm. La imagen oficial de PostgreSQL 18 conserva los datos en el volumen montado en `/var/lib/postgresql`.

Desde la raíz del repositorio:

```bash
cp .env.example .env
pnpm db:up
pnpm db:check
```

La conexión predeterminada es `127.0.0.1:5433`. El puerto interno del contenedor es 5432. El nombre del proyecto Compose separa este servicio y su volumen de otros proyectos locales.

```bash
pnpm db:logs  # Seguir los registros
pnpm db:psql  # Abrir la consola SQL
pnpm db:down  # Detener y retirar el contenedor; conservar el volumen
```

Los valores de `.env.example` son exclusivos para desarrollo. No contienen datos de participantes y no se deben reutilizar para staging o producción. `.env` se excluye de Git.

PostgreSQL aplica las variables de inicialización cuando el volumen está vacío. Cambiar usuario, contraseña o nombre de base en `.env` no modifica una base ya creada; requiere una modificación explícita o un volumen de desarrollo nuevo. No se incluyen tablas ni datos iniciales: el esquema se definirá al implementar los módulos de inventario.
