# Inventario Admin

Prototipo web orientado al uso móvil para la gestión de inventarios en microempresas de comercio informal de alimentos de las calles aledañas a la UPIICSA, Iztacalco, Ciudad de México.

El proyecto busca apoyar el registro de existencias durante la preparación y la atención del puesto. La consulta pública será una salida limitada del inventario: cada negocio podrá autorizar la publicación de su oferta, disponibilidad y datos básicos de atención.

## Estado del proyecto

El repositorio contiene la base ejecutable del monorepositorio: frontend en Astro, backend en TypeScript y Fastify, contratos compartidos y PostgreSQL para desarrollo local. Las funciones de inventario todavía no están implementadas; el backend incluye únicamente comprobaciones de salud y conexión a la base de datos.

## Estructura

```text
inventario-admin/
├── apps/
│   ├── frontend/             # Astro: páginas, layouts, componentes y estilos
│   └── backend/              # API Fastify y acceso a PostgreSQL
├── packages/
│   └── contracts/            # Tipos compartidos de solicitudes y respuestas
├── infra/
│   └── docker/               # Compose de PostgreSQL para desarrollo
├── .env.example              # Configuración local de referencia
├── .node-version             # Node.js 24 LTS
├── package.json              # Comandos comunes y versión de pnpm
├── pnpm-lock.yaml            # Versiones resueltas de las dependencias
├── pnpm-workspace.yaml       # Espacios de trabajo
└── tsconfig.base.json        # Opciones comunes de TypeScript
```

## Desarrollo local

Se requieren Node.js 24 LTS o superior, pnpm 11.1.1 y Docker con Compose. La configuración también puede ejecutarse con un proveedor compatible de Compose para Podman.

Desde la raíz del repositorio:

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:check
pnpm dev
```

`db:check` permite comprobar cuándo PostgreSQL acepta conexiones; puede ser necesario repetirlo durante el primer arranque. Los valores del ejemplo son exclusivos para desarrollo local. El archivo `.env` permanece fuera de Git.

| Servicio | Dirección predeterminada |
| --- | --- |
| Frontend | http://127.0.0.1:4321 |
| Backend | http://127.0.0.1:3000 |
| PostgreSQL | `127.0.0.1:5433` |

El puerto 5433 evita ocupar el puerto habitual de otras bases locales. Puede modificarse con `POSTGRES_PORT` en `.env`; tanto Compose como el backend utilizan ese valor. El frontend no recibe las credenciales de la base.

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
```

`/health` confirma que la API responde. `/ready` realiza `SELECT 1` contra PostgreSQL y devuelve HTTP 503 si la base no está disponible.

### Comandos del monorepositorio

| Comando | Función |
| --- | --- |
| `pnpm dev` | Compila los contratos e inicia sus cambios en modo observación junto con frontend y backend. |
| `pnpm build` | Compila los paquetes respetando sus dependencias internas. |
| `pnpm typecheck` | Compila los contratos y revisa TypeScript y las plantillas Astro. |
| `pnpm db:up` | Inicia PostgreSQL en segundo plano. |
| `pnpm db:check` | Comprueba si PostgreSQL acepta conexiones. |
| `pnpm db:logs` | Muestra los registros de PostgreSQL. |
| `pnpm db:psql` | Abre la consola SQL dentro del contenedor. |
| `pnpm db:down` | Detiene PostgreSQL y conserva el volumen de datos. |

`Ctrl+C` detiene los procesos de `pnpm dev`; la base se detiene por separado con `pnpm db:down`. Los scripts no eliminan el volumen. Las variables de inicialización de PostgreSQL se aplican solo al crear una base nueva; cambiar `.env` no modifica las credenciales de un volumen existente. Se incluyen más detalles en [infra/docker/README.md](infra/docker/README.md).

## Alcance previsto

