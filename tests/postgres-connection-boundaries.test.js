const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { AforoPostgresAdapter } = require('../src/modules/aforo/infrastructure/persistence/aforo-postgres.adapter');
const { crearPoolInicializacion } = require('../scripts/init-db');
const { crearPoolMigraciones } = require('../scripts/migrate-db');
const { sanitizarMensajeAdministrativo } = require('../scripts/admin-messages');

const RUNTIME_URL = 'postgresql://gimnasio_runtime:runtime-test-clave@localhost:5432/gym_test';
const MIGRATIONS_URL = 'postgresql://gimnasio_migrator:migrator-test-clave@localhost:5432/gym_test';
const ROOT = path.join(__dirname, '..');

function leerCompose() {
  return yaml.load(fs.readFileSync(path.join(ROOT, 'deploy', 'compose.lab.yaml'), 'utf8'));
}

test('la API crea el pool únicamente con DATABASE_URL', async () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    DB_MIGRATIONS_URL: process.env.DB_MIGRATIONS_URL,
  };
  process.env.DATABASE_URL = RUNTIME_URL;
  process.env.DB_MIGRATIONS_URL = MIGRATIONS_URL;
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
  };
  let initUrl;
  crearPoolInicializacion(env, (url) => {
    initUrl = url;
    return {};
  });
  let migrationOptions;
  crearPoolMigraciones(env, class CapturingPool {
    constructor(options) {
      migrationOptions = options;
    }
  });
  assert.equal(initUrl, MIGRATIONS_URL);
  assert.equal(migrationOptions.connectionString, MIGRATIONS_URL);
});

test('Compose levanta PostgreSQL propio y encadena bootstrap, init y API', () => {
  const compose = leerCompose();
  const { postgres, api } = compose.services;
  const bootstrap = compose.services['db-bootstrap'];
  const init = compose.services['db-init'];

  assert.deepEqual(Object.keys(compose.services).sort(), ['api', 'db-bootstrap', 'db-init', 'postgres']);
  // Volumen nombrado y declarado: los datos sobreviven a cada redeploy. Se
  // espera el de S8 (postgres_data); otro nombre solo si se recrea la base.
  assert.equal(postgres.volumes.length, 1);
  const [volumen, ruta] = postgres.volumes[0].split(':');
  assert.equal(ruta, '/var/lib/postgresql/data');
  assert.match(volumen, /^postgres_data(_[a-z0-9]+)?$/);
  assert.ok(volumen in compose.volumes);

  assert.equal(bootstrap.depends_on.postgres.condition, 'service_healthy');
  assert.equal(init.depends_on['db-bootstrap'].condition, 'service_completed_successfully');
  assert.equal(api.depends_on['db-init'].condition, 'service_completed_successfully');

  assert.equal(bootstrap.command.join(' '), 'npm run db:bootstrap');
  assert.equal(
    init.command.at(-1),
    'npm run db:prepare && npm run db:grant-runtime && npm run db:seed-demo-students && npm run db:check-security'
  );
});

test('solo db-bootstrap recibe el superusuario y la API solo el rol runtime', () => {
  const compose = leerCompose();
  const api = compose.services.api.environment;
  const bootstrap = compose.services['db-bootstrap'].environment;
  const init = compose.services['db-init'].environment;

  assert.match(bootstrap.DB_ADMIN_URL, /\$\{POSTGRES_USER.*\$\{POSTGRES_PASSWORD/);
  assert.equal('DB_ADMIN_URL' in init, false);
  assert.equal('DB_ADMIN_URL' in api, false);

  assert.match(init.DB_MIGRATIONS_URL, /^postgresql:\/\/gimnasio_migrator:\$\{DB_MIGRATOR_PASSWORD/);
  assert.match(api.DATABASE_URL, /^postgresql:\/\/gimnasio_runtime:\$\{DB_RUNTIME_PASSWORD/);
  assert.equal(api.DATABASE_SSL, 'false');

  for (const prohibida of ['DB_MIGRATIONS_URL', 'DB_ADMIN_URL', 'POSTGRES_PASSWORD', 'DEMO_STUDENTS']) {
    assert.equal(prohibida in api, false, `la API no debe recibir ${prohibida}`);
  }
  assert.equal(init.DEMO_STUDENTS, '${DEMO_STUDENTS:-}');
});

test('el deployment ya no depende de Supabase', () => {
  const compose = fs.readFileSync(path.join(ROOT, 'deploy', 'compose.lab.yaml'), 'utf8');
  const envExample = fs.readFileSync(path.join(ROOT, 'deploy', '.env.example'), 'utf8');
  assert.doesNotMatch(compose, /SUPABASE/i);
  assert.doesNotMatch(envExample, /SUPABASE/i);
  for (const variable of ['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'DB_MIGRATOR_PASSWORD', 'DB_RUNTIME_PASSWORD', 'OPERADOR_TOKEN', 'DEMO_STUDENTS']) {
    assert.match(envExample, new RegExp(`^${variable}=`, 'm'));
  }
});

test('errores administrativos redactan contraseñas de URLs y de estudiantes de prueba', () => {
  const env = {
    DB_ADMIN_URL: 'postgresql://admin:clave-admin-123@postgres:5432/gym',
    DB_MIGRATIONS_URL: MIGRATIONS_URL,
    DEMO_STUDENTS: 'T001|a@utb.edu.co|Ana|clave-de-ana-1234',
  };
  const mensaje = sanitizarMensajeAdministrativo(
    new Error('falló clave-admin-123, migrator-test-clave y clave-de-ana-1234'),
    env
  );
  assert.equal(mensaje, 'falló [redactado], [redactado] y [redactado]');
});
