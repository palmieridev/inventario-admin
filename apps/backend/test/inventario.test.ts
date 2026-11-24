import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { prepararClave } from '../src/acceso/credenciales.js';
import { createApp } from '../src/app.js';
import { crearServicioApertura } from '../src/inventario/apertura.js';
import { crearCatalogo } from '../src/inventario/catalogo.js';

const url = process.env.INVENTARIO_TEST_DATABASE_URL;
if (!url) throw new Error('Configura INVENTARIO_TEST_DATABASE_URL con una base de pruebas.');

const esquema = 'a05_' + randomUUID().replaceAll('-', '');
const base = new pg.Pool({ connectionString: url });
const conexion = new URL(url);
conexion.searchParams.set('options', '-csearch_path=' + esquema);
const pool = new pg.Pool({ connectionString: conexion.toString() });
const app = createApp(new pg.Pool({ connectionString: conexion.toString() }), { cookieSegura: true, logger: false });
const catalogo = crearCatalogo(pool);
const inventario = crearServicioApertura(pool);
const migraciones = fileURLToPath(new URL('../migrations/', import.meta.url));

before(async () => {
  await base.query('CREATE SCHEMA ' + esquema);
  assert.equal((await pool.query('SELECT current_schema() AS nombre')).rows[0].nombre, esquema);
  execFileSync('goose', ['-dir', migraciones, 'up'], {
    env: { ...process.env, GOOSE_DRIVER: 'postgres', GOOSE_DBSTRING: conexion.toString() },
    stdio: 'inherit',
  });
});

after(async () => {
  await app.close();
  await pool.end();
  try {
    await base.query('DROP SCHEMA IF EXISTS ' + esquema + ' CASCADE');
  } finally {
    await base.end();
  }
});

async function negocio(nombre: string) {
  const id = randomUUID();
  const admin = randomUUID();
  const staff = randomUUID();
  await pool.query('INSERT INTO negocios (id, nombre) VALUES ($1, $2)', [id, nombre]);
  await pool.query(
    "INSERT INTO usuarios (id, negocio_id, nombre, rol) VALUES ($1, $3, 'Encargado', 'admin'), ($2, $3, 'Personal', 'staff')",
    [admin, staff, id],
  );
  return { id, admin, staff };
}

const contrasena = 'Credencial ficticia para pruebas';

async function asignarCuenta(id: string, cuenta: string) {
  await pool.query('UPDATE usuarios SET cuenta = $2, clave_derivada = $3 WHERE id = $1',
    [id, cuenta, await prepararClave(contrasena)]);
}

async function iniciarSesion(cuenta: string) {
  const respuesta = await app.inject({
    method: 'POST', url: '/api/sesion', payload: { cuenta, contrasena },
  });
  assert.equal(respuesta.statusCode, 200, respuesta.body);
  const cabecera = respuesta.headers['set-cookie'];
  assert.equal(typeof cabecera, 'string');
  return { respuesta, cabecera: cabecera as string, cookie: (cabecera as string).split(';')[0]! };
}

