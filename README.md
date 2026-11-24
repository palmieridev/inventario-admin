# Inventario Admin

Prototipo web orientado al uso móvil para la gestión de inventarios en microempresas de comercio informal de alimentos de las calles aledañas a la UPIICSA, Iztacalco, Ciudad de México.

El proyecto busca apoyar el registro interno de existencias durante la preparación y la atención del puesto.

## Estado del proyecto

El repositorio contiene el frontend en Astro, la API en TypeScript y Fastify, los contratos compartidos y el entorno de PostgreSQL para desarrollo local. A05 incorpora el catálogo y el conteo inicial. A06 expone esas operaciones en la API, con sesiones y permisos por negocio, e incorpora el alta y la revocación de personal. A07 incorpora las pantallas móviles de acceso, inventario, conteo inicial y administración del catálogo y del personal. A08 agrega la API de compras, tandas, salidas, consumos, mermas y ajustes autorizados, con confirmación atómica y reintentos sin duplicados. Los formularios de movimientos corresponden a A10. Véase el [contrato de la API](apps/backend/README.md#movimientos-y-producción-a08).

## Estructura

```text
inventario-admin/
├── apps/
│   ├── frontend/             # Astro: páginas, layouts, componentes y estilos
│   └── backend/              # API Fastify, acceso a PostgreSQL y migraciones
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

Se requieren Node.js 24 LTS o superior, pnpm 11.1.1, Docker con Compose y Goose v3.29.0 disponible en `PATH`. La configuración también puede ejecutarse con un proveedor compatible de Compose para Podman. Si se cuenta con Go, se puede instalar Goose con `go install github.com/pressly/goose/v3/cmd/goose@v3.29.0`.

Desde la raíz del repositorio:

```bash
test -f .env || cp .env.example .env
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:check
pnpm db:migrate
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

### Datos de demostración

Después de aplicar las migraciones, se pueden cargar dos negocios ficticios con sus cuentas, una jornada y un catálogo breve. Desde Bash, introducir una contraseña exclusiva de desarrollo de al menos 12 caracteres.

```bash
read -rs -p 'Contraseña de demostración: ' INVENTARIO_DEV_PASSWORD
INVENTARIO_DEV_PASSWORD="$INVENTARIO_DEV_PASSWORD" pnpm db:seed:dev
unset INVENTARIO_DEV_PASSWORD
```

| Negocio | Propietario o encargado | Personal que atiende clientes |
| --- | --- | --- |
| Tamales de demostración | `demo.admin.tamales` | `demo.staff.tamales` |
| Bebidas de demostración | `demo.admin.bebidas` | `demo.staff.bebidas` |

Las cuatro cuentas se crean con la contraseña introducida. Al repetir la carga se conservan las cuentas, las contraseñas y el inventario existentes. Con `pnpm dev`, el servidor de Astro reenvía `/api` al backend local para que el frontend pueda utilizar la sesión desde el mismo origen. Las rutas y permisos se documentan en [apps/backend/README.md](apps/backend/README.md).

### Recorrido de A07

1. Abre el frontend e inicia sesión con una de las cuentas ficticias.
2. Busca un elemento por nombre o variante, o filtra por categoría. Al seleccionarlo se muestran su unidad de control y su existencia si ya tiene un conteo.
3. Con una jornada abierta, registra el conteo inicial de un elemento sin existencia. Un conteo de cero queda confirmado con su unidad. Si la confirmación se interrumpe, recarga la pantalla de conteo en la misma pestaña. Puedes recuperar el resultado aunque el elemento se haya desactivado.
4. Como propietario o encargado, usa **Nuevo elemento**, **Editar** o **Unidades** para administrar el catálogo. **Personal autorizado** permite dar de alta, habilitar y revocar cuentas. El personal que atiende clientes puede consultar y contar dentro de su negocio.

### Comandos del monorepositorio

| Comando | Función |
| --- | --- |
| `pnpm dev` | Compila los contratos e inicia sus cambios en modo observación junto con frontend y backend. |
| `pnpm build` | Compila los paquetes respetando sus dependencias internas. |
| `pnpm typecheck` | Compila los contratos y revisa TypeScript y las plantillas Astro. |
| `pnpm test:inventario` | Comprueba sesiones, permisos, catálogo y conteo inicial en PostgreSQL. Requiere `INVENTARIO_TEST_DATABASE_URL` y Goose. |
| `pnpm db:up` | Inicia PostgreSQL en segundo plano. |
| `pnpm db:check` | Comprueba si PostgreSQL acepta conexiones. |
| `pnpm db:migrate` | Aplica las migraciones SQL pendientes de `apps/backend/migrations/`. |
| `pnpm db:migrate:status` | Muestra qué migraciones ya se aplicaron. |
| `pnpm db:seed:dev` | Carga cuentas y datos ficticios en PostgreSQL de desarrollo local. |
| `pnpm db:logs` | Muestra los registros de PostgreSQL. |
| `pnpm db:psql` | Abre la consola SQL dentro del contenedor. |
| `pnpm db:down` | Detiene PostgreSQL y conserva el volumen de datos. |

`Ctrl+C` detiene los procesos de `pnpm dev`; la base se detiene por separado con `pnpm db:down`. Los scripts no eliminan el volumen. Las variables de inicialización de PostgreSQL se aplican solo al crear una base nueva; cambiar `.env` no modifica las credenciales de un volumen existente. Se incluyen más detalles en [infra/docker/README.md](infra/docker/README.md).

Los comandos de migración usan las variables `POSTGRES_*` de `.env` para desarrollo local. Para otra base, se puede proporcionar a Goose `GOOSE_DBSTRING` con la configuración de conexión correspondiente. La reversión del esquema inicial elimina sus tablas y se reserva para bases desechables durante la verificación. Los datos de prueba se cargan por separado.

## Alcance previsto

- Administrar insumos, productos preparados, bebidas y empaques, con variantes y unidades de control independientes.
- Establecer existencias mediante un conteo inicial, sin duplicar sobrantes de jornadas anteriores.
- Registrar entradas por compra, producción por tandas, salidas agrupadas, consumos y mermas con su motivo.
- Registrar correcciones autorizadas que conserven el movimiento original, el saldo anterior, el ajuste, el motivo y la autoría.
- Consultar existencias y movimientos por jornada, elemento, tipo y persona que registra.
- Confirmar la disponibilidad de cada producto o variante como disponible, agotado o no ofrecido.

Las relaciones entre componentes y porciones, los avisos de existencias bajas y los recordatorios de revisión de jornada son funciones complementarias pendientes de priorización.

## Roles

| Rol | Funciones previstas |
| --- | --- |
| Propietario o encargado (`admin`) | Administra el catálogo y los accesos, realiza tareas operativas y autoriza correcciones. |
| Personal que atiende clientes (`staff`) | Registra movimientos, consulta existencias e historial operativo y confirma disponibilidad dentro de su negocio. |

## Reglas principales

- Cada registro interno pertenece a un negocio; el acceso depende del rol y de esa pertenencia.
- Cada elemento o variante conserva una unidad de control definida; no se mezclan unidades sin una equivalencia explícita.
- Una tanda reúne los insumos consumidos y los productos obtenidos en una sola operación. La salida posterior de las piezas preparadas no vuelve a descontar esos ingredientes.
- Una salida superior al saldo requiere revisar la cantidad o corregir la existencia; no genera un saldo negativo silencioso.
- La existencia registrada y la disponibilidad se distinguen. Una reposición no revierte automáticamente un agotamiento confirmado manualmente.
- La interfaz distinguirá los cambios confirmados de los intentos pendientes o fallidos. Los reintentos no deben duplicar movimientos.

## Arquitectura y responsabilidades

El monorepositorio utiliza espacios de trabajo de pnpm. Los paquetes internos se enlazan mediante `workspace:*`:

| Componente | Tecnología prevista | Responsabilidad |
| --- | --- | --- |
| Frontend | Astro y TypeScript | Formularios y consultas adaptables al teléfono. |
| Backend | TypeScript y Fastify | API interna, validación, permisos por negocio, reglas de inventario y conexión a PostgreSQL. |
| Contratos compartidos | TypeScript | Tipos de solicitudes y respuestas entre frontend y backend. |
| Persistencia | PostgreSQL | Existencias, movimientos, autoría, autorizaciones y transacciones. |

Los contratos generan JavaScript ESM y declaraciones de tipos. Frontend y backend los declaran como dependencia. Las migraciones versionan el esquema sin cargar datos de negocios. La operación sin conexión y el uso simultáneo de varios dispositivos permanecen pendientes de validación.

## Límites

Quedan fuera la vista para clientes, los cobros, los pedidos, las compras en línea, la facturación, la contabilidad, la gestión fiscal, el reparto y la predicción automática de demanda.

El prototipo no determinará la inocuidad de los alimentos ni implicará una certificación normativa. La reducción de mermas, la exactitud del inventario y la utilidad durante la jornada deberán evaluarse; no se consideran beneficios comprobados.

## Diseño y evaluación

El diseño de referencia se mantiene en la carpeta `design/` del espacio de trabajo académico, fuera de este repositorio. Los capítulos I–IV documentan el contexto, los requisitos y los procesos propuestos; este repositorio reunirá la implementación y su documentación técnica.

La evaluación prevista contempla tareas de consulta de existencias, registro de movimientos y confirmación de disponibilidad. El desarrollo utiliza datos ficticios. Las pruebas con negocios requerirán las autorizaciones correspondientes.