- Administrar insumos, productos preparados, bebidas y empaques, con variantes y unidades de control independientes.
- Establecer existencias mediante un conteo inicial, sin duplicar sobrantes de jornadas anteriores.
- Registrar entradas por compra, producción por tandas, salidas agrupadas, consumos y mermas con su motivo.
- Registrar correcciones autorizadas que conserven el movimiento original, el saldo anterior, el ajuste, el motivo y la autoría.
- Consultar existencias y movimientos por jornada, elemento, tipo y persona que registra.
- Confirmar la disponibilidad de cada producto o variante como disponible, agotado o no ofrecido.
- Autorizar y retirar la publicación de información para consulta sin cuenta.

Las relaciones entre componentes y porciones, los avisos de existencias bajas y los recordatorios de revisión de jornada son funciones complementarias pendientes de priorización.

## Roles

| Rol | Funciones previstas |
| --- | --- |
| Persona responsable | Administra catálogo y accesos, realiza tareas operativas, autoriza correcciones y decide qué información se publica. |
| Personal operativo autorizado | Registra movimientos, consulta existencias e historial operativo y confirma disponibilidad dentro de su negocio. |
| Cliente | Consulta sin cuenta únicamente la oferta, la disponibilidad y los datos de atención autorizados. |

## Reglas principales

- Cada registro interno pertenece a un negocio; el acceso depende del rol y de esa pertenencia.
- Cada elemento o variante conserva una unidad de control definida; no se mezclan unidades sin una equivalencia explícita.
- Una tanda reúne los insumos consumidos y los productos obtenidos en una sola operación. La salida posterior de las piezas preparadas no vuelve a descontar esos ingredientes.
- Una salida superior al saldo requiere revisar la cantidad o corregir la existencia; no genera un saldo negativo silencioso.
- La existencia registrada y la disponibilidad se distinguen. Una reposición no revierte automáticamente un agotamiento confirmado manualmente.
- La interfaz distinguirá los cambios confirmados de los intentos pendientes o fallidos. Los reintentos no deben duplicar movimientos.
- La respuesta pública excluye cantidades internas, movimientos, mermas y datos personales no autorizados, e identifica la última actualización confirmada.

## Arquitectura y responsabilidades

El monorepositorio utiliza espacios de trabajo de pnpm. Los paquetes internos se enlazan mediante `workspace:*`:

| Componente | Tecnología prevista | Responsabilidad |
| --- | --- | --- |
| Frontend | Astro y TypeScript | Formularios y consultas adaptables al teléfono. |
| Backend | TypeScript y Fastify | Base de la API y conexión a PostgreSQL; posteriormente incorporará validación, permisos por negocio y reglas de inventario y publicación. |
| Contratos compartidos | TypeScript | Tipos de solicitudes y respuestas entre frontend y backend. |
| Persistencia | PostgreSQL | Existencias, movimientos, autoría, autorizaciones y transacciones. |

Los contratos generan JavaScript ESM y declaraciones de tipos; frontend y backend los declaran como dependencia. Todavía no se incluyen tablas, migraciones ni datos iniciales. La operación sin conexión y el uso simultáneo de varios dispositivos permanecen pendientes de validación.

## Límites

Quedan fuera cobros, pedidos, compras en línea, facturación, contabilidad, gestión fiscal, reparto y predicción automática de demanda. Los precios públicos, si se autorizan, serán informativos.

El prototipo no determinará la inocuidad de los alimentos ni implicará una certificación normativa. La reducción de mermas, la exactitud del inventario y la utilidad durante la jornada deberán evaluarse; no se consideran beneficios comprobados.

## Diseño y evaluación

El diseño de referencia se mantiene en la carpeta `design/` del espacio de trabajo académico, fuera de este repositorio. Los capítulos I–IV documentan el contexto, los requisitos y los procesos propuestos; este repositorio reunirá la implementación y su documentación técnica.

La evaluación prevista contempla tareas de consulta de existencias, registro de movimientos, confirmación de disponibilidad y separación entre información interna y pública. Se utilizarán datos ficticios para el desarrollo; las pruebas con negocios y la publicación de sus datos requerirán las autorizaciones correspondientes.