test('emite sesiones opacas, consulta la cuenta vigente y cierra o expira cada sesión por separado', async () => {
  const puesto = await negocio('Puesto con acceso');
  await asignarCuenta(puesto.admin, 'admin.sesion');
  const anonima = await app.inject({ method: 'GET', url: '/api/sesion' });
  assert.equal(anonima.statusCode, 401);

  const rechazo = await app.inject({
    method: 'POST', url: '/api/sesion', payload: { cuenta: 'admin.sesion', contrasena: 'incorrecta' },
  });
  assert.equal(rechazo.statusCode, 401);
  assert.equal(rechazo.json().codigo, 'credenciales_invalidas');
  assert.equal(rechazo.headers['set-cookie'], undefined);

  const primera = await iniciarSesion(' ADMIN.SESION ');
  const segunda = await iniciarSesion('admin.sesion');
  assert.notEqual(primera.cookie, segunda.cookie);
  assert.match(primera.cabecera, /HttpOnly/);
  assert.match(primera.cabecera, /SameSite=Strict/);
  assert.match(primera.cabecera, /Secure/);
  assert.equal(primera.respuesta.headers['cache-control'], 'no-store');
  const perfil = { id: puesto.admin, negocioId: puesto.id, nombre: 'Encargado', rol: 'admin' };
  assert.deepEqual(primera.respuesta.json(), perfil);
  const token = primera.cookie.split('=')[1]!;
  const huella = createHash('sha256').update(token).digest('hex');
  assert.equal((await pool.query('SELECT usuario_id FROM sesiones WHERE huella = $1', [huella])).rows[0].usuario_id,
    puesto.admin);

  const consultar = (cookie: string) => app.inject({ method: 'GET', url: '/api/sesion', headers: { cookie } });
  assert.deepEqual((await consultar(primera.cookie)).json(), perfil);

  const cierre = await app.inject({ method: 'DELETE', url: '/api/sesion', headers: { cookie: primera.cookie } });
  assert.equal(cierre.statusCode, 204);
  assert.match(String(cierre.headers['set-cookie']), /inventario_sesion=;/);
  assert.equal((await consultar(primera.cookie)).statusCode, 401);
  assert.equal((await consultar(segunda.cookie)).statusCode, 200);

  await pool.query("UPDATE sesiones SET vence_en = now() - interval '1 second' WHERE usuario_id = $1", [puesto.admin]);
  assert.equal((await consultar(segunda.cookie)).statusCode, 401);
});

test('mantiene categorías, variantes y unidades independientes por negocio', async () => {
  const puesto = await negocio('Tamales de prueba');
  const otro = await negocio('Puesto vecino');
  const pieza = await catalogo.crearUnidad(puesto.admin, { nombre: ' Pieza ', simbolo: 'pza', decimales: 0 });
  const kg = await catalogo.crearUnidad(puesto.admin, { nombre: 'Kilogramo', simbolo: 'kg', decimales: 3 });
  const otraPieza = await catalogo.crearUnidad(otro.admin, { nombre: 'Pieza', simbolo: 'pza', decimales: 0 });

  const tamal = { categoria: 'preparado', nombre: 'Tamal', unidadId: pieza.id };
  const dulce = await catalogo.crearElemento(puesto.admin, { ...tamal, variante: 'Dulce' });
  const verde = await catalogo.crearElemento(puesto.admin, { ...tamal, variante: 'Verde' });
  await catalogo.crearElemento(puesto.admin, { categoria: 'insumo', nombre: 'Masa', unidadId: kg.id });
  await catalogo.crearElemento(puesto.admin, { categoria: 'bebida', nombre: 'Agua', unidadId: pieza.id });
  await catalogo.crearElemento(puesto.admin, { categoria: 'empaque', nombre: 'Vaso', unidadId: pieza.id });
  const otroTamal = await catalogo.crearElemento(otro.admin, { ...tamal, unidadId: otraPieza.id, variante: 'Dulce' });

  assert.notEqual(dulce.id, verde.id);
  assert.deepEqual(new Set((await catalogo.listarElementos(puesto.staff)).map((e) => e.categoria)),
    new Set(['insumo', 'preparado', 'bebida', 'empaque']));
  assert.deepEqual((await catalogo.listarElementos(otro.staff)).map((e) => e.id), [otroTamal.id]);
  assert.deepEqual((await catalogo.listarUnidades(puesto.staff)).map((u) => u.nombre), ['Kilogramo', 'Pieza']);
  await assert.rejects(catalogo.crearElemento(puesto.admin, { ...tamal, variante: ' DULCE ' }),
    { codigo: 'catalogo_duplicado' });
  await assert.rejects(catalogo.crearElemento(puesto.admin, { ...tamal, unidadId: otraPieza.id }),
    { codigo: 'no_encontrado' });
  await assert.rejects(catalogo.modificarElemento(otro.admin, dulce.id, { ...tamal, unidadId: otraPieza.id }),
    { codigo: 'no_encontrado' });

  const editado = await catalogo.modificarElemento(puesto.admin, verde.id, { ...tamal, variante: 'Salsa verde' });
  assert.equal(editado.variante, 'Salsa verde');
  await catalogo.modificarElemento(puesto.admin, verde.id, { ...editado, activo: false });
  assert(!(await catalogo.listarElementos(puesto.staff)).some((e) => e.id === verde.id));
  assert((await catalogo.listarElementos(puesto.admin)).some((e) => e.id === verde.id && !e.activo));
});

