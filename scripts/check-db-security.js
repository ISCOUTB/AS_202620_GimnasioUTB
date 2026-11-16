const { Pool } = require('pg');
const { cargarEntorno } = require('../src/shared/environment');
const { crearOpcionesPoolPostgres } = require('../src/shared/postgres-pool');

const SECURITY_QUERY = `
  WITH expected(schema_name, table_name, allow_select, allow_insert, allow_update) AS (
    VALUES
      ('public', 'aforo_estado', TRUE, FALSE, TRUE),
      ('public', 'estudiantes', TRUE, FALSE, TRUE),
      ('public', 'sesiones_estudiantes', FALSE, FALSE, FALSE),
      ('public', 'qr_credenciales', TRUE, TRUE, TRUE),
      ('public', 'estudiante_estado_acceso', TRUE, TRUE, TRUE),
      ('public', 'schema_migrations', FALSE, FALSE, FALSE),
      ('auth', 'users', FALSE, FALSE, FALSE)
  ),
  role_state AS (
    SELECT
      current_database() AS database_name,
      current_user AS effective_role,
      session_user AS session_role,
      r.rolsuper,
      r.rolcreatedb,
      r.rolcreaterole,
      r.rolreplication,
      r.rolbypassrls,
      r.rolinherit,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members membership
        WHERE membership.member = r.oid
      ) AS has_role_memberships,
      pg_catalog.has_database_privilege(
        current_user,
        current_database(),
        'CREATE'
      ) AS database_create
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user
  ),
  tls_state AS (
    SELECT ssl, version AS tls_version, cipher
    FROM pg_catalog.pg_stat_ssl
    WHERE pid = pg_backend_pid()
  )
  SELECT
    role_state.*,
    tls_state.ssl AS tls_active,
    tls_state.tls_version,
    tls_state.cipher,
    expected.schema_name,
    expected.table_name,
    (relation.oid IS NOT NULL) AS table_exists,
    COALESCE(pg_catalog.has_schema_privilege(current_user, namespace.oid, 'USAGE'), FALSE)
      AS schema_usage,
    COALESCE(pg_catalog.has_schema_privilege(current_user, namespace.oid, 'CREATE'), FALSE)
      AS schema_create,
    COALESCE(relation.relrowsecurity, FALSE) AS rls_enabled,
    COALESCE(relation.relforcerowsecurity, FALSE) AS rls_forced,
    CASE WHEN relation.oid IS NULL THEN FALSE
      ELSE pg_catalog.has_table_privilege(current_user, relation.oid, 'SELECT')
        OR pg_catalog.has_any_column_privilege(current_user, relation.oid, 'SELECT') END AS can_select,
    CASE WHEN relation.oid IS NULL THEN FALSE
      ELSE pg_catalog.has_table_privilege(current_user, relation.oid, 'INSERT')
        OR pg_catalog.has_any_column_privilege(current_user, relation.oid, 'INSERT') END AS can_insert,
    CASE WHEN relation.oid IS NULL THEN FALSE
      ELSE pg_catalog.has_table_privilege(current_user, relation.oid, 'UPDATE')
        OR pg_catalog.has_any_column_privilege(current_user, relation.oid, 'UPDATE') END AS can_update,
    CASE WHEN relation.oid IS NULL THEN FALSE
      ELSE pg_catalog.has_table_privilege(current_user, relation.oid, 'SELECT') END AS table_select,
    CASE WHEN relation.oid IS NULL THEN FALSE
      ELSE pg_catalog.has_table_privilege(current_user, relation.oid, 'INSERT') END AS table_insert,
    CASE WHEN relation.oid IS NULL THEN FALSE
      ELSE pg_catalog.has_table_privilege(current_user, relation.oid, 'UPDATE') END AS table_update,
    CASE WHEN relation.oid IS NULL THEN ARRAY[]::TEXT[]
      ELSE ARRAY(
        SELECT attribute.attname::TEXT
        FROM pg_catalog.pg_attribute attribute
        WHERE attribute.attrelid = relation.oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND pg_catalog.has_column_privilege(
            current_user,
            relation.oid,
            attribute.attname,
            'SELECT'
          )
        ORDER BY attribute.attname
      )
    END AS select_columns,
    CASE WHEN relation.oid IS NULL THEN ARRAY[]::TEXT[]
      ELSE ARRAY(
        SELECT attribute.attname::TEXT
        FROM pg_catalog.pg_attribute attribute
        WHERE attribute.attrelid = relation.oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND pg_catalog.has_column_privilege(
            current_user,
            relation.oid,
            attribute.attname,
            'INSERT'
          )
        ORDER BY attribute.attname
      )
    END AS insert_columns,
    CASE WHEN relation.oid IS NULL THEN ARRAY[]::TEXT[]
      ELSE ARRAY(
        SELECT attribute.attname::TEXT
        FROM pg_catalog.pg_attribute attribute
        WHERE attribute.attrelid = relation.oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND pg_catalog.has_column_privilege(
            current_user,
            relation.oid,
            attribute.attname,
            'UPDATE'
          )
        ORDER BY attribute.attname
      )
    END AS update_columns,
    CASE WHEN relation.oid IS NULL THEN FALSE
      ELSE pg_catalog.has_table_privilege(current_user, relation.oid, 'DELETE') END AS can_delete,
    CASE WHEN relation.oid IS NULL THEN FALSE
      ELSE pg_catalog.has_table_privilege(current_user, relation.oid, 'TRUNCATE') END AS can_truncate,
    CASE WHEN relation.oid IS NULL THEN FALSE
      ELSE pg_catalog.has_table_privilege(current_user, relation.oid, 'REFERENCES') END AS can_references,
    CASE WHEN relation.oid IS NULL THEN FALSE
      ELSE pg_catalog.has_table_privilege(current_user, relation.oid, 'TRIGGER') END AS can_trigger,
    CASE
      WHEN relation.oid IS NULL
        OR current_setting('server_version_num')::INTEGER < 170000 THEN FALSE
      ELSE pg_catalog.has_table_privilege(current_user, relation.oid, 'MAINTAIN')
    END AS can_maintain
  FROM expected
  CROSS JOIN role_state
  CROSS JOIN tls_state
  LEFT JOIN pg_catalog.pg_namespace namespace
    ON namespace.nspname = expected.schema_name
  LEFT JOIN pg_catalog.pg_class relation
    ON relation.relnamespace = namespace.oid
    AND relation.relname = expected.table_name
    AND relation.relkind IN ('r', 'p')
  ORDER BY expected.schema_name, expected.table_name
`;

