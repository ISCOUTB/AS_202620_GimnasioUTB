const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const tls = require('node:tls');
const {
  validarConfiguracion,
  aplicarMigraciones,
} = require('../scripts/migrate-db');
const { validarConfiguracionInit } = require('../scripts/init-db');
const { validarRolEsquema } = require('../scripts/postgres-destination');
const { crearOpcionesPoolPostgres } = require('../src/shared/postgres-pool');

const PROJECT_REF = 'abcdefghijklmnopqrst';

function env(overrides = {}) {
  return {
    DB_MIGRATIONS_URL: `postgresql://gimnasio_migrator@db.${PROJECT_REF}.supabase.co:5432/gym_test`,
    DATABASE_URL: `postgresql://gimnasio_runtime@db.${PROJECT_REF}.supabase.co:5432/gym_test`,
    SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
    DB_MIGRATIONS_ENABLED: 'true',
    DB_MIGRATIONS_HOST: `db.${PROJECT_REF}.supabase.co`,
    DB_MIGRATIONS_TARGET: 'gym_test',
    DB_MIGRATIONS_PROJECT_REF: PROJECT_REF,
    ...overrides,
  };
}

test('el runner requiere habilitación explícita y destino Supabase confirmado', () => {
  assert.throws(
    () => validarConfiguracion(env({ DB_MIGRATIONS_ENABLED: 'false' })),
    /DB_MIGRATIONS_ENABLED=true/
  );
  assert.throws(
    () => validarConfiguracion(env({ DB_MIGRATIONS_TARGET: 'production' })),
    /host\/base/
  );
  assert.throws(
    () => validarConfiguracion(env({ DB_MIGRATIONS_HOST: 'other.example.test' })),
    /host\/base/
  );
  assert.throws(
    () => validarConfiguracion(env({ DB_MIGRATIONS_PROJECT_REF: 'another-project-ref' })),
    /proyecto Supabase/
  );
  assert.deepEqual(validarConfiguracion(env()), {
    databaseName: 'gym_test',
    databaseHost: `db.${PROJECT_REF}.supabase.co`,
    projectRef: PROJECT_REF,
  });
});

test('el runner acepta pooler solo si el usuario identifica el proyecto confirmado', () => {
  const poolerEnv = env({
    DB_MIGRATIONS_URL:
      `postgresql://gimnasio_migrator.${PROJECT_REF}@aws-0-us-east-1.pooler.supabase.com:5432/gym_test`,
    DATABASE_URL:
      `postgresql://gimnasio_runtime.${PROJECT_REF}@aws-0-us-east-1.pooler.supabase.com:5432/gym_test`,
    DB_MIGRATIONS_HOST: 'aws-0-us-east-1.pooler.supabase.com',
  });
  assert.equal(validarConfiguracion(poolerEnv).projectRef, PROJECT_REF);
  assert.throws(
    () => validarConfiguracion({
      ...poolerEnv,
      DB_MIGRATIONS_URL:
        'postgresql://gimnasio_migrator.otherproject@aws-0-us-east-1.pooler.supabase.com:5432/gym_test',
    }),
    /proyecto Supabase confirmado/
  );
  assert.throws(
    () => validarConfiguracion({
      ...poolerEnv,
      DATABASE_URL:
        `postgresql://postgres.${PROJECT_REF}@aws-0-us-east-1.pooler.supabase.com:5432/gym_test`,
    }),
    { code: 'DATABASE_URL_ROLE_MISMATCH' }
  );
  assert.throws(
    () => validarConfiguracion({
      ...poolerEnv,
      DB_MIGRATIONS_URL:
        `postgresql://gimnasio_migrator.${PROJECT_REF}@aws-0-us-east-1.pooler.supabase.com:6543/gym_test`,
    }),
    { code: 'DB_MIGRATIONS_URL_PORT_INVALID' }
  );
});

test('el runner exige credenciales runtime y de esquema separadas para Supabase', () => {
  assert.throws(
    () => validarConfiguracion(env({
      DATABASE_URL: `postgresql://gimnasio_migrator@db.${PROJECT_REF}.supabase.co:5432/gym_test`,
    })),
    /gimnasio_runtime/
  );
  assert.throws(
    () => validarConfiguracion(env({ DATABASE_URL: undefined })),
    /rol runtime separado/
  );
});

