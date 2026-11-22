const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const { crearOpcionesPoolPostgres } = require('../src/shared/postgres-pool');
const { cargarEntorno } = require('../src/shared/environment');
const {
  validarDestinoPostgres,
  validarRolEsquema,
} = require('./postgres-destination');
const { sanitizarMensajeAdministrativo } = require('./admin-messages');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');
const ADVISORY_LOCK_NAMESPACE = 0x47594d;
const ADVISORY_LOCK_ID = 1;
const MIGRATION_FILE_RE = /^\d{8}_\d{3}_[a-z0-9_]+\.sql$/;

function validarConfiguracion(env = process.env) {
  if (env.DB_MIGRATIONS_ENABLED !== 'true') {
    throw new Error('Defina DB_MIGRATIONS_ENABLED=true para autorizar migraciones');
  }
  return validarDestinoPostgres(env);
}

function crearPoolMigraciones(env = process.env, PoolImpl = Pool) {
  validarConfiguracion(env);
  return new PoolImpl(crearOpcionesPoolPostgres(env.DB_MIGRATIONS_URL));
}

const SQL_CREAR_TABLA_MIGRACIONES = `
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

// Orden por código de carácter (igual que el sort() por defecto) para que la
// fecha AAAAMMDD_NNN del nombre defina el orden de aplicación.
function compararPorCodigo(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

async function prepararTablaMigraciones(client) {
  await client.query(SQL_CREAR_TABLA_MIGRACIONES);
  await client.query('REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM PUBLIC');
}

async function revertir(client, error) {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    if (error instanceof Error) error.rollbackError = rollbackError;
  }
}

/**
 * Aplica un archivo de migración en su propia transacción. Si la versión ya
 * está registrada en schema_migrations solo confirma la transacción vacía.
 */
async function aplicarMigracion(client, migrationsDir, archivo) {
  const version = archivo.slice(0, -4);
  const sql = await fs.readFile(path.join(migrationsDir, archivo), 'utf8');
  await client.query('BEGIN');
  try {
    await prepararTablaMigraciones(client);
    const yaAplicada = await client.query(
      'SELECT 1 FROM public.schema_migrations WHERE version = $1',
      [version]
    );
    if (yaAplicada.rowCount === 0) {
      await client.query(sql);
      await client.query(
        'INSERT INTO public.schema_migrations (version) VALUES ($1)',
        [version]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await revertir(client, error);
    throw error;
  }
}

/**
 * Las migraciones deben ejecutarse en orden y de una en una: cada una puede
 * depender de la anterior y todas comparten la misma conexión con el
 * advisory lock. Por eso se encadenan de forma recursiva en vez de lanzarse
 * en paralelo con Promise.all.
 */
async function aplicarEnOrden(client, migrationsDir, archivos, indice = 0) {
  if (indice >= archivos.length) return;
  await aplicarMigracion(client, migrationsDir, archivos[indice]);
  await aplicarEnOrden(client, migrationsDir, archivos, indice + 1);
}

async function liberarBloqueo(client, lockAcquired) {
  try {
    if (lockAcquired) {
      await client.query(
        'SELECT pg_advisory_unlock($1, $2)',
        [ADVISORY_LOCK_NAMESPACE, ADVISORY_LOCK_ID]
      );
    }
  } finally {
    client.release();
  }
}

async function aplicarMigraciones(pool, migrationsDir = MIGRATIONS_DIR) {
  await validarRolEsquema(pool);
  const client = await pool.connect();
  let lockAcquired = false;
  try {
    await client.query(
      'SELECT pg_advisory_lock($1, $2)',
      [ADVISORY_LOCK_NAMESPACE, ADVISORY_LOCK_ID]
    );
    lockAcquired = true;

    const archivos = (await fs.readdir(migrationsDir))
      .filter((archivo) => MIGRATION_FILE_RE.test(archivo))
      .sort(compararPorCodigo);

    await aplicarEnOrden(client, migrationsDir, archivos);
    return archivos.length;
  } finally {
    await liberarBloqueo(client, lockAcquired);
  }
}

async function main() {
  const pool = crearPoolMigraciones();
  try {
    const total = await aplicarMigraciones(pool);
    console.info(`Migraciones verificadas (${total} archivo(s) disponible(s)).`);
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

module.exports = { validarConfiguracion, crearPoolMigraciones, aplicarMigraciones };
