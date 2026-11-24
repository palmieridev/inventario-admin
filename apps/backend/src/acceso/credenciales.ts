import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { invalidos, texto } from '../inventario/validacion.js';

const parametros = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const salDeComparacion = randomBytes(16);

function derivar(contrasena: string, sal: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(contrasena, sal, 64, parametros, (error, clave) => {
      if (error) reject(error);
      else resolve(clave);
    });
  });
}

export function nombreCuenta(valor: unknown): string {
  const cuenta = texto(valor, 'La cuenta', 64).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(cuenta)) {
    invalidos('La cuenta debe tener entre 3 y 64 caracteres: letras sin acentos, números, punto, guion o guion bajo.');
  }
  return cuenta;
}

export function contrasenaValida(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0 && Buffer.byteLength(valor) <= 256;
}

export async function prepararClave(valor: unknown): Promise<string> {
  if (!contrasenaValida(valor) || [...valor].length < 12 || !valor.trim()) {
    invalidos('La contraseña debe tener al menos 12 caracteres válidos y ocupar hasta 256 bytes.');
  }

  const sal = randomBytes(16);
  const clave = await derivar(valor, sal);
  return sal.toString('hex') + ':' + clave.toString('hex');
}

export async function coincideClave(contrasena: string, almacenada?: string): Promise<boolean> {
  const [sal, esperada] = almacenada?.split(':') ?? [];
  const clave = await derivar(contrasena, sal ? Buffer.from(sal, 'hex') : salDeComparacion);
  if (!esperada) return false;

  const bytes = Buffer.from(esperada, 'hex');
  return clave.length === bytes.length && timingSafeEqual(clave, bytes);
}
