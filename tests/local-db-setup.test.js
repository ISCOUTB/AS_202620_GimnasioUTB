const test = require('node:test');
const assert = require('node:assert/strict');
const { validarConfiguracionBootstrap, asegurarRol, configurarPrivilegios } = require('../scripts/bootstrap-local-db');
const { parsearEstudiantes, validarConfiguracionSeed, cargarEstudiantes } = require('../scripts/seed-demo-students');
const { prepararBase } = require('../scripts/prepare-db');

const CLAVE_M = 'a'.repeat(48);
const CLAVE_R = 'b'.repeat(48);

function envCompose(overrides = {}) {
  return {
    DB_BOOTSTRAP_ENABLED: 'true',
    DB_SEED_ENABLED: 'true',
    DB_ADMIN_URL: 'postgresql://gimnasio_admin:clave-admin-segura@postgres:5432/gimnasio_utb',
    DB_MIGRATIONS_URL: `postgresql://gimnasio_migrator:${CLAVE_M}@postgres:5432/gimnasio_utb`,
    DATABASE_URL: `postgresql://gimnasio_runtime:${CLAVE_R}@postgres:5432/gimnasio_utb`,
    DB_MIGRATIONS_HOST: 'postgres',
    DB_MIGRATIONS_TARGET: 'gimnasio_utb',
    ...overrides,
  };
}

function poolQueRegistra(respuestas = {}) {
  const consultas = [];
  return {
    consultas,
    async query(sql, params) {
      consultas.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      const clave = Object.keys(respuestas).find((inicio) => sql.includes(inicio));
      return clave ? respuestas[clave] : { rows: [] };
    },
  };
}

test('bootstrap: exige habilitación y obtiene las contraseñas de las URLs', () => {
  assert.throws(() => validarConfiguracionBootstrap(envCompose({ DB_BOOTSTRAP_ENABLED: 'false' })), /DB_BOOTSTRAP_ENABLED/);
  assert.deepEqual(validarConfiguracionBootstrap(envCompose()), {
    baseDatos: 'gimnasio_utb',
    contrasenaEsquema: CLAVE_M,
    contrasenaRuntime: CLAVE_R,
  });
});

test('bootstrap: el superusuario solo puede ser el del PostgreSQL local del Compose', () => {
  assert.throws(
    () => validarConfiguracionBootstrap(envCompose({ DB_ADMIN_URL: 'postgresql://admin:x@db.example.com:5432/gimnasio_utb' })),
    /solo puede apuntar al PostgreSQL local/
  );
  assert.throws(
    () => validarConfiguracionBootstrap(envCompose({ DB_ADMIN_URL: 'postgresql://admin:x@postgres:5432/otra_base' })),
    /mismo host y base/
  );
  assert.throws(
    () => validarConfiguracionBootstrap(envCompose({ DB_ADMIN_URL: `postgresql://gimnasio_migrator:${CLAVE_M}@postgres:5432/gimnasio_utb` })),
    /superusuario/
  );
});

test('bootstrap: rechaza contraseñas cortas o con caracteres que rompen la URL', () => {
  assert.throws(
    () => validarConfiguracionBootstrap(envCompose({ DATABASE_URL: 'postgresql://gimnasio_runtime:corta@postgres:5432/gimnasio_utb' })),
    /contraseña de DATABASE_URL/
  );
});

