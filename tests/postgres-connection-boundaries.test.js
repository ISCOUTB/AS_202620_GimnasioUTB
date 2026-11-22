const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { AforoPostgresAdapter } = require('../src/modules/aforo/infrastructure/persistence/aforo-postgres.adapter');
const { crearPoolInicializacion } = require('../scripts/init-db');
const { crearPoolMigraciones } = require('../scripts/migrate-db');
const { seedDemoStudent } = require('../scripts/seed-demo-student');
const { linkStudentAuth } = require('../scripts/link-student-auth');
const { reconcileStudentIdentities } = require('../scripts/reconcile-student-identities');
const { sanitizarMensajeAdministrativo } = require('../scripts/demo-environment');

const RUNTIME_URL = 'postgresql://runtime:runtime-test@localhost:5432/gym_test';
const MIGRATIONS_URL = 'postgresql://migrator:migrator-test@localhost:5432/gym_test';
const PROVISIONING_URL = 'postgresql://provisioner:provisioner-test@localhost:5432/gym_test';
const AUTH_ID = 'e52fef92-e63f-4f66-8865-7de0647c4c08';
const DEMO_EMAIL = 'demo-001@utb.edu.co';

function entornoDemo(overrides = {}) {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: RUNTIME_URL,
    DB_MIGRATIONS_URL: MIGRATIONS_URL,
    DB_PROVISIONING_URL: PROVISIONING_URL,
    DB_RECONCILIATION_URL: 'postgresql://auditor:auditor-test@localhost:5432/gym_test',
    DB_PROVISIONING_ENABLED: 'true',
    DB_RECONCILIATION_ENABLED: 'true',
    DEMO_DATABASE_HOST: 'localhost',
    DEMO_DATABASE_NAME: 'gym_test',
    DEMO_SUPABASE_PROJECT_REF: 'demo-project-ref',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-secret',
    DEMO_STUDENT_ID: 'demo-001',
    DEMO_STUDENT_EMAIL: DEMO_EMAIL,
    DEMO_STUDENT_NAME: 'Estudiante de prueba',
    DEMO_STUDENT_CEDULA: '1000000001',
    DEMO_STUDENT_PASSWORD: 'synthetic-password-for-test',
    ...overrides,
  };
}

function autenticarPoolCapturable(onQuery) {
  return class CapturingPool {
    constructor(options) {
      this.connectionString = options.connectionString;
    }

    async query(sql, params) {
      return onQuery(sql.replace(/\s+/g, ' ').trim().toLowerCase(), params);
    }

    async connect() {
      return {
        query: async (sql, params) =>
          onQuery(sql.replace(/\s+/g, ' ').trim().toLowerCase(), params),
        release() {},
      };
    }

    async end() {}
  };
}