test('el runner permite bases locales solo con confirmación de host y nombre', () => {
  const localEnv = env({
    DB_MIGRATIONS_URL: 'postgresql://migrator@localhost:5432/gym_test',
    DATABASE_URL: 'postgresql://runtime@localhost:5432/gym_test',
    DB_MIGRATIONS_HOST: 'localhost',
    SUPABASE_URL: '',
    DB_MIGRATIONS_PROJECT_REF: '',
  });
  assert.equal(validarConfiguracion(localEnv).projectRef, null);
  assert.throws(
    () => validarConfiguracion({
      ...localEnv,
      DATABASE_URL: 'postgresql://migrator@localhost:5432/gym_test',
    }),
    /roles distintos/
  );
});

test('la inicialización base tiene una autorización separada y valida el destino', () => {
  const localEnv = env({
    DB_MIGRATIONS_URL: 'postgresql://migrator@localhost:5432/gym_test',
    DATABASE_URL: 'postgresql://runtime@localhost:5432/gym_test',
    DB_MIGRATIONS_HOST: 'localhost',
    SUPABASE_URL: '',
    DB_MIGRATIONS_PROJECT_REF: '',
    DB_INIT_ENABLED: 'true',
  });
  assert.equal(validarConfiguracionInit(localEnv).databaseName, 'gym_test');
  assert.throws(
    () => validarConfiguracionInit({ ...localEnv, DB_INIT_ENABLED: 'false' }),
    /DB_INIT_ENABLED=true/
  );
});

test('las conexiones PostgreSQL remotas exigen TLS con validación de certificados', () => {
  const options = crearOpcionesPoolPostgres(
    `postgresql://user@db.${PROJECT_REF}.supabase.co:5432/postgres?sslmode=no-verify`,
    {},
    { DATABASE_SSL: 'true' }
  );
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(new URL(options.connectionString).searchParams.has('sslmode'), false);
  assert.throws(
    () => crearOpcionesPoolPostgres(
      `postgresql://user@db.${PROJECT_REF}.supabase.co:5432/postgres`,
      {},
      { DATABASE_SSL: 'false' }
    ),
    /TLS no se puede desactivar/
  );
});

test('TLS solo puede desactivarse explícitamente para PostgreSQL local', () => {
  const options = crearOpcionesPoolPostgres(
    'postgresql://user@postgres:5432/gym_test',
    {},
    { DATABASE_SSL: 'false' }
  );
  assert.equal(options.ssl, false);
  assert.throws(
    () => crearOpcionesPoolPostgres(
      'postgresql://user@localhost:5432/gym_test',
      {},
      { DATABASE_SSL: 'maybe' }
    ),
    /DATABASE_SSL debe ser true o false/
  );
});