test('rechaza cambios de catálogo desde staff o cuentas revocadas', async () => {
  const puesto = await negocio('Puesto de bebidas');
  const entrada = { nombre: 'Botella', simbolo: 'bot', decimales: 0 };
  await assert.rejects(catalogo.crearUnidad(puesto.staff, entrada), { codigo: 'acceso_denegado' });
  const unidad = await catalogo.crearUnidad(puesto.admin, entrada);
  const datos = { categoria: 'bebida', nombre: 'Agua', unidadId: unidad.id };
  const agua = await catalogo.crearElemento(puesto.admin, datos);
  await assert.rejects(catalogo.crearElemento(puesto.staff, datos), { codigo: 'acceso_denegado' });
  await assert.rejects(catalogo.modificarElemento(puesto.staff, agua.id, datos), { codigo: 'acceso_denegado' });
  await assert.rejects(catalogo.modificarUnidad(puesto.staff, unidad.id, entrada), { codigo: 'acceso_denegado' });
  await assert.rejects(catalogo.modificarUnidad(puesto.admin, unidad.id, { ...entrada, decimales: 7 }),
    { codigo: 'datos_invalidos' });
  const editada = await catalogo.modificarUnidad(puesto.admin, unidad.id, { ...entrada, simbolo: 'botella' });
  assert.equal(editada.simbolo, 'botella');

  await pool.query('UPDATE usuarios SET activo = false WHERE id = $1', [puesto.staff]);
  await assert.rejects(catalogo.listarElementos(puesto.staff), { codigo: 'acceso_denegado' });
});

async function abrirJornada(negocioId: string) {
  const id = randomUUID();
  await pool.query('INSERT INTO jornadas (id, negocio_id) VALUES ($1, $2)', [id, negocioId]);
  return id;
}

