const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  validarConfiguracionGrants,
  aplicarGrants,
  RUTA_SQL,
} = require('../scripts/grant-runtime-db');

const PROJECT_REF = 'abcdefghijklmnopqrst';
const POOLER = 'aws-0-us-east-1.pooler.supabase.com';

function env(overrides = {}) {
  return {
    DB_GRANTS_ENABLED: 'true',
    DB_MIGRATIONS_URL: `postgresql://gimnasio_migrator.${PROJECT_REF}:x@${POOLER}:5432/postgres`,
    DATABASE_URL: `postgresql://gimnasio_runtime.${PROJECT_REF}:y@${POOLER}:5432/postgres`,
    SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
    DB_MIGRATIONS_HOST: POOLER,
    DB_MIGRATIONS_TARGET: 'postgres',
    DB_MIGRATIONS_PROJECT_REF: PROJECT_REF,
    ...overrides,
  };
}

test('db:grant-runtime exige habilitación explícita', () => {
  assert.throws(
    () => validarConfiguracionGrants(env({ DB_GRANTS_ENABLED: undefined })),
    /DB_GRANTS_ENABLED=true/
  );
});

test('db:grant-runtime reutiliza la confirmación de destino de db:init', () => {
  assert.doesNotThrow(() => validarConfiguracionGrants(env()));
  assert.throws(
    () => validarConfiguracionGrants(env({ DB_MIGRATIONS_PROJECT_REF: 'otroproyectootroproy' })),
    /DB_MIGRATIONS_PROJECT_REF/
  );
  assert.throws(
    () => validarConfiguracionGrants(env({
      DATABASE_URL: `postgresql://gimnasio_migrator.${PROJECT_REF}:x@${POOLER}:5432/postgres`,
    })),
    /gimnasio_runtime/
  );
});

test('db:grant-runtime valida el rol dueño antes de aplicar el SQL y cierra el pool', async () => {
  const llamadas = [];
  const pool = {
    async query(sql) {
      llamadas.push(sql.includes('pg_roles') ? 'ROL' : sql);
      if (sql.includes('pg_roles')) {
        return {
          rows: [{
            rolsuper: false,
            rolcreatedb: false,
            rolcreaterole: false,
            rolreplication: false,
            rolbypassrls: false,
          }],
        };
      }
      return { rows: [] };
    },
    async end() {
      llamadas.push('END');
    },
  };
  await aplicarGrants({
    env: env(),
    poolFactory: () => pool,
    leerSql: async () => 'SQL_DE_PRUEBA',
  });
  assert.deepEqual(llamadas, ['ROL', 'SQL_DE_PRUEBA', 'END']);
});

test('db:grant-runtime se detiene si el rol tiene privilegios administrativos', async () => {
  let cerrado = false;
  const pool = {
    async query() {
      return { rows: [{ rolsuper: true }] };
    },
    async end() {
      cerrado = true;
    },
  };
  await assert.rejects(
    aplicarGrants({ env: env(), poolFactory: () => pool, leerSql: async () => 'X' }),
    /privilegios administrativos/
  );
  assert.equal(cerrado, true);
});

test('el SQL de permisos no concede DELETE, TRUNCATE ni BYPASSRLS y es idempotente', () => {
  const sql = fs.readFileSync(RUTA_SQL, 'utf8');
  const sinComentarios = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(sinComentarios, /\bDELETE\b|\bTRUNCATE\b|BYPASSRLS|GRANT ALL/i);
  assert.match(sinComentarios, /NOT EXISTS[\s\S]*pg_policies/);
  for (const tabla of ['aforo_estado', 'estudiantes', 'qr_credenciales', 'estudiante_estado_acceso']) {
    assert.match(sinComentarios, new RegExp(`ON TABLE public\\.${tabla} TO gimnasio_runtime`));
  }
  assert.doesNotMatch(sinComentarios, /sesiones_estudiantes/);
});

test('runtime puede bloquear estudiantes (FOR UPDATE) pero no modificarlos', () => {
  // Sin una política UPDATE, SELECT ... FOR UPDATE devuelve cero filas con RLS
  // y la emisión del QR falla como "sesión no válida".
  const sql = fs.readFileSync(RUTA_SQL, 'utf8');
  assert.match(
    sql,
    /'estudiantes', 'gimnasio_runtime_estudiantes_lock',\s*'FOR UPDATE TO gimnasio_runtime USING \(true\) WITH CHECK \(false\)'/
  );
});