test('el CA Supabase opcional se carga sin desactivar la validación TLS', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gimnasio-postgres-ca-'));
  const caPath = path.join(directory, 'ca.crt');
  const ca = tls.rootCertificates[0];
  await fs.writeFile(caPath, ca, 'utf8');

  try {
    const options = crearOpcionesPoolPostgres(
      `postgresql://user@db.${PROJECT_REF}.supabase.co:5432/postgres`,
      {},
      { DATABASE_SSL: 'true', DATABASE_SSL_CA_CERT_PATH: caPath }
    );
    assert.equal(options.ssl.rejectUnauthorized, true);
    assert.equal(options.ssl.ca, ca);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('el CA Supabase también se acepta como PEM en base64 (deployment)', () => {
  const ca = tls.rootCertificates[0];
  const options = crearOpcionesPoolPostgres(
    `postgresql://user@db.${PROJECT_REF}.supabase.co:5432/postgres`,
    {},
    { DATABASE_SSL: 'true', DATABASE_SSL_CA_CERT_BASE64: Buffer.from(ca).toString('base64') }
  );
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.ssl.ca, ca);
});

test('el CA en base64 rechaza contenido que no es un certificado o configuración ambigua', () => {
  const url = `postgresql://user@db.${PROJECT_REF}.supabase.co:5432/postgres`;
  assert.throws(
    () => crearOpcionesPoolPostgres(url, {}, {
      DATABASE_SSL_CA_CERT_BASE64: Buffer.from('no es un certificado').toString('base64'),
    }),
    /no es válido/
  );
  assert.throws(
    () => crearOpcionesPoolPostgres(url, {}, {
      DATABASE_SSL_CA_CERT_PATH: '/tmp/ca.crt',
      DATABASE_SSL_CA_CERT_BASE64: 'abc',
    }),
    /solo DATABASE_SSL_CA_CERT_PATH o DATABASE_SSL_CA_CERT_BASE64/
  );
});

function crearPoolFalso({ errorEnMigracion = false, yaAplicada = false } = {}) {
  const llamadas = [];
  const client = {
    async query(sql) {
      const normalizada = sql.replace(/\s+/g, ' ').trim();
      llamadas.push(normalizada);
      if (normalizada.startsWith('SELECT 1 FROM public.schema_migrations')) {
        return { rowCount: yaAplicada ? 1 : 0, rows: yaAplicada ? [{ '?column?': 1 }] : [] };
      }
      if (errorEnMigracion && normalizada.includes('FAIL_MIGRATION')) {
        throw new Error('fallo controlado de prueba');
      }
      return { rowCount: 0, rows: [] };
    },
    release() {
      llamadas.push('RELEASE');
    },
  };
  return {
    llamadas,
    pool: {
      async query() {
        return {
          rows: [{
            rolsuper: false,
            rolcreatedb: false,
            rolcreaterole: false,
            rolreplication: false,
            rolbypassrls: false,
          }],
        };
      },
      async connect() {
        return client;
      },
    },
  };
}

async function conDirectorioMigraciones(sql, run) {
  const migrationsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gimnasio-migrations-'));
  try {
    await fs.writeFile(
      path.join(migrationsDir, '20261116_001_test_migration.sql'),
      sql,
      'utf8'
    );
    await run(migrationsDir);
  } finally {
    await fs.rm(migrationsDir, { recursive: true, force: true });
  }
}

test('la tabla de versiones y la migración se confirman dentro de la misma transacción', async () => {
  await conDirectorioMigraciones('SELECT 1; -- migration body', async (migrationsDir) => {
    const { pool, llamadas } = crearPoolFalso();
    assert.equal(await aplicarMigraciones(pool, migrationsDir), 1);
    const begin = llamadas.indexOf('BEGIN');
    const createTable = llamadas.findIndex((sql) =>
      sql.includes('CREATE TABLE IF NOT EXISTS public.schema_migrations')
    );
    const migration = llamadas.findIndex((sql) => sql.includes('-- migration body'));
    const insertVersion = llamadas.findIndex((sql) =>
      sql.startsWith('INSERT INTO public.schema_migrations')
    );
    const commit = llamadas.indexOf('COMMIT');
    assert.ok(begin < createTable);
    assert.ok(createTable < migration);
    assert.ok(migration < insertVersion);
    assert.ok(insertVersion < commit);
    assert.ok(llamadas.includes('RELEASE'));
  });
});

test('si una migración falla, se revierte y se libera el advisory lock', async () => {
  await conDirectorioMigraciones('SELECT 1; -- FAIL_MIGRATION', async (migrationsDir) => {
    const { pool, llamadas } = crearPoolFalso({ errorEnMigracion: true });
    await assert.rejects(
      aplicarMigraciones(pool, migrationsDir),
      /fallo controlado de prueba/
    );
    assert.ok(llamadas.includes('ROLLBACK'));
    assert.ok(llamadas.some((sql) => sql.includes('pg_advisory_unlock')));
    assert.ok(llamadas.includes('RELEASE'));
    assert.ok(!llamadas.includes('COMMIT'));
  });
});

test('se rechaza un rol de esquema con privilegios administrativos o BYPASSRLS', async () => {
  await assert.rejects(
    validarRolEsquema({
      async query() {
        return {
          rows: [{
            rolsuper: false,
            rolcreatedb: true,
            rolcreaterole: false,
            rolreplication: false,
            rolbypassrls: false,
          }],
        };
      },
    }),
    /privilegios administrativos y BYPASSRLS/
  );
});
