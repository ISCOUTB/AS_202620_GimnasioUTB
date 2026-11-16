const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');
const ADVISORY_LOCK_NAME = 'gimnasio-utb-schema-migrations';
const MIGRATION_FILE_RE = /^\d{8}_\d{3}_[a-z0-9_]+\.sql$/;

function validarConfiguracion(env = process.env) {
  if (!env.DATABASE_URL) {
    throw new Error('Defina DATABASE_URL para ejecutar migraciones');
  }
  if (env.DB_MIGRATIONS_ENABLED !== 'true') {
    throw new Error('Defina DB_MIGRATIONS_ENABLED=true para autorizar migraciones');
  }
  if (!env.DB_MIGRATIONS_HOST || !env.DB_MIGRATIONS_TARGET) {
    throw new Error('Defina DB_MIGRATIONS_HOST y DB_MIGRATIONS_TARGET para confirmar la base destino');
  }

  const databaseUrl = new URL(env.DATABASE_URL);
  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (
    !databaseName
    || databaseName !== env.DB_MIGRATIONS_TARGET
    || databaseUrl.hostname !== env.DB_MIGRATIONS_HOST
  ) {
    throw new Error('DB_MIGRATIONS_HOST/TARGET no coinciden con DATABASE_URL');
  }
  return { databaseName, databaseHost: databaseUrl.hostname };
}

async function aplicarMigraciones(pool, migrationsDir = MIGRATIONS_DIR) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [ADVISORY_LOCK_NAME]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const archivos = (await fs.readdir(migrationsDir))
      .filter((archivo) => MIGRATION_FILE_RE.test(archivo))
      .sort();

    for (const archivo of archivos) {
      const version = archivo.slice(0, -4);
      const yaAplicada = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [version]
      );
      if (yaAplicada.rowCount > 0) continue;

      const sql = await fs.readFile(path.join(migrationsDir, archivo), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version]
        );
        await client.query('COMMIT');
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          if (error instanceof Error) error.rollbackError = rollbackError;
        }
        throw error;
      }
    }

    return archivos.length;
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [ADVISORY_LOCK_NAME]);
    } finally {
      client.release();
    }
  }
}

async function main() {
  validarConfiguracion();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const total = await aplicarMigraciones(pool);
    console.info(`Migraciones verificadas (${total} archivo(s) disponible(s)).`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { validarConfiguracion, aplicarMigraciones };
