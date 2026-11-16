const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SECURITY_QUERY,
  consultarEstadoSeguridad,
  categorizarError,
} = require('../scripts/check-db-security');

const TABLES = [
  ['public', 'aforo_estado', true, false, true],
  ['public', 'estudiantes', true, false, true],
  ['public', 'sesiones_estudiantes', false, false, false],
  ['public', 'qr_credenciales', true, true, true],
  ['public', 'estudiante_estado_acceso', true, true, true],
  ['public', 'schema_migrations', false, false, false],
  ['auth', 'users', false, false, false],
];
const COLUMN_PRIVILEGES = {
  'public.aforo_estado': {
    select_columns: ['aforo_actual', 'id'],
    insert_columns: [],
    update_columns: ['aforo_actual'],
  },
  'public.estudiantes': {
    select_columns: ['activa', 'auth_user_id', 'codigo_estudiante', 'correo', 'id', 'nombre'],
    insert_columns: [],
    update_columns: ['created_at'],
  },
  'public.sesiones_estudiantes': {
    select_columns: [],
    insert_columns: [],
    update_columns: [],
  },
  'public.qr_credenciales': {
    select_columns: ['codigo_estudiante', 'consumido_en', 'expires_at', 'token_hash'],
    insert_columns: ['codigo_estudiante', 'expires_at', 'token_hash'],
    update_columns: ['consumido_en'],
  },
  'public.estudiante_estado_acceso': {
    select_columns: ['codigo_estudiante', 'dentro'],
    insert_columns: ['codigo_estudiante', 'dentro'],
    update_columns: ['dentro'],
  },
  'public.schema_migrations': {
    select_columns: [],
    insert_columns: [],
    update_columns: [],
  },
  'auth.users': {
    select_columns: [],
    insert_columns: [],
    update_columns: [],
  },
};

function filasEstadoSeguridad(overrides = {}) {
  return TABLES.map(([schema_name, table_name, select, insert, update]) => ({
    database_name: 'gym_test',
    effective_role: 'gimnasio_runtime',
    session_role: 'gimnasio_runtime',
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
    rolinherit: false,
    has_role_memberships: false,
    tls_active: true,
    tls_version: 'TLSv1.3',
    cipher: 'TLS_AES_256_GCM_SHA384',
    database_create: false,
    schema_name,
    table_name,
    table_exists: table_name !== 'schema_migrations',
    schema_usage: schema_name === 'public',
    schema_create: false,
    rls_enabled: schema_name === 'auth' || table_name !== 'schema_migrations',
    rls_forced: false,
    can_select: select,
    can_insert: insert,
    can_update: update,
    table_select: false,
    table_insert: false,
    table_update: false,
    can_delete: false,
    can_truncate: false,
    can_references: false,
    can_trigger: false,
    can_maintain: false,
    ...COLUMN_PRIVILEGES[`${schema_name}.${table_name}`],
    ...overrides,
  }));
}

test('security probe solo ejecuta su consulta de lectura y evalúa privilegios', async () => {
  let executedQuery = '';
  const report = await consultarEstadoSeguridad({
    async query(query) {
      executedQuery = query;
      return { rows: filasEstadoSeguridad() };
    },
  });

  assert.match(executedQuery.trim(), /^WITH/);
  assert.match(executedQuery, /pg_catalog\.pg_stat_ssl/);
  assert.match(executedQuery, /has_table_privilege/);
  assert.match(executedQuery, /has_any_column_privilege/);
  assert.match(executedQuery, /has_column_privilege/);
  assert.equal(report.tls.active, true);
  assert.equal(report.role.effective, 'gimnasio_runtime');
  assert.ok(Object.values(report.checks).every(Boolean));
});

test('security probe falla ante TLS apagado, rol privilegiado o ACL excesiva', async () => {
  const rows = filasEstadoSeguridad();
  rows[0].rolbypassrls = true;
  rows[0].has_role_memberships = true;
  rows[0].tls_active = false;
  rows[0].database_create = true;
  rows[0].schema_create = true;
  rows[6].schema_usage = true;
  rows[3].can_delete = true;
  rows[3].table_select = true;

  const report = await consultarEstadoSeguridad({
    async query() {
      return { rows };
    },
  });

  assert.equal(report.checks.tlsActive, false);
  assert.equal(report.checks.runtimeRoleRestricted, false);
  assert.equal(report.checks.databaseCreateDisabled, false);
  assert.equal(report.checks.publicSchemaCreateDisabled, false);
  assert.equal(report.checks.authSchemaAccessDisabled, false);
  assert.equal(report.checks.effectivePrivilegesMatch, false);
});

test('security probe rechaza columnas adicionales aunque el grant no sea a nivel de tabla', async () => {
  const rows = filasEstadoSeguridad();
  rows[1].update_columns.push('nombre');

  const report = await consultarEstadoSeguridad({
    async query() {
      return { rows };
    },
  });

  assert.equal(report.tables.find((table) => table.table === 'public.estudiantes').permissionsMatch, false);
  assert.equal(report.checks.effectivePrivilegesMatch, false);
});

test('errores de conectividad se clasifican sin imprimir mensajes ni destinos', () => {
  assert.equal(categorizarError({ code: 'ENOTFOUND', message: 'host de prueba' }), 'DNS_FAILURE');
  assert.equal(
    categorizarError({ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', message: 'detalle' }),
    'TLS_CERTIFICATE_FAILURE'
  );
  assert.equal(categorizarError({ code: '28P01', message: 'detalle' }), 'DATABASE_AUTH_FAILURE');
});

test('la consulta de comprobación verifica atributos, RLS y privilegios peligrosos', () => {
  assert.match(SECURITY_QUERY, /rolbypassrls/);
  assert.match(SECURITY_QUERY, /pg_auth_members/);
  assert.match(SECURITY_QUERY, /relrowsecurity/);
  assert.match(SECURITY_QUERY, /update_columns/);
  assert.match(SECURITY_QUERY, /TRUNCATE/);
  assert.match(SECURITY_QUERY, /MAINTAIN/);
  assert.match(SECURITY_QUERY, /table_update/);
});
