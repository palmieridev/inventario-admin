# Frontend

Interfaz en Astro con TypeScript y una página inicial en español. Las pantallas del diseño se incorporarán en incrementos posteriores.

Desde la raíz:

```bash
pnpm --filter @inventario/contracts build
pnpm --filter @inventario/frontend dev
```

La página se sirve en `http://127.0.0.1:4321`. `src/pages/` define las rutas; `src/layouts/`, la estructura común; `src/components/`, los componentes reutilizables; y `src/styles/`, los estilos. `public/` conserva archivos estáticos.

El frontend podrá importar los tipos de `@inventario/contracts`. La conexión a PostgreSQL corresponde exclusivamente al backend.