test('registra una apertura por variante, incluye cero y conserva el saldo entre jornadas', async () => {
  const puesto = await negocio('Tamales de apertura');
  const jornadaId = await abrirJornada(puesto.id);
  const pieza = await catalogo.crearUnidad(puesto.admin, { nombre: 'Pieza', simbolo: 'pza', decimales: 0 });
  const datos = { categoria: 'preparado', nombre: 'Tamal', unidadId: pieza.id };
  const dulce = await catalogo.crearElemento(puesto.admin, { ...datos, variante: 'Dulce' });
  const verde = await catalogo.crearElemento(puesto.admin, { ...datos, variante: 'Verde' });

  assert.equal(await inventario.consultarExistencia(puesto.staff, dulce.id), null);
  const primerConteo = { jornadaId, unidadId: pieza.id, elementoId: dulce.id, cantidad: '0', claveReintento: randomUUID() };
  const apertura = await inventario.registrarApertura(puesto.staff, primerConteo);
  await inventario.registrarApertura(puesto.admin, {
    ...primerConteo, elementoId: verde.id, cantidad: '10', claveReintento: randomUUID(),
  });
  const saldoDulce = await inventario.consultarExistencia(puesto.staff, dulce.id);
  assert.deepEqual(saldoDulce, {
    elementoId: dulce.id, unidadId: pieza.id, cantidad: '0', actualizadaEn: apertura.registradaEn,
  });
  assert.equal(apertura.autorId, puesto.staff);
  assert.equal(apertura.jornadaId, jornadaId);

  await pool.query('UPDATE jornadas SET cerrada_en = now() WHERE id = $1', [jornadaId]);
  assert.deepEqual(await inventario.registrarApertura(puesto.staff, { ...primerConteo, cantidad: '0.00' }), apertura);
  await assert.rejects(inventario.registrarApertura(puesto.admin, primerConteo), { codigo: 'reintento_distinto' });
  await assert.rejects(inventario.registrarApertura(puesto.staff, { ...primerConteo, cantidad: '1' }),
    { codigo: 'reintento_distinto' });
  const segundaJornada = await abrirJornada(puesto.id);
  await assert.rejects(inventario.registrarApertura(puesto.staff, {
    ...primerConteo, jornadaId: segundaJornada, cantidad: '3', claveReintento: randomUUID(),
  }), { codigo: 'apertura_existente' });
  assert.equal((await inventario.consultarExistencia(puesto.staff, verde.id))?.cantidad, '10');
  assert.deepEqual(await inventario.consultarExistencia(puesto.staff, dulce.id), saldoDulce);

  const caja = await catalogo.crearUnidad(puesto.admin, { nombre: 'Caja', simbolo: 'caja', decimales: 0 });
  await assert.rejects(catalogo.modificarElemento(puesto.admin, dulce.id, {
    ...datos, unidadId: caja.id, variante: 'Dulce',
  }), { codigo: 'unidad_con_historial' });
  await assert.rejects(catalogo.modificarUnidad(puesto.admin, pieza.id, {
    nombre: 'Pieza', simbolo: 'pza', decimales: 1,
  }), { codigo: 'unidad_con_historial' });

  const { rows } = await pool.query(
    'SELECT tipo, count(*)::int AS total FROM operaciones_inventario WHERE negocio_id = $1 GROUP BY tipo',
    [puesto.id],
  );
  assert.deepEqual(rows, [{ tipo: 'apertura', total: 2 }]);
});

test('rechaza el conteo antes del inicio de la jornada y permite reintentarlo cuando inicia', async () => {
  const puesto = await negocio('Puesto con jornada programada');
  const jornadaId = randomUUID();
  await pool.query(
    "INSERT INTO jornadas (id, negocio_id, iniciada_en) VALUES ($1, $2, now() + interval '1 day')",
    [jornadaId, puesto.id],
  );
  const pieza = await catalogo.crearUnidad(puesto.admin, { nombre: 'Pieza', simbolo: 'pza', decimales: 0 });
  const bebida = await catalogo.crearElemento(puesto.admin, {
    categoria: 'bebida', nombre: 'Agua', unidadId: pieza.id,
  });
  const datos = {
    jornadaId, elementoId: bebida.id, unidadId: pieza.id, cantidad: '3', claveReintento: randomUUID(),
  };

  await assert.rejects(inventario.registrarApertura(puesto.staff, datos), { codigo: 'jornada_no_iniciada' });
  assert.equal(await inventario.consultarExistencia(puesto.staff, bebida.id), null);
  const operaciones = await pool.query('SELECT id FROM operaciones_inventario WHERE jornada_id = $1', [jornadaId]);
  assert.equal(operaciones.rowCount, 0);

  await pool.query('UPDATE jornadas SET iniciada_en = now() WHERE id = $1', [jornadaId]);
  const confirmada = await inventario.registrarApertura(puesto.staff, datos);
  assert.equal(confirmada.cantidad, '3');
  assert.deepEqual(await inventario.registrarApertura(puesto.staff, datos), confirmada);
});

