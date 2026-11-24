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

async function iniciarSesion(cuenta: string, remoteAddress = '127.0.0.1') {
  const respuesta = await app.inject({
    method: 'POST', url: '/api/sesion', payload: { cuenta, contrasena }, remoteAddress,
  });
  assert.equal(respuesta.statusCode, 200, respuesta.body);
  const cabecera = respuesta.headers['set-cookie'];
  assert.equal(typeof cabecera, 'string');
  return { respuesta, cabecera, cookie: cabecera.split(';')[0]! };
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

test('limita los intentos de inicio de sesión por dirección', async () => {
  const intentar = (remoteAddress: string) => app.inject({
    method: 'POST', url: '/api/sesion', payload: { cuenta: 'cuenta.inexistente' }, remoteAddress,
  });
  for (let intento = 0; intento < 10; intento++) {
    assert.equal((await intentar('192.0.2.10')).statusCode, 401);
  }
  const limitado = await intentar('192.0.2.10');
  assert.equal(limitado.statusCode, 429, limitado.body);
  assert.equal(limitado.json().codigo, 'limite_de_intentos');
  assert.equal((await intentar('192.0.2.11')).statusCode, 401);
});

test('separa el cupo de inicio de sesión de dos clientes que usan el mismo proxy de confianza', async () => {
  const puesto = await negocio('Puesto con proxy');
  const otro = await negocio('Puesto vecino con proxy');
  await asignarCuenta(puesto.admin, 'admin.proxy');
  await asignarCuenta(otro.staff, 'staff.proxy');
  const ipProxy = '192.0.2.80';
  const appProxy = createApp(new pg.Pool({ connectionString: conexion.toString() }), {
    cookieSegura: true, logger: false, proxiesDeConfianza: [ipProxy],
  });
  try {
    const iniciar = async (cuenta: string, ipCliente: string) => {
      const respuesta = await appProxy.inject({
        method: 'POST', url: '/api/sesion', remoteAddress: ipProxy,
        headers: { 'x-forwarded-for': ipCliente }, payload: { cuenta, contrasena },
      });
      assert.equal(respuesta.statusCode, 200, respuesta.body);
      return respuesta.headers['x-ratelimit-remaining'];
    };
    assert.equal(await iniciar('admin.proxy', '198.51.100.25'), '9');
    assert.equal(await iniciar('admin.proxy', '198.51.100.25'), '8');
    assert.equal(await iniciar('staff.proxy', '198.51.100.26'), '9');
  } finally {
    await appProxy.close();
  }
});

test('restringe el alta y la revocación a admin del negocio e invalida todas las sesiones de staff', async () => {
  const puesto = await negocio('Puesto de accesos');
  const otro = await negocio('Puesto vecino de accesos');
  await asignarCuenta(puesto.admin, 'admin.personal');
  const direccion = '192.0.2.20';
  const admin = await iniciarSesion('admin.personal', direccion);
  const alta = { cuenta: 'Staff.Alta', contrasena, nombre: 'Caja' };
  const solicitar = (cookie: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie }, payload });
  const crear = await solicitar(admin.cookie, 'POST', '/api/personal', {
    ...alta, negocioId: otro.id, rol: 'admin',
  });
  assert.equal(crear.statusCode, 201, crear.body);
  const personalId = crear.json().id;
  assert.deepEqual(crear.json(), { id: personalId, cuenta: 'staff.alta', nombre: 'Caja', activo: true });
  const repetida = await solicitar(admin.cookie, 'POST', '/api/personal', alta);
  assert.equal(repetida.statusCode, 409);

  const primera = await iniciarSesion('staff.alta', direccion);
  const segunda = await iniciarSesion('staff.alta', direccion);
  assert.deepEqual(primera.respuesta.json(), { id: personalId, negocioId: puesto.id, nombre: 'Caja', rol: 'staff' });
  assert.equal((await solicitar(primera.cookie, 'POST', '/api/personal', alta)).statusCode, 403);
  assert.equal((await solicitar(primera.cookie, 'GET', '/api/personal')).statusCode, 403);
  const cambiar = (cookie: string, id: string, payload: object) =>
    solicitar(cookie, 'PATCH', '/api/personal/' + id, payload);
  assert.equal((await cambiar(primera.cookie, personalId, { activo: false })).statusCode, 403);
  assert.equal((await cambiar(admin.cookie, otro.staff, { activo: false })).statusCode, 404);
  assert.equal((await cambiar(admin.cookie, puesto.admin, { activo: false })).statusCode, 404);
  const listado = await solicitar(admin.cookie, 'GET', '/api/personal');
  assert.equal(listado.statusCode, 200);
  assert.deepEqual(listado.json().map((p: { id: string }) => p.id).sort(), [personalId, puesto.staff].sort());

  const revocar = await cambiar(admin.cookie, personalId, { activo: false });
  assert.equal(revocar.statusCode, 200);
  assert.equal(revocar.json().activo, false);
  assert.equal((await solicitar(primera.cookie, 'GET', '/api/sesion')).statusCode, 401);
  assert.equal((await solicitar(segunda.cookie, 'GET', '/api/sesion')).statusCode, 401);
  const inactiva = await app.inject({
    method: 'POST', url: '/api/sesion', payload: alta, remoteAddress: direccion,
  });
  assert.equal(inactiva.statusCode, 401);

  assert.equal((await cambiar(admin.cookie, personalId, { activo: true })).statusCode, 200);
  assert.equal((await solicitar(primera.cookie, 'GET', '/api/sesion')).statusCode, 401);
  assert.equal((await solicitar(segunda.cookie, 'GET', '/api/sesion')).statusCode, 401);
  assert.equal((await iniciarSesion('staff.alta', direccion)).respuesta.json().id, personalId);

  const previa = await cambiar(admin.cookie, puesto.staff, {
    activo: true, credenciales: { cuenta: 'staff.anterior', contrasena },
  });
  assert.equal(previa.statusCode, 200, previa.body);
  assert.equal((await iniciarSesion('staff.anterior', direccion)).respuesta.json().id, puesto.staff);
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

test('autoriza catálogo y conteo mediante la sesión, aísla dos negocios y conserva la autoría al revocar', async () => {
  const tamales = await negocio('Tamales de prueba A06');
  const bebidas = await negocio('Bebidas de prueba A06');
  await Promise.all([
    asignarCuenta(tamales.admin, 'admin.tamales.a06'),
    asignarCuenta(tamales.staff, 'staff.tamales.a06'),
    asignarCuenta(bebidas.admin, 'admin.bebidas.a06'),
    asignarCuenta(bebidas.staff, 'staff.bebidas.a06'),
  ]);
  const direccion = '192.0.2.30';
  const adminTamales = await iniciarSesion('admin.tamales.a06', direccion);
  const staffTamales = await iniciarSesion('staff.tamales.a06', direccion);
  const adminBebidas = await iniciarSesion('admin.bebidas.a06', direccion);
  const staffBebidas = await iniciarSesion('staff.bebidas.a06', direccion);
  const jornadaTamales = await abrirJornada(tamales.id);
  const jornadaBebidas = await abrirJornada(bebidas.id);
  const ruta = '/api/inventario';
  const solicitar = (cookie: string, method: 'GET' | 'POST' | 'PUT', path: string, payload?: object) =>
    app.inject({ method, url: ruta + path, headers: { cookie }, payload });

  const identificadorAjeno = '?negocioId=' + tamales.id + '&usuarioId=' + tamales.admin;
  assert.equal((await solicitar('', 'GET', '/elementos' + identificadorAjeno)).statusCode, 401);
  assert.equal((await solicitar('', 'POST', '/aperturas', { usuarioId: tamales.admin })).statusCode, 401);
  assert.equal((await solicitar(staffTamales.cookie, 'GET', '/jornadas')).json()[0].id, jornadaTamales);
  assert.deepEqual(
    (await solicitar(staffBebidas.cookie, 'GET', '/jornadas' + identificadorAjeno))
      .json().map((j: { id: string }) => j.id),
    [jornadaBebidas],
  );

  const datosUnidad = { nombre: 'Pieza', simbolo: 'pza', decimales: 0 };
  const unidad = await solicitar(adminTamales.cookie, 'POST', '/unidades', { ...datosUnidad, negocioId: bebidas.id });
  assert.equal(unidad.statusCode, 201, unidad.body);
  const unidadId = unidad.json().id;
  const editarUnidad = '/unidades/' + unidadId;
  assert.equal((await solicitar(staffTamales.cookie, 'POST', '/unidades', datosUnidad)).statusCode, 403);
  assert.equal((await solicitar(staffTamales.cookie, 'PUT', editarUnidad, datosUnidad)).statusCode, 403);
  assert.equal((await solicitar(adminBebidas.cookie, 'PUT', editarUnidad, datosUnidad)).statusCode, 404);
  assert.equal((await solicitar(adminTamales.cookie, 'PUT', editarUnidad, datosUnidad)).statusCode, 200);
  assert.deepEqual((await solicitar(staffTamales.cookie, 'GET', '/unidades')).json(), [unidad.json()]);
  assert.deepEqual((await solicitar(staffBebidas.cookie, 'GET', '/unidades')).json(), []);

  const datosElemento = { unidadId, categoria: 'preparado', nombre: 'Tamal', variante: 'Verde' };
  const alta = await solicitar(adminTamales.cookie, 'POST', '/elementos', datosElemento);
  assert.equal(alta.statusCode, 201, alta.body);
  const elementoId = alta.json().id;
  const rutaElemento = '/elementos/' + elementoId;
  assert.equal((await solicitar(staffTamales.cookie, 'POST', '/elementos', datosElemento)).statusCode, 403);
  assert.equal((await solicitar(staffTamales.cookie, 'PUT', rutaElemento, datosElemento)).statusCode, 403);
  assert.equal((await solicitar(adminBebidas.cookie, 'PUT', rutaElemento, datosElemento)).statusCode, 404);
  assert.equal((await solicitar(adminTamales.cookie, 'PUT', rutaElemento, datosElemento)).statusCode, 200);
  assert.deepEqual((await solicitar(staffTamales.cookie, 'GET', '/elementos')).json(), [alta.json()]);
  assert.deepEqual((await solicitar(staffBebidas.cookie, 'GET', '/elementos' + identificadorAjeno)).json(), []);
  assert.equal((await solicitar(staffBebidas.cookie, 'GET', rutaElemento + '/existencia')).statusCode, 404);
  assert.deepEqual((await solicitar(staffTamales.cookie, 'GET', rutaElemento + '/existencia')).json(), { existencia: null });

  const datos = {
    elementoId, unidadId, jornadaId: jornadaTamales, cantidad: '10', claveReintento: randomUUID(),
  };
  assert.equal((await solicitar(staffBebidas.cookie, 'POST', '/aperturas', {
    ...datos, jornadaId: jornadaBebidas, usuarioId: tamales.staff, negocioId: tamales.id,
  })).statusCode, 404);
  assert.equal((await solicitar(staffTamales.cookie, 'POST', '/aperturas', { ...datos, jornadaId: jornadaBebidas }))
    .statusCode, 404);
  const apertura = await solicitar(staffTamales.cookie, 'POST', '/aperturas', { ...datos, autorId: tamales.admin });
  assert.equal(apertura.statusCode, 200, apertura.body);
  assert.equal(apertura.json().autorId, tamales.staff);
  assert.deepEqual((await solicitar(staffTamales.cookie, 'POST', '/aperturas', datos)).json(), apertura.json());

  assert.equal((await app.inject({
    method: 'PATCH', url: '/api/personal/' + tamales.staff, headers: { cookie: adminTamales.cookie },
    payload: { activo: false },
  })).statusCode, 200);
  assert.equal((await solicitar(staffTamales.cookie, 'GET', '/elementos')).statusCode, 401);
  assert.equal((await solicitar(staffTamales.cookie, 'POST', '/aperturas', datos)).statusCode, 401);
  const saldo = await solicitar(adminTamales.cookie, 'GET', rutaElemento + '/existencia');
  assert.equal(saldo.json().existencia.cantidad, '10');
  const { rows } = await pool.query(
    'SELECT o.autor_id, u.activo FROM operaciones_inventario o JOIN usuarios u ON u.id = o.autor_id WHERE o.id = $1',
    [apertura.json().operacionId],
  );
  assert.deepEqual(rows, [{ autor_id: tamales.staff, activo: false }]);
});

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

test('vincula las solicitudes de una pantalla con la cuenta que la cargó', async () => {
  const anterior = await negocio('Negocio de la pantalla');
  const actual = await negocio('Negocio de la cuenta vigente');
  await asignarCuenta(actual.admin, 'admin.cuenta-vigente');
  const sesion = await iniciarSesion('admin.cuenta-vigente', '192.0.2.21');
  const encabezados = { cookie: sesion.cookie, 'x-inventario-cuenta': anterior.admin };
  const unidad = { nombre: 'Pieza', simbolo: 'pza', decimales: 0 };

  for (const [method, url, payload] of [
    ['POST', '/api/inventario/unidades', unidad],
    ['GET', '/api/inventario/unidades', undefined],
    ['DELETE', '/api/sesion', undefined],
  ] as const) {
    const respuesta = await app.inject({ method, url, payload, headers: encabezados });
    assert.equal(respuesta.statusCode, 409);
    assert.equal(respuesta.json().codigo, 'sesion_cambiada');
    assert.equal(respuesta.headers['set-cookie'], undefined);
  }

  assert.deepEqual(await catalogo.listarUnidades(actual.admin), []);
  const headers = { ...encabezados, 'x-inventario-cuenta': actual.admin };
  const alta = await app.inject({ method: 'POST', url: '/api/inventario/unidades', payload: unidad, headers });
  assert.equal(alta.statusCode, 201);
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/sesion', headers })).statusCode, 204);
});

test('pide revisar un conteo si cambió la unidad o la variante mostrada', async () => {
  const puesto = await negocio('Puesto con catálogo actualizado');
  const jornadaId = await abrirJornada(puesto.id);
  const original = { nombre: 'Kilogramo', simbolo: 'kg', decimales: 3 };
  const nueva = { nombre: 'Gramo', simbolo: 'g', decimales: 0 };
  const unidad = await catalogo.crearUnidad(puesto.admin, original);
  const descripcion = { categoria: 'insumo' as const, nombre: 'Masa', variante: 'Azul' };
  const elemento = await catalogo.crearElemento(puesto.admin, { ...descripcion, unidadId: unidad.id });
  const datos = {
    jornadaId, unidadId: unidad.id, elementoId: elemento.id, cantidad: '2', claveReintento: randomUUID(),
  };

  await catalogo.modificarUnidad(puesto.admin, unidad.id, nueva);
  await assert.rejects(inventario.registrarApertura(puesto.staff, {
    ...datos, definicion: { ...descripcion, unidad: original },
  }), { codigo: 'catalogo_cambiado' });
  assert.equal(await inventario.consultarExistencia(puesto.staff, elemento.id), null);

  await catalogo.modificarElemento(puesto.admin, elemento.id, { ...descripcion, variante: 'Blanca', unidadId: unidad.id });
  await assert.rejects(inventario.registrarApertura(puesto.staff, {
    ...datos, definicion: { ...descripcion, unidad: nueva },
  }), { codigo: 'catalogo_cambiado' });
  assert.equal(await inventario.consultarExistencia(puesto.staff, elemento.id), null);

  const confirmado = await inventario.registrarApertura(puesto.staff, {
    ...datos, definicion: { ...descripcion, variante: 'Blanca', unidad: nueva },
  });
  assert.equal(confirmado.cantidad, '2');
  assert.equal((await inventario.consultarExistencia(puesto.staff, elemento.id))?.cantidad, '2');
  await catalogo.modificarElemento(puesto.admin, elemento.id, { ...descripcion, variante: 'Amarilla', unidadId: unidad.id });
  assert.deepEqual(await inventario.registrarApertura(puesto.staff, {
    ...datos, definicion: { ...descripcion, variante: 'Blanca', unidad: nueva },
  }), confirmado);
});