test('bootstrap: crea el rol si no existe y lo actualiza si ya existe, siempre sin privilegios', async () => {
  const nuevo = poolQueRegistra();
  assert.equal(await asegurarRol(nuevo, 'gimnasio_runtime', CLAVE_R), 'creado');
  const existente = poolQueRegistra({ 'FROM pg_catalog.pg_roles': { rows: [{}] } });
  assert.equal(await asegurarRol(existente, 'gimnasio_runtime', CLAVE_R), 'actualizado');
  const ddl = existente.consultas.at(-1).sql;
  assert.match(ddl, /^ALTER ROLE "gimnasio_runtime" WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '/);
});

test('bootstrap: transfiere al migrador las tablas de un volumen anterior', async () => {
  const pool = poolQueRegistra({ 'FROM pg_catalog.pg_tables': { rows: [{ tablename: 'aforo_estado' }] } });
  const transferidas = await configurarPrivilegios(pool, 'gimnasio_utb');
  assert.deepEqual(transferidas, ['aforo_estado']);
  const sqls = pool.consultas.map((c) => c.sql);
  assert.ok(sqls.includes('REVOKE ALL ON DATABASE "gimnasio_utb" FROM PUBLIC'));
  assert.ok(sqls.includes('GRANT USAGE ON SCHEMA public TO "gimnasio_runtime"'));
  assert.ok(sqls.includes('ALTER TABLE public."aforo_estado" OWNER TO "gimnasio_migrator"'));
  assert.equal(sqls.some((sql) => /GRANT .*CREATE.*"gimnasio_runtime"/.test(sql)), false);
});

test('seed: interpreta DEMO_STUDENTS y valida cada campo sin repetir la contraseña', () => {
  assert.deepEqual(parsearEstudiantes(''), []);
  assert.deepEqual(
    parsearEstudiantes(' T00000001|Ana@UTB.edu.co|Ana Pérez|clave-de-ana-123 ; T00000002|beto@utb.edu.co|Beto|clave-de-beto-12'),
    [
      { codigo: 'T00000001', correo: 'ana@utb.edu.co', nombre: 'Ana Pérez', contrasena: 'clave-de-ana-123' },
      { codigo: 'T00000002', correo: 'beto@utb.edu.co', nombre: 'Beto', contrasena: 'clave-de-beto-12' },
    ]
  );
  assert.throws(() => parsearEstudiantes('T001|ana@gmail.com|Ana|clave-larga-123'), /@utb\.edu\.co/);
  assert.throws(() => parsearEstudiantes('T001|ana@utb.edu.co|Ana|corta'), (error) => {
    assert.doesNotMatch(error.message, /corta/);
    return /al menos 12/.test(error.message);
  });
  assert.throws(() => parsearEstudiantes('T001|ana@utb.edu.co|Ana'), /4 campos/);
  assert.throws(
    () => parsearEstudiantes('T001|a@utb.edu.co|A|clave-larga-123;T001|b@utb.edu.co|B|clave-larga-456'),
    /repite el codigo/
  );
});

test('seed: exige habilitación y destino confirmado', () => {
  assert.throws(() => validarConfiguracionSeed(envCompose({ DB_SEED_ENABLED: undefined })), /DB_SEED_ENABLED/);
  assert.throws(() => validarConfiguracionSeed(envCompose({ DB_MIGRATIONS_TARGET: 'otra' })), /confirmación/);
});

test('seed: crea o actualiza todos los estudiantes en una sola sentencia con hash', async () => {
  const pool = poolQueRegistra({ 'INSERT INTO estudiantes': { rows: [{ creado: true }, { creado: false }] } });
  const resultado = await cargarEstudiantes(pool, parsearEstudiantes(
    'T1a|a@utb.edu.co|Ana|clave-de-ana-123;T2b|b@utb.edu.co|Beto|clave-de-beto-12'
  ));
  assert.deepEqual(resultado, { creados: 1, actualizados: 1 });
  assert.equal(pool.consultas.length, 1);
  const { sql, params } = pool.consultas[0];
  assert.match(sql, /ON CONFLICT \(codigo_estudiante\) DO UPDATE/);
  assert.equal(params.length, 8);
  assert.match(params[3], /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(params.includes('clave-de-ana-123'), false);
});

test('prepare: base nueva aplica esquema y luego migraciones; base anterior, al revés', async () => {
  const rolOk = { rows: [{ rolsuper: false }] };
  const orden = [];
  const esquema = async () => orden.push('esquema');
  const migraciones = async () => orden.push('migraciones');

  const nueva = poolQueRegistra({ pg_roles: rolOk, to_regclass: { rows: [{ existe: false }] } });
  assert.equal(await prepararBase({ pool: nueva, esquema, migraciones }), 'esquema-luego-migraciones');
  assert.deepEqual(orden, ['esquema', 'migraciones']);

  orden.length = 0;
  const anterior = poolQueRegistra({ pg_roles: rolOk, to_regclass: { rows: [{ existe: true }] } });
  assert.equal(await prepararBase({ pool: anterior, esquema, migraciones }), 'migraciones-luego-esquema');
  assert.deepEqual(orden, ['migraciones', 'esquema']);
});
