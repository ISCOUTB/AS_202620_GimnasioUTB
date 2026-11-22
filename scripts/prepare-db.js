const { crearPoolPostgres } = require('../src/shared/postgres-pool');
const { cargarEntorno } = require('../src/shared/environment');
const { validarRolEsquema } = require('./postgres-destination');
const { validarConfiguracionInit, aplicarEsquema } = require('./init-db');
const { validarConfiguracion: validarConfiguracionMigraciones, aplicarMigraciones } = require('./migrate-db');
const { sanitizarMensajeAdministrativo } = require('./admin-messages');

/**
 * Deja el esquema al día en cualquier base: nueva, la de S8 (solo aforo) o una
 * con la tabla `estudiantes` de una versión anterior.
 *
 * - Si `estudiantes` ya existe, primero se aplican las migraciones (agregan o
 *   quitan columnas) y después schema.sql, que crea los índices sobre esas
 *   columnas. Al revés, schema.sql fallaría al indexar columnas que todavía
 *   no existen.
 * - Si no existe, schema.sql crea todo y las migraciones solo quedan
 *   registradas en schema_migrations.
 *
 * Las dos operaciones son idempotentes, así que el Compose lo ejecuta en cada
 * deploy.
 */
async function prepararBase({ pool, esquema = aplicarEsquema, migraciones = aplicarMigraciones }) {
  await validarRolEsquema(pool);
  const { rows } = await pool.query(
    "SELECT to_regclass('public.estudiantes') IS NOT NULL AS existe"
  );
  if (rows[0]?.existe) {
    await migraciones(pool);
    await esquema(pool);
    return 'migraciones-luego-esquema';
  }
  await esquema(pool);
  await migraciones(pool);
  return 'esquema-luego-migraciones';
}

async function main(env = process.env, poolFactory = crearPoolPostgres) {
  validarConfiguracionInit(env);
  validarConfiguracionMigraciones(env);
  const pool = poolFactory(env.DB_MIGRATIONS_URL);
  try {
    return await prepararBase({ pool });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  Promise.resolve().then(() => {
    cargarEntorno();
    return main();
  }).then((orden) => {
    console.info(`Esquema listo (${orden}).`);
  }).catch((error) => {
    console.error(sanitizarMensajeAdministrativo(error));
    process.exitCode = 1;
  });
}

module.exports = { prepararBase, main };
