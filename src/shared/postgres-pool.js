const fs = require('node:fs');
const tls = require('node:tls');
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

function crearErrorConfiguracion(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Obtiene el texto PEM de la CA PostgreSQL. Admite una ruta a archivo
 * (desarrollo local) o el PEM codificado en base64 en una variable
 * (deployments donde montar un archivo es incómodo, como Dokploy). Si se
 * definen ambas, se rechaza la configuración para evitar ambigüedad.
 */
function leerPemCaPostgres(env) {
  const ruta = env.DATABASE_SSL_CA_CERT_PATH;
  const base64 = env.DATABASE_SSL_CA_CERT_BASE64?.trim();
  if (ruta && base64) {
    throw crearErrorConfiguracion(
      'DATABASE_SSL_CA_CERT_AMBIGUOUS',
      'Defina solo DATABASE_SSL_CA_CERT_PATH o DATABASE_SSL_CA_CERT_BASE64, no ambas'
    );
  }
  if (ruta) {
    try {
      return fs.readFileSync(ruta, 'utf8');
    } catch {
      throw crearErrorConfiguracion(
        'DATABASE_SSL_CA_CERT_READ_FAILURE',
        'No fue posible leer el certificado CA PostgreSQL configurado'
      );
    }
  }
  if (base64) {
    const pem = Buffer.from(base64, 'base64').toString('utf8');
    if (!pem.includes('-----BEGIN CERTIFICATE-----')) {
      throw crearErrorConfiguracion(
        'DATABASE_SSL_CA_CERT_INVALID',
        'El certificado CA PostgreSQL configurado no es válido'
      );
    }
    return pem;
  }
  return undefined;
}

function cargarCertificadoCaPostgres(env) {
  const ca = leerPemCaPostgres(env);
  if (!ca) return undefined;

  try {
    tls.createSecureContext({ ca });
  } catch {
    throw crearErrorConfiguracion(
      'DATABASE_SSL_CA_CERT_INVALID',
      'El certificado CA PostgreSQL configurado no es válido'
    );
  }

  return ca;
}

function crearOpcionesPoolPostgres(connectionString, options = {}, env = process.env) {
  let connectionUrl;
  try {
    connectionUrl = new URL(connectionString);
  } catch {
    throw crearErrorConfiguracion(
      'POSTGRES_URL_INVALID',
      'DATABASE_URL debe ser una URI PostgreSQL válida'
    );
  }

  if (!['postgres:', 'postgresql:'].includes(connectionUrl.protocol)) {
    throw crearErrorConfiguracion(
      'POSTGRES_URL_PROTOCOL_INVALID',
      'DATABASE_URL debe usar el protocolo PostgreSQL'
    );
  }

  const sslSetting = env.DATABASE_SSL;
  if (sslSetting !== undefined && !['true', 'false'].includes(sslSetting)) {
    throw crearErrorConfiguracion('DATABASE_SSL_INVALID', 'DATABASE_SSL debe ser true o false');
  }
  if (sslSetting === 'false' && !LOCAL_DATABASE_HOSTS.has(connectionUrl.hostname)) {
    throw crearErrorConfiguracion(
      'TLS_DISABLED_FOR_REMOTE_DATABASE',
      'TLS no se puede desactivar para conexiones PostgreSQL remotas'
    );
  }

  for (const parameter of SSL_URL_PARAMETERS) {
    connectionUrl.searchParams.delete(parameter);
  }

  const ca = sslSetting === 'false' ? undefined : cargarCertificadoCaPostgres(env);
  return {
    ...options,
    connectionString: connectionUrl.toString(),
    ssl: sslSetting === 'false'
      ? false
      : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
  };
}

function crearPoolPostgres(connectionString, options = {}) {
  return new Pool(crearOpcionesPoolPostgres(connectionString, options));
}

module.exports = { crearOpcionesPoolPostgres, crearPoolPostgres };
