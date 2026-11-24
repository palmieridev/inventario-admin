# Backend

API en TypeScript y Fastify con sesiones, catálogo y conteo inicial respaldados por PostgreSQL.

Desde la raíz, después de crear `.env`, instalar las dependencias y aplicar las migraciones:

```bash
pnpm --filter @inventario/contracts build
pnpm --filter @inventario/backend dev
```

- `GET http://127.0.0.1:3000/health` confirma que el proceso responde.
- `GET http://127.0.0.1:3000/ready` consulta PostgreSQL y devuelve HTTP 503 si no puede conectarse.

## Sesión y personal

Los cuerpos de solicitud se envían como JSON. Las cuentas se normalizan a minúsculas y son únicas, de modo que el servidor puede resolver el negocio desde el inicio de sesión. El nombre de cuenta admite de 3 a 64 letras sin acentos, números, puntos, guiones o guiones bajos. Debe comenzar con una letra o un número. La contraseña debe tener al menos 12 caracteres y ocupar hasta 256 bytes. Se deriva con scrypt y se guarda con una sal individual.

| Método y ruta | Solicitud y resultado |
| --- | --- |
| `POST /api/sesion` | Recibe `{ "cuenta": "...", "contrasena": "..." }` y devuelve el perfil `{ id, negocioId, nombre, rol }` junto con la cookie. |
| `GET /api/sesion` | Devuelve el perfil de la cuenta activa. |
| `DELETE /api/sesion` | Cancela la sesión presentada y elimina su cookie. Devuelve HTTP 204. |
| `GET /api/personal` | Lista las cuentas `staff` del negocio, con su estado. Requiere `admin`. |
| `POST /api/personal` | Recibe `{ nombre, cuenta, contrasena }`, crea una cuenta `staff` en el negocio y devuelve HTTP 201. Requiere `admin`. |
| `PATCH /api/personal/:id` | Recibe `{ activo: false }` para revocar o `{ activo: true }` para habilitar. Si la cuenta viene de A05 y carece de credenciales, incluir `credenciales: { cuenta, contrasena }` al habilitarla. Requiere `admin`. |

La cookie `inventario_sesion` es `HttpOnly` y `SameSite=Strict`, con una vigencia de 12 horas desde el inicio de sesión. En desarrollo local por HTTP se admite sin el atributo `Secure` si `API_HOST` es de loopback. En otros ambientes, servir el frontend y la API interna por HTTPS y enrutar `/api` desde el mismo origen. Con `NODE_ENV=production` el atributo `Secure` es obligatorio. Al revocar una cuenta se cancelan todas sus sesiones y se mantiene su autoría en los registros de inventario. Si la cuenta se rehabilita, la persona deberá volver a iniciar sesión.

Las respuestas de datos indican `Cache-Control: no-store`. Los errores de las operaciones contienen `{ codigo, mensaje }`. Una sesión ausente, expirada o revocada devuelve HTTP 401, un rol insuficiente devuelve HTTP 403 y un recurso de otro negocio responde con HTTP 404. El inicio de sesión devuelve HTTP 429 al superar diez intentos por minuto desde una misma dirección de cliente. El frontend envía `X-Inventario-Cuenta` con el identificador de la cuenta que cargó la pantalla. Si la cookie corresponde a otra cuenta, la API devuelve HTTP 409 (`sesion_cambiada`) antes de consultar o modificar datos. La cookie sigue siendo la credencial de acceso.

Para un despliegue con proxy inverso compartido, configurar `API_TRUSTED_PROXIES` con las direcciones IP o rangos CIDR exclusivos de los proxies administrados, separados por comas. El proxy que recibe las conexiones de los clientes debe establecer `X-Forwarded-For` con la dirección que observa. Fastify utiliza la dirección reenviada cuando la conexión directa proviene de un proxy de confianza. Con la variable vacía, Fastify utiliza la dirección de la conexión directa.

## Catálogo y conteo inicial

Las rutas de inventario requieren la cookie de sesión. El negocio, el rol y la autoría provienen de la cuenta resuelta por el servidor.

| Método y ruta | Acceso y resultado |
| --- | --- |
| `GET /api/inventario/unidades` | Ambos roles consultan las unidades del negocio. |
| `POST /api/inventario/unidades` | `admin` crea una unidad con `{ nombre, simbolo, decimales }`. `decimales` es un entero entre 0 y 6. |
| `PUT /api/inventario/unidades/:id` | `admin` actualiza la definición de una unidad. |
| `GET /api/inventario/elementos` | Ambos roles consultan el catálogo. `staff` recibe los elementos activos. |
| `POST /api/inventario/elementos` | `admin` crea un elemento con `{ unidadId, categoria, nombre, variante?, activo? }`. |
| `PUT /api/inventario/elementos/:id` | `admin` actualiza la definición de un elemento. |
| `GET /api/inventario/jornadas` | Ambos roles consultan las jornadas ya iniciadas y abiertas de su negocio. |
| `POST /api/inventario/aperturas` | Ambos roles registran el primer conteo con `{ elementoId, unidadId, jornadaId, cantidad, claveReintento }`. |
| `GET /api/inventario/elementos/:id/existencia` | Ambos roles consultan `{ existencia }`. Un elemento pendiente de conteo devuelve `{ "existencia": null }`. |

Las categorías son `insumo`, `preparado`, `bebida` y `empaque`. La cantidad de apertura se envía como cadena decimal, por ejemplo `"0"` o `"2.375"`, según la precisión de la unidad. La clave de reintento es un UUID generado para el intento. Si se pierde la respuesta, se reenvían los mismos datos con la misma clave para recuperar el resultado guardado. Tanto el registro inicial como el reintento confirmado devuelven HTTP 200.

La apertura se guarda junto con el movimiento, la fecha, el autor y el saldo. Un conteo nuevo exige una jornada iniciada y abierta. El saldo se conserva entre jornadas. Cambiar la unidad de un elemento con apertura o editar la definición de una unidad ya utilizada requiere un procedimiento posterior que preserve el historial.

## Pruebas locales

Para probar mediante HTTP con cuentas ficticias, cargar los datos de demostración siguiendo el [README del repositorio](../../README.md). Las pantallas de acceso y catálogo corresponden a A07.

Para ejecutar la suite de integración, configurar `INVENTARIO_TEST_DATABASE_URL` con una base PostgreSQL de pruebas y ejecutar `pnpm test:inventario` desde la raíz. La cuenta de prueba debe poder crear esquemas. Goose aplica las migraciones en un esquema único que se elimina al terminar. La suite comprueba sesiones, revocación, aislamiento entre dos negocios, permisos de catálogo, conteos, reintentos y conservación de la autoría.
