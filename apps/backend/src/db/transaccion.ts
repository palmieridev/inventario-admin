import type { Pool, PoolClient } from 'pg';

export async function enTransaccion<T>(pool: Pool, operacion: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  let descartar = false;
  try {
    await cliente.query('BEGIN');
    const resultado = await operacion(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    try {
      await cliente.query('ROLLBACK');
    } catch {
      descartar = true;
    }
    throw error;
  } finally {
    cliente.release(descartar);
  }
}