test('la API crea el pool únicamente con DATABASE_URL', async () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    DB_MIGRATIONS_URL: process.env.DB_MIGRATIONS_URL,
    DB_PROVISIONING_URL: process.env.DB_PROVISIONING_URL,
  };
  process.env.DATABASE_URL = RUNTIME_URL;
  process.env.DB_MIGRATIONS_URL = MIGRATIONS_URL;
  process.env.DB_PROVISIONING_URL = PROVISIONING_URL;
  const adapter = new AforoPostgresAdapter();
  try {
    assert.equal(adapter.pool.options.connectionString, RUNTIME_URL);
  } finally {
    await adapter.cerrar();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('db:init y db:migrate construyen sus pools con DB_MIGRATIONS_URL', () => {
  const env = {
    DB_INIT_ENABLED: 'true',
    DB_MIGRATIONS_ENABLED: 'true',
    DB_MIGRATIONS_URL: MIGRATIONS_URL,
    DATABASE_URL: RUNTIME_URL,
    DB_MIGRATIONS_HOST: 'localhost',
    DB_MIGRATIONS_TARGET: 'gym_test',
    SUPABASE_URL: '',
  };
  let initUrl;
  const initPool = crearPoolInicializacion(env, (url) => {
    initUrl = url;
    return { close: true };
  });
  let migrationOptions;
  const migrationPool = crearPoolMigraciones(env, class CapturingPool {
    constructor(options) {
      migrationOptions = options;
      this.connectionString = options.connectionString;
    }
  });

  assert.deepEqual(initPool, { close: true });
  assert.equal(initUrl, MIGRATIONS_URL);
  assert.equal(migrationOptions.connectionString, MIGRATIONS_URL);
  assert.notEqual(initUrl, RUNTIME_URL);
  assert.notEqual(migrationPool.connectionString, RUNTIME_URL);
});

test('Compose separa API y migraciones y no define PostgreSQL local', () => {
  const compose = yaml.load(fs.readFileSync(
    path.join(__dirname, '..', 'deploy', 'compose.lab.yaml'),
    'utf8'
  ));
  const migration = compose.services['db-migrate'];
  const migrationEnvironment = migration.environment;
  const apiService = compose.services.api;
  const api = apiService.environment;

  assert.deepEqual(Object.keys(compose.services).sort(), ['api', 'db-migrate']);
  assert.equal(migration.command.join(' '), 'npm run db:migrate');
  assert.deepEqual(migration.profiles, ['maintenance']);
  assert.equal(migrationEnvironment.DB_MIGRATIONS_ENABLED, 'true');
  assert.match(migrationEnvironment.DB_MIGRATIONS_URL, /\$\{DB_MIGRATIONS_URL/);
  assert.match(migrationEnvironment.DB_MIGRATIONS_HOST, /\$\{DB_MIGRATIONS_HOST/);
  assert.match(migrationEnvironment.DB_MIGRATIONS_TARGET, /\$\{DB_MIGRATIONS_TARGET/);
  assert.match(migrationEnvironment.DB_MIGRATIONS_PROJECT_REF, /\$\{DB_MIGRATIONS_PROJECT_REF/);
  assert.equal('depends_on' in migration, false);
  assert.equal('volumes' in migration, false);
  assert.equal('SUPABASE_SERVICE_ROLE_KEY' in migrationEnvironment, false);
  assert.equal(migrationEnvironment.DATABASE_SSL, 'true');
  assert.equal('DATABASE_SSL_CA_CERT_PATH' in migrationEnvironment, false);

  assert.match(api.DATABASE_URL, /\$\{DATABASE_URL/);
  assert.equal(api.DATABASE_SSL, 'true');
  assert.equal('volumes' in apiService, false);
  assert.equal('DATABASE_SSL_CA_CERT_PATH' in api, false);
  assert.equal('DB_MIGRATIONS_URL' in api, false);
  assert.equal('DB_PROVISIONING_URL' in api, false);
  assert.equal('DB_RECONCILIATION_URL' in api, false);
  assert.equal('SUPABASE_SERVICE_ROLE_KEY' in api, false);
  assert.equal('POSTGRES_PASSWORD' in api, false);
  assert.equal('depends_on' in apiService, false);

  for (const name of [
    'NODE_ENV',
    'PORT',
    'OPERADOR_TOKEN',
    'CORS_ORIGINS',
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
    'DATABASE_URL',
    'DATABASE_SSL',
    'DATABASE_SSL_CA_CERT_BASE64',
  ]) {
    assert.equal(name in api, true, `API debe recibir ${name}`);
  }
  // La CA de Supabase es obligatoria para la API: sin ella el pooler falla con
  // SELF_SIGNED_CERT_IN_CHAIN (ADR-0010).
  assert.match(api.DATABASE_SSL_CA_CERT_BASE64, /\$\{DATABASE_SSL_CA_CERT_BASE64:\?/);

  const envExample = fs.readFileSync(
    path.join(__dirname, '..', 'deploy', '.env.example'),
    'utf8'
  );
  assert.match(envExample, /^SUPABASE_SERVICE_ROLE_KEY=$/m);
  assert.doesNotMatch(envExample, /DATABASE_SSL_CA_CERT_FILE/);
});

test('el seed usa DB_PROVISIONING_URL y jamás conecta con DATABASE_URL', async () => {
  let connectedUrl;
  const PoolImpl = autenticarPoolCapturable((sql) => {
    if (sql.startsWith('select auth_user_id, codigo_estudiante')) return { rows: [] };
    if (sql.startsWith('select codigo_estudiante from estudiantes')) return { rows: [] };
    if (sql.startsWith('insert into estudiantes')) return { rowCount: 1, rows: [] };
    throw new Error('consulta inesperada');
  });
  class CapturingPool extends PoolImpl {
    constructor(options) {
      super(options);
      connectedUrl = this.connectionString;
    }
  }
  class AuthAdmin {
    async listarUsuarios() {
      return [{ id: AUTH_ID, email: DEMO_EMAIL }];
    }
  }

  const originalInfo = console.info;
  console.info = () => {};
  try {
    await seedDemoStudent({
      env: entornoDemo(),
      PoolImpl: CapturingPool,
      AuthAdminAdapter: AuthAdmin,
    });
  } finally {
    console.info = originalInfo;
  }
  assert.equal(connectedUrl, PROVISIONING_URL);
  assert.notEqual(connectedUrl, RUNTIME_URL);
});

test('la vinculación usa DB_PROVISIONING_URL', async () => {
  let connectedUrl;
  const PoolImpl = autenticarPoolCapturable((sql) => {
    if (sql === 'begin' || sql === 'commit' || sql === 'rollback') return { rows: [] };
    if (sql.startsWith('select auth_user_id, codigo_estudiante')) {
      return {
        rows: [{
          auth_user_id: null,
          codigo_estudiante: 'demo-001',
          correo: DEMO_EMAIL,
          nombre: 'Estudiante',
          cedula_sintetica: '1000000001',
          activa: true,
        }],
      };
    }
    if (sql.startsWith('select codigo_estudiante from estudiantes')) return { rows: [] };
    if (sql.startsWith('update estudiantes')) return { rowCount: 1, rows: [] };
    throw new Error('consulta inesperada');
  });
  class CapturingPool extends PoolImpl {
    constructor(options) {
      super(options);
      connectedUrl = this.connectionString;
    }
  }
  class AuthAdmin {
    async listarUsuarios() {
      return [{ id: AUTH_ID, email: DEMO_EMAIL }];
    }
  }

  const originalInfo = console.info;
  console.info = () => {};
  try {
    await linkStudentAuth({
      env: entornoDemo(),
      args: ['--student-code', 'demo-001', '--email', DEMO_EMAIL],
      PoolImpl: CapturingPool,
      AuthAdminAdapter: AuthAdmin,
    });
  } finally {
    console.info = originalInfo;
  }
  assert.equal(connectedUrl, PROVISIONING_URL);
  assert.notEqual(connectedUrl, RUNTIME_URL);
});

test('la reconciliación usa DB_RECONCILIATION_URL con permisos de solo lectura', async () => {
  let connectedUrl;
  const PoolImpl = autenticarPoolCapturable((sql) => {
    assert.match(sql, /^select codigo_estudiante, auth_user_id, correo, activa/);
    return { rows: [] };
  });
  class CapturingPool extends PoolImpl {
    constructor(options) {
      super(options);
      connectedUrl = this.connectionString;
    }
  }
  class AuthAdmin {
    async listarUsuarios() {
      return [];
    }
  }

  const originalInfo = console.info;
  console.info = () => {};
  try {
    await reconcileStudentIdentities({
      env: entornoDemo(),
      PoolImpl: CapturingPool,
      AuthAdminAdapter: AuthAdmin,
    });
  } finally {
    console.info = originalInfo;
  }
  assert.equal(connectedUrl, entornoDemo().DB_RECONCILIATION_URL);
  assert.notEqual(connectedUrl, PROVISIONING_URL);
  assert.notEqual(connectedUrl, RUNTIME_URL);
});

test('la reconciliación falla cerrada sin habilitación o URL auditor', async () => {
  let created = false;
  class CapturingPool {
    constructor() {
      created = true;
    }
  }
  class AuthAdmin {}

  await assert.rejects(
    reconcileStudentIdentities({
      env: entornoDemo({ DB_RECONCILIATION_ENABLED: 'false' }),
      PoolImpl: CapturingPool,
      AuthAdminAdapter: AuthAdmin,
    }),
    /DB_RECONCILIATION_ENABLED=true/
  );
  await assert.rejects(
    reconcileStudentIdentities({
      env: entornoDemo({ DB_RECONCILIATION_URL: '' }),
      PoolImpl: CapturingPool,
      AuthAdminAdapter: AuthAdmin,
    }),
    /DB_RECONCILIATION_URL/
  );
  assert.equal(created, false);
});

test('errores administrativos redactan URLs y secretos configurados', () => {
  const env = {
    DB_PROVISIONING_URL: PROVISIONING_URL,
    SUPABASE_SERVICE_ROLE_KEY: 'admin-key-test-only',
    DEMO_STUDENT_PASSWORD: 'student-password-test-only',
  };
  const message = sanitizarMensajeAdministrativo(
    new Error(`${PROVISIONING_URL} admin-key-test-only student-password-test-only`),
    env
  );
  assert.equal(message.includes(PROVISIONING_URL), false);
  assert.equal(message.includes('provisioner-test'), false);
  assert.equal(message.includes('admin-key-test-only'), false);
  assert.equal(message.includes('student-password-test-only'), false);
});
