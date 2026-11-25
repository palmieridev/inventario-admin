# Backend

API en TypeScript y Fastify con sesiones, catálogo, conteo inicial y movimientos respaldados por PostgreSQL.

Desde la raíz, después de crear `.env`, instalar las dependencias y aplicar las migraciones:

```bash
pnpm --filter @inventario/contracts build
pnpm --filter @inventario/backend dev
```

- `GET http://127.0.0.1:3000/health` confirma que el proceso responde.
- `GET http://127.0.0.1:3000/ready` consulta PostgreSQL y devuelve HTTP 503 si no puede conectarse.

## Consultas de PostgreSQL

Las consultas se escriben en `queries/*.sql` y sqlc usa las migraciones de Goose de `migrations/` como fuente del esquema. Con sqlc v1.31.1 en `PATH`, ejecutar `pnpm db:generate` desde la raíz después de editar consultas o agregar una migración. El comando usa el complemento oficial de TypeScript fijado en `sqlc.yaml` y adapta su salida al modo estricto. Incluir los archivos de `src/db/consultas/` en el mismo commit que el SQL correspondiente.

Las funciones generadas reciben el cliente de `pg`. Dentro de `enTransaccion`, se les pasa el mismo cliente reservado hasta confirmar o revertir la operación. Las cantidades y los saldos viajan como cadenas decimales, y PostgreSQL hace la aritmética con `numeric`.

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

Las categorías son `insumo`, `preparado`, `bebida` y `empaque`. La cantidad de apertura se envía como cadena decimal, por ejemplo `"0"` o `"2.375"`, según la precisión de la unidad. La clave de reintento es un UUID generado para el intento. Si se pierde la respuesta, se reenvían los mismos datos con la misma clave para recuperar el resultado guardado. Tanto el registro inicial como el reintento confirmado devuelven HTTP 200. El frontend agrega `definicion` con el nombre, la variante, la categoría y los datos de la unidad mostrada. Si alguno cambia antes de guardar un conteo nuevo, la API devuelve HTTP 409 (`catalogo_cambiado`) y conserva el saldo. Los reintentos de conteos ya confirmados recuperan la apertura original. Para un intento guardado antes de que existiera `definicion`, el frontend envía `soloConfirmada: true`. Si la clave aún no está registrada en el negocio, la API devuelve HTTP 409 (`apertura_no_confirmada`) sin crear un conteo con la definición vigente. Si la clave corresponde a otra operación, devuelve HTTP 409 (`reintento_distinto`).

La apertura se guarda junto con el movimiento, la fecha, el autor y el saldo. Un conteo nuevo exige una jornada iniciada y abierta. El saldo se conserva entre jornadas. Cambiar la unidad de un elemento con apertura o editar la definición de una unidad ya utilizada requiere un procedimiento posterior que preserve el historial.

## Movimientos, producción y persistencia (A08–A09)

Aplicar `pnpm db:migrate` antes de usar estas rutas. La migración 00003 agrega las operaciones y sus líneas sin alterar los conteos existentes. Los formularios corresponden a A10; A08 incorpora la API y las reglas de persistencia.

- `POST /api/inventario/movimientos`: registra una operación completa o recupera su confirmación, con HTTP 200.
- `GET /api/inventario/movimientos/:id`: recupera la operación y sus líneas dentro del negocio de la sesión. El listado y los filtros de historial pertenecen a una actividad posterior.

Ambas rutas requieren sesión. `admin` y `staff` registran compras, tandas, salidas, consumos y mermas; solo `admin` registra ajustes. Cada solicitud incluye `jornadaId` y `claveReintento` (UUID), además de `observacion` opcional (hasta 500 caracteres). El servidor asigna una sola fecha `registradaEn` después de bloquear todos los elementos de la operación, la usa para actualizar sus saldos y la devuelve en ISO 8601 UTC; la pertenencia a una jornada no cambia al pasar medianoche. No se admiten capturas nuevas en jornadas futuras o cerradas.

| `tipo` | Datos específicos | Efecto |
| --- | --- | --- |
| `compra` | `lineas` | Suma las cantidades declaradas. |
| `tanda` | `insumos`, `productos` | Resta insumos y suma productos preparados en una transacción. `insumos: []` es válido cuando no se lleva su control; no se inventan rendimientos. |
| `salida` | `lineas`, `motivo` | Resta cantidades agrupadas; admite motivos como venta, muestra o regalo. |
| `consumo` | `lineas`, `motivo` | Resta el consumo declarado, por ejemplo del personal. |
| `merma` | `lineas`, `motivo` | Resta cantidades con causa `deterioro`, `caducidad`, `dano_traslado`, `error_preparacion` u `otra`. Son opciones iniciales pendientes de validación con participantes. |
| `ajuste` | `lineas`, `motivo` | Establece el conteo físico declarado; registra la variación sin sustituir movimientos anteriores. |

