const fs = require('node:fs/promises');
const path = require('node:path');
const { crearPoolPostgres } = require('../src/shared/postgres-pool');
const { cargarEntorno } = require('../src/shared/environment');
const {
  validarDestinoPostgres,
  validarRolEsquema,
} = require('./postgres-destination');
const { sanitizarMensajeAdministrativo } = require('./demo-environment');

function validarConfiguracionInit(env = process.env) {
  if (env.DB_INIT_ENABLED !== 'true') {
    throw new Error('Defina DB_INIT_ENABLED=true para autorizar la inicialización del esquema');
  }
  return validarDestinoPostgres(env);
}

function crearPoolInicializacion(env = process.env, poolFactory = crearPoolPostgres) {
  validarConfiguracionInit(env);
  return poolFactory(env.DB_MIGRATIONS_URL);
}

async function main(env = process.env) {
  const sql = await fs.readFile(
    path.join(__dirname, '..', 'src/modules/aforo/infrastructure/persistence/schema.sql'),
    'utf8'
  );
  const pool = crearPoolInicializacion(env);
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
    return main();
  }).catch((error) => {
    console.error(sanitizarMensajeAdministrativo(error));
    process.exitCode = 1;
  });
}

module.exports = { validarConfiguracionInit, crearPoolInicializacion };