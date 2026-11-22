const fs = require('node:fs/promises');
const path = require('node:path');
const { crearPoolPostgres } = require('../src/shared/postgres-pool');
const { cargarEntorno } = require('../src/shared/environment');
const {
  validarDestinoPostgres,
  validarRolEsquema,
} = require('./postgres-destination');
const { sanitizarMensajeAdministrativo } = require('./admin-messages');

const RUTA_SQL = path.join(__dirname, 'sql', 'runtime-grants.sql');

/**
 * Aplica, con el rol dueño de las tablas (gimnasio_migrator), los permisos
 * por columna y las políticas RLS de los roles runtime y provisioning.
 * Usa las mismas confirmaciones de destino que db:init y exige su propia
 * habilitación explícita para no ejecutarse por accidente.
 */
function validarConfiguracionGrants(env = process.env) {
  if (env.DB_GRANTS_ENABLED !== 'true') {
    throw new Error('Defina DB_GRANTS_ENABLED=true para autorizar la aplicación de permisos y políticas');
  }
  return validarDestinoPostgres(env);
}

async function aplicarGrants({ env = process.env, poolFactory = crearPoolPostgres, leerSql = fs.readFile } = {}) {
  validarConfiguracionGrants(env);
  const sql = await leerSql(RUTA_SQL, 'utf8');
  const pool = poolFactory(env.DB_MIGRATIONS_URL);
  try {
    await validarRolEsquema(pool);
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  Promise.resolve().then(() => {
    cargarEntorno();
    return aplicarGrants();
  }).then(() => {
    console.info('Permisos y políticas RLS aplicados (idempotente).');
  }).catch((error) => {
    console.error(sanitizarMensajeAdministrativo(error));
    process.exitCode = 1;
  });
}

module.exports = { validarConfiguracionGrants, aplicarGrants, RUTA_SQL };