Cada línea contiene `{ elementoId, unidadId, cantidad }`. La cantidad se envía como cadena decimal exacta, con hasta doce cifras enteras y seis decimales, respetando la unidad de control. Debe ser positiva, excepto el conteo físico de un ajuste, que admite cero. Se permiten hasta cien líneas por lista y cada elemento aparece una sola vez por operación. Todos los elementos deben estar activos y tener un conteo inicial; para un preparado recién incorporado, registrar primero un conteo de cero. El motivo obligatorio admite hasta 240 caracteres.

Ejemplo de una compra, sustituyendo los identificadores por UUID del negocio:

```ts
const compra: RegistroMovimiento = {
  tipo: 'compra',
  jornadaId,
  claveReintento: crypto.randomUUID(),
  lineas: [{ elementoId, unidadId, cantidad: '5' }],
};
```

La respuesta `MovimientoConfirmado` incluye `operacionId`, `autorId`, `jornadaId`, `tipo`, `registradaEn`, `motivo`, `observacion` y `lineas`. Cada línea devuelve `elementoId`, `unidadId`, `saldoAnterior`, `saldoResultante` y `variacion` como cantidades decimales en texto. En un ajuste de diez a ocho, la variación es `"-2"`. Una salida de piezas preparadas modifica solo sus existencias: no vuelve a consumir los ingredientes de la tanda.

La clave de reintento pertenece al negocio y se comparte con las aperturas. Si se pierde la respuesta, conservar la captura y su clave. Para verificar el resultado, enviar la misma captura a `POST /api/inventario/movimientos` con `soloConfirmada: true`. La API devuelve la confirmación con HTTP 200 o `movimiento_no_confirmado` (409) si aún no encuentra un registro para la clave. La consulta no realiza ningún cambio. Si hace falta volver a intentar la captura, reenviar los mismos datos con la misma clave y omitir `soloConfirmada`. Se recupera la respuesta original incluso tras cerrar la jornada o desactivar el elemento, siempre que la cuenta conserve su acceso y permiso. Cambiar la autoría, el tipo o el contenido con la misma clave devuelve `reintento_distinto` (409). El orden de las líneas y los ceros decimales finales no cambian la identidad del intento.

Una cantidad superior al saldo devuelve `saldo_insuficiente` (409); la ausencia de conteo inicial, `conteo_requerido` (409); exceder doce cifras enteras de saldo, `saldo_excedido` (409). Ninguno guarda líneas o saldos parciales. Los bloqueos de PostgreSQL serializan las operaciones sobre los mismos elementos y la restricción única de clave evita duplicar movimientos. Esto no implementa operación sin conexión ni resuelve la interacción entre varios dispositivos.

## Pruebas locales

Para probar mediante HTTP con cuentas ficticias, cargar los datos de demostración siguiendo el [README del repositorio](../../README.md). Las pantallas de acceso y catálogo corresponden a A07.

Para ejecutar la suite de integración, configurar `INVENTARIO_TEST_DATABASE_URL` con una base PostgreSQL de pruebas y ejecutar `pnpm test:inventario` desde la raíz. La cuenta de prueba debe poder crear esquemas. Goose aplica las migraciones en un esquema único que se elimina al terminar. La suite comprueba sesiones, revocación, aislamiento entre dos negocios, permisos de catálogo, conteos, reintentos y conservación de la autoría. Para A08 comprueba compras, causas de merma, consumo, producción sin doble descuento, ajuste exclusivo de admin, precisión decimal, concurrencia, recuperación tras cierre y reversión completa cuando falla una línea.

Para A09, la suite comprueba la consulta de confirmaciones, los conflictos de clave entre tipos de operación y la reversión de una tanda cuando PostgreSQL rechaza la segunda línea. Para verificar un reinicio en una instancia desechable, guardar la respuesta de una tanda y de una salida posterior. Reiniciar PostgreSQL y volver a consultar ambas por su identificador. Comprobar que `soloConfirmada: true` y el reenvío con la misma clave devuelven la tanda original, y que las existencias reflejan también la salida. Para verificar una copia, restaurar el respaldo en otra base de pruebas y repetir estas consultas.
