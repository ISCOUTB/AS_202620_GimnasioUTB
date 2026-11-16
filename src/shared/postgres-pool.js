const { Pool } = require('pg');

const LOCAL_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  'postgres',
]);
const SSL_URL_PARAMETERS = [
  'sslmode',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'sslpassword',
  'sslnegotiation',
];

function crearOpcionesPoolPostgres(connectionString, options = {}, env = process.env) {
  let connectionUrl;
  try {
    connectionUrl = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL debe ser una URI PostgreSQL válida');
  }

  if (!['postgres:', 'postgresql:'].includes(connectionUrl.protocol)) {
    throw new Error('DATABASE_URL debe usar el protocolo PostgreSQL');
  }

  const sslSetting = env.DATABASE_SSL;
  if (sslSetting !== undefined && !['true', 'false'].includes(sslSetting)) {
    throw new Error('DATABASE_SSL debe ser true o false');
  }
  if (sslSetting === 'false' && !LOCAL_DATABASE_HOSTS.has(connectionUrl.hostname)) {
    throw new Error('TLS no se puede desactivar para conexiones PostgreSQL remotas');
  }

  for (const parameter of SSL_URL_PARAMETERS) {
    connectionUrl.searchParams.delete(parameter);
  }

  return {
    ...options,
    connectionString: connectionUrl.toString(),
    ssl: sslSetting === 'false' ? false : { rejectUnauthorized: true },
  };
}

function crearPoolPostgres(connectionString, options = {}) {
  return new Pool(crearOpcionesPoolPostgres(connectionString, options));
}

module.exports = { crearOpcionesPoolPostgres, crearPoolPostgres };
