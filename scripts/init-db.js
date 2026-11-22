const fs = require('node:fs/promises');
const path = require('node:path');
const { crearPoolPostgres } = require('../src/shared/postgres-pool');
const { cargarEntorno } = require('../src/shared/environment');
const {
  validarDestinoPostgres,
  validarRolEsquema,
} = require('./postgres-destination');
const { sanitizarMensajeAdministrativo } = require('./admin-messages');

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

const RUTA_ESQUEMA = path.join(
  __dirname, '..', 'src/modules/aforo/infrastructure/persistence/schema.sql'
);

/** Ejecuta schema.sql (idempotente: CREATE ... IF NOT EXISTS). */
async function aplicarEsquema(queryable) {
  const sql = await fs.readFile(RUTA_ESQUEMA, 'utf8');
  await queryable.query(sql);
}

async function main(env = process.env) {
  const pool = crearPoolInicializacion(env);
  try {
    await validarRolEsquema(pool);
    await aplicarEsquema(pool);
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

module.exports = { validarConfiguracionInit, crearPoolInicializacion, aplicarEsquema };