# Frontend

Interfaz móvil en Astro y TypeScript para iniciar sesión, consultar el catálogo y registrar el conteo inicial. El propietario o encargado puede administrar elementos, unidades y accesos del personal.

Desde la raíz:

```bash
pnpm --filter @inventario/contracts build
pnpm --filter @inventario/frontend dev
```

La página se sirve en `http://127.0.0.1:4321`. `src/pages/` define las rutas; `src/layouts/`, la estructura común; `src/components/`, los componentes reutilizables; y `src/styles/`, los estilos. `public/` conserva archivos estáticos.

El frontend usa los tipos de `@inventario/contracts` y consulta la API desde el navegador. Para probar las pantallas, se requiere la API en ejecución y una cuenta de demostración según el [README de la raíz](../../README.md). En un despliegue de la compilación estática, el mismo origen HTTPS debe servir las páginas y reenviar `/api` a Fastify.
