function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`Falta la variable de entorno ${name}. Revisar el archivo .env.`);
  }
  return value;
}

function port(name: string): number {
  const value = required(name);
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(`${name} debe ser un puerto entero entre 1 y 65535.`);
  }
  return Number(value);
}

export const config = {
  host: required('API_HOST'),
  port: port('API_PORT'),
  database: {
    host: required('POSTGRES_HOST'),
    port: port('POSTGRES_PORT'),
    database: required('POSTGRES_DB'),
    user: required('POSTGRES_USER'),
    password: required('POSTGRES_PASSWORD'),
  },
};
