import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { crearCatalogo } from '../src/inventario/catalogo.js';

const url = process.env.INVENTARIO_TEST_DATABASE_URL;
if (!url) throw new Error('Configura INVENTARIO_TEST_DATABASE_URL con una base de pruebas.');

const esquema = 'a05_' + randomUUID().replaceAll('-', '');
const base = new pg.Pool({ connectionString: url });
const conexion = new URL(url);
conexion.searchParams.set('options', '-csearch_path=' + esquema);
const pool = new pg.Pool({ connectionString: conexion.toString() });
const catalogo = crearCatalogo(pool);
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