test('preserva decimales y rechaza datos incompatibles o de otro negocio sin saldos parciales', async () => {
  const puesto = await negocio('Puesto de masa');
  const otro = await negocio('Segundo puesto de masa');
  const jornadaId = await abrirJornada(puesto.id);
  const jornadaAjena = await abrirJornada(otro.id);
  const kg = await catalogo.crearUnidad(puesto.admin, { nombre: 'Kilogramo', simbolo: 'kg', decimales: 3 });
  const pieza = await catalogo.crearUnidad(puesto.admin, { nombre: 'Pieza', simbolo: 'pza', decimales: 0 });
  const masa = await catalogo.crearElemento(puesto.admin, { categoria: 'insumo', nombre: 'Masa', unidadId: kg.id });
  const datos = {
    jornadaId, unidadId: kg.id, elementoId: masa.id, cantidad: '999999999999.123', claveReintento: randomUUID(),
  };

  await assert.rejects(inventario.registrarApertura(puesto.staff, { ...datos, jornadaId: jornadaAjena }),
    { codigo: 'no_encontrado' });
  await assert.rejects(inventario.registrarApertura(otro.staff, { ...datos, jornadaId: jornadaAjena }),
    { codigo: 'no_encontrado' });
  await assert.rejects(inventario.consultarExistencia(otro.staff, masa.id), { codigo: 'no_encontrado' });
  await assert.rejects(inventario.registrarApertura(puesto.staff, { ...datos, unidadId: pieza.id }),
    { codigo: 'datos_invalidos' });
  await assert.rejects(inventario.registrarApertura(puesto.staff, { ...datos, cantidad: '0.1234' }),
    { codigo: 'datos_invalidos' });
  await assert.rejects(inventario.registrarApertura(puesto.staff, { ...datos, cantidad: '-1' }),
    { codigo: 'datos_invalidos' });
  assert.equal(await inventario.consultarExistencia(puesto.staff, masa.id), null);
  assert.equal((await pool.query(
    'SELECT id FROM operaciones_inventario WHERE negocio_id = ANY($1::uuid[])', [[puesto.id, otro.id]],
  )).rowCount, 0);

  // Un intento inválido no consume la clave.
  await inventario.registrarApertura(puesto.staff, datos);
  assert.equal((await inventario.consultarExistencia(puesto.staff, masa.id))?.cantidad, datos.cantidad);
});

test('serializa reintentos y aperturas repetidas en conexiones independientes', async () => {
  const puesto = await negocio('Puesto con capturas simultáneas');
  const jornadaId = await abrirJornada(puesto.id);
  const pieza = await catalogo.crearUnidad(puesto.admin, { nombre: 'Pieza', simbolo: 'pza', decimales: 0 });
  const vaso = await catalogo.crearElemento(puesto.admin, { categoria: 'empaque', nombre: 'Vaso', unidadId: pieza.id });
  const plato = await catalogo.crearElemento(puesto.admin, { categoria: 'empaque', nombre: 'Plato', unidadId: pieza.id });
  const datos = { jornadaId, unidadId: pieza.id, elementoId: vaso.id, cantidad: '20', claveReintento: randomUUID() };
  const [original, reintento] = await Promise.all([
    inventario.registrarApertura(puesto.staff, datos),
    inventario.registrarApertura(puesto.staff, datos),
  ]);
  assert.deepEqual(original, reintento);

  const resultados = await Promise.allSettled([
    inventario.registrarApertura(puesto.admin, { ...datos, elementoId: plato.id, claveReintento: randomUUID() }),
    inventario.registrarApertura(puesto.staff, { ...datos, elementoId: plato.id, claveReintento: randomUUID() }),
  ]);
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
  const duplicado = resultados.find((r) => r.status === 'rejected');
  assert.equal(duplicado?.reason.codigo, 'apertura_existente');
  assert.equal((await inventario.consultarExistencia(puesto.staff, plato.id))?.cantidad, '20');
  assert.equal((await pool.query('SELECT id FROM operaciones_inventario WHERE negocio_id = $1', [puesto.id])).rowCount, 2);
});