const REQUIRED_TABLES = new Set([
  'public.aforo_estado',
  'public.estudiantes',
  'public.sesiones_estudiantes',
  'public.qr_credenciales',
  'public.estudiante_estado_acceso',
]);
const PRIVILEGES = [
  'can_select',
  'can_insert',
  'can_update',
  'can_delete',
  'can_truncate',
  'can_references',
  'can_trigger',
  'can_maintain',
];
const COLUMN_PRIVILEGES = [
  'select_columns',
  'insert_columns',
  'update_columns',
];
const EXPECTED_COLUMN_PRIVILEGES = {
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

function evaluarEstadoSeguridad(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('La comprobación PostgreSQL no devolvió resultados');
  }

  const first = rows[0];
  const roleRestricted = !(
    first.rolsuper
    || first.rolcreatedb
    || first.rolcreaterole
    || first.rolreplication
    || first.rolbypassrls
    || first.rolinherit
    || first.has_role_memberships
  );
  const tables = rows.map((row) => {
    const tableName = `${row.schema_name}.${row.table_name}`;
    const privileges = Object.fromEntries(
      PRIVILEGES.map((privilege) => [privilege, row[privilege]])
    );
    const expected = {
      can_select: row.schema_name === 'public'
        && ['aforo_estado', 'estudiantes', 'qr_credenciales', 'estudiante_estado_acceso']
          .includes(row.table_name),
      can_insert: ['qr_credenciales', 'estudiante_estado_acceso']
        .includes(row.table_name),
      can_update: ['aforo_estado', 'estudiantes', 'qr_credenciales', 'estudiante_estado_acceso']
        .includes(row.table_name),
      can_delete: false,
      can_truncate: false,
      can_references: false,
      can_trigger: false,
      can_maintain: false,
    };
    const expectedColumns = EXPECTED_COLUMN_PRIVILEGES[tableName];
    const columnPrivilegesMatch = COLUMN_PRIVILEGES.every((privilege) => (
      JSON.stringify(row[privilege]) === JSON.stringify(expectedColumns[privilege])
    ));
    const permissionsMatch = PRIVILEGES.every(
      (privilege) => privileges[privilege] === expected[privilege]
    ) && columnPrivilegesMatch
      && !row.table_select
      && !row.table_insert
      && !row.table_update;

    return {
      table: tableName,
      exists: row.table_exists,
      schemaUsage: row.schema_usage,
      schemaCreate: row.schema_create,
      rlsEnabled: row.rls_enabled,
      rlsForced: row.rls_forced,
      privileges,
      columnPrivileges: Object.fromEntries(
        COLUMN_PRIVILEGES.map((privilege) => [privilege, row[privilege]])
      ),
      permissionsMatch,
    };
  });
  const appTablesPresent = tables
    .filter((table) => REQUIRED_TABLES.has(table.table))
    .every((table) => table.exists);
  const appTablesHaveRls = tables
    .filter((table) => REQUIRED_TABLES.has(table.table))
    .every((table) => table.rlsEnabled);
  const exactPrivileges = tables.every((table) => table.permissionsMatch);
  const publicSchemaUsage = tables
    .filter((table) => table.table.startsWith('public.'))
    .every((table) => table.schemaUsage);
  const publicSchemaCreateDisabled = tables
    .filter((table) => table.table.startsWith('public.'))
    .every((table) => !table.schemaCreate);
  const authSchemaAccessDisabled = tables
    .filter((table) => table.table.startsWith('auth.'))
    .every((table) => !table.schemaUsage);

  return {
    database: first.database_name,
    tls: {
      active: first.tls_active,
      version: first.tls_version,
      cipher: first.cipher,
    },
    databaseCreate: first.database_create,
    role: {
      effective: first.effective_role,
      session: first.session_role,
      attributes: {
        superuser: first.rolsuper,
        createDatabase: first.rolcreatedb,
        createRoles: first.rolcreaterole,
        replication: first.rolreplication,
        bypassRls: first.rolbypassrls,
      },
      restricted: roleRestricted,
    },
    tables,
    checks: {
      tlsActive: first.tls_active === true,
      runtimeRoleRestricted: roleRestricted,
      applicationTablesPresent: appTablesPresent,
      applicationRlsEnabled: appTablesHaveRls,
      publicSchemaUsage,
      publicSchemaCreateDisabled,
      databaseCreateDisabled: first.database_create === false,
      authSchemaAccessDisabled,
      effectivePrivilegesMatch: exactPrivileges,
    },
    note: 'RLS policies and row-level behavior require separate review and are not certified by this probe.',
  };
}

