# Backend

API en TypeScript y Fastify con servicios internos de catálogo y conteo inicial respaldados por PostgreSQL.

Desde la raíz, después de crear `.env` e instalar dependencias:

```bash
pnpm --filter @inventario/contracts build
pnpm --filter @inventario/backend dev
```

- `GET http://127.0.0.1:3000/health`: confirma que el proceso responde.
- `GET http://127.0.0.1:3000/ready`: consulta PostgreSQL con `SELECT 1`; devuelve HTTP 503 si no puede conectarse.

El puerto y la conexión se configuran en el `.env` de la raíz. Las credenciales permanecen en el backend y no se incluyen en los contratos compartidos.

El servicio `crearCatalogo(pool)` administra unidades y variantes. `admin` puede crear y modificar el catálogo de su negocio. `staff` consulta las unidades y los elementos activos del suyo. El servicio recibe el identificador de una cuenta ya autenticada y comprueba su rol y negocio en PostgreSQL. A06 conectará estas operaciones a la sesión antes de exponerlas por HTTP.

`crearServicioApertura(pool)` permite a `admin` y `staff` registrar el primer conteo de un elemento en una jornada abierta de su negocio. La solicitud interna incluye el elemento, su unidad de control, la jornada y una clave UUID de reintento. La cantidad se envía como cadena decimal, por ejemplo `"0"` o `"2.375"`. El límite inicial es de doce cifras enteras y seis decimales, con una precisión configurable por unidad.

Al confirmar la apertura se guardan en una transacción el movimiento, su autor, su fecha y el saldo. `consultarExistencia` distingue un elemento sin conteo de un saldo de cero. El saldo se conserva entre jornadas. Si se pierde la respuesta, se reenvían los mismos datos con la misma clave para obtener la apertura guardada. Cambiar la unidad de un elemento con apertura o editar la definición de una unidad ya utilizada requiere un procedimiento posterior que preserve el historial.

Para la prueba de integración, configura `INVENTARIO_TEST_DATABASE_URL` con una base PostgreSQL de pruebas y ejecuta `pnpm test:inventario` desde la raíz. La cuenta de prueba debe poder crear un esquema. El comando aplica las migraciones en un esquema único y lo elimina al terminar.