function categorizarError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'DNS_FAILURE';
  if (['28P01', '28000'].includes(code)) return 'DATABASE_AUTH_FAILURE';
  if (
    code.startsWith('ERR_TLS')
    || [
      'CERT_HAS_EXPIRED',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'SELF_SIGNED_CERT_IN_CHAIN',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    ].includes(code)
  ) {
    return 'TLS_CERTIFICATE_FAILURE';
  }
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) {
    return 'NETWORK_FAILURE';
  }
  if (/^[0-9A-Z]{5}$/.test(code)) return `POSTGRES_${code}`;
  if (code === 'DATABASE_URL_MISSING') return code;
  return 'CONFIGURATION_OR_UNKNOWN_FAILURE';
}

async function consultarEstadoSeguridad(pool) {
  const result = await pool.query(SECURITY_QUERY);
  return evaluarEstadoSeguridad(result.rows);
}

async function main() {
  cargarEntorno();
  if (!process.env.DATABASE_URL) {
    const error = new Error('Defina DATABASE_URL para comprobar el rol runtime');
    error.code = 'DATABASE_URL_MISSING';
    throw error;
  }

  const pool = new Pool(crearOpcionesPoolPostgres(process.env.DATABASE_URL));
  let report;
  let queryFailure;
  let poolCloseFailure;
  try {
    report = await consultarEstadoSeguridad(pool);
  } catch (error) {
    queryFailure = categorizarError(error);
  } finally {
    try {
      await pool.end();
    } catch (error) {
      poolCloseFailure = categorizarError(error);
    }
  }

  const result = {
    status: queryFailure || poolCloseFailure ? 'failed' : 'completed',
    queryFailure: queryFailure || null,
    poolClosed: !poolCloseFailure,
    poolCloseFailure: poolCloseFailure || null,
    ...(report ? { report } : {}),
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'completed' || !Object.values(report.checks).every(Boolean)) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.log(JSON.stringify({
      status: 'failed',
      failure: categorizarError(error),
      poolClosed: true,
    }, null, 2));
    process.exitCode = 1;
  });
}

module.exports = {
  SECURITY_QUERY,
  evaluarEstadoSeguridad,
  categorizarError,
  consultarEstadoSeguridad,
};
