const { Pool } = require('pg');
const { cargarEntorno } = require('../src/shared/environment');
const { crearOpcionesPoolPostgres } = require('../src/shared/postgres-pool');
const { validarDestinoPostgres } = require('./postgres-destination');

const CONNECTION_QUERY = `
  WITH role_state AS (
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
        'CONNECT'
      ) AS database_connect,
      pg_catalog.has_database_privilege(
        current_user,
        current_database(),
        'CREATE'
      ) AS database_create,
      pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE') AS public_usage,
      pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') AS public_create
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user
  )
  SELECT
    role_state.*,
    ARRAY(
      SELECT relation.relname::TEXT
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY (ARRAY[
          'aforo_estado',
          'estudiantes',
          'sesiones_estudiantes',
          'qr_credenciales',
          'estudiante_estado_acceso',
          'schema_migrations'
        ])
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
      ORDER BY relation.relname
    ) AS existing_application_objects
  FROM role_state
`;

const ROLE_ADMIN_ATTRIBUTES = [
  'rolsuper',
  'rolcreatedb',
  'rolcreaterole',
  'rolreplication',
  'rolbypassrls',
];

const CONFIGURATION_ERROR_CODES = new Set([
  'DB_MIGRATIONS_URL_MISSING',
  'DESTINATION_CONFIRMATION_MISSING',
  'DB_MIGRATIONS_URL_INVALID',
  'DB_MIGRATIONS_URL_PROTOCOL_INVALID',
  'DB_MIGRATIONS_URL_PORT_INVALID',
  'DB_MIGRATIONS_URL_DATABASE_INVALID',
  'DB_MIGRATIONS_TARGET_MISMATCH',
  'DB_MIGRATIONS_HOST_MISMATCH',
  'SUPABASE_URL_INVALID',
  'DB_MIGRATIONS_PROJECT_REF_MISMATCH',
  'DB_MIGRATIONS_URL_USERNAME_INVALID',
  'DB_MIGRATIONS_URL_PROJECT_MISMATCH',
  'DB_MIGRATIONS_URL_ROLE_MISMATCH',
  'DATABASE_URL_MISSING',
  'DATABASE_URL_INVALID',
  'DATABASE_URL_PROTOCOL_INVALID',
  'DATABASE_URL_PORT_INVALID',
  'DATABASE_URL_USERNAME_INVALID',
  'DATABASE_URL_COMPONENT_INVALID',
  'DATABASE_URL_ROLE_MISMATCH',
  'DATABASE_URL_DESTINATION_OR_ROLE_MISMATCH',
  'POSTGRES_URL_INVALID',
  'POSTGRES_URL_PROTOCOL_INVALID',
  'DATABASE_SSL_INVALID',
  'DATABASE_SSL_CA_CERT_READ_FAILURE',
  'DATABASE_SSL_CA_CERT_INVALID',
  'TLS_DISABLED_FOR_REMOTE_DATABASE',
]);

function rolRestringido(role) {
  return Boolean(role)
    && ROLE_ADMIN_ATTRIBUTES.every((attribute) => role[attribute] === false)
    && role.rolinherit === false
    && role.has_role_memberships === false;
}

function crearInforme(runtime, migrator, destination) {
  const checks = {
    destinationConfirmed: destination.projectRef !== null,
    expectedRuntimeRole: runtime.effective_role === 'gimnasio_runtime',
    expectedMigratorRole: migrator.effective_role === 'gimnasio_migrator',
    directRoleLogins: runtime.session_role === runtime.effective_role
      && migrator.session_role === migrator.effective_role,
    rolesAreDistinct: runtime.effective_role !== migrator.effective_role,
    sameDatabase: runtime.database_name === migrator.database_name
      && runtime.database_name === destination.databaseName,
    runtimeTlsActive: runtime.tls_active === true,
    runtimeTlsVerified: runtime.tls_verified === true,
    runtimeTlsVersionKnown: typeof runtime.tls_version === 'string'
      && runtime.tls_version.length > 0,
    migratorTlsActive: migrator.tls_active === true,
    migratorTlsVerified: migrator.tls_verified === true,
    migratorTlsVersionKnown: typeof migrator.tls_version === 'string'
      && migrator.tls_version.length > 0,
    runtimeRoleRestricted: rolRestringido(runtime),
    migratorRoleRestricted: rolRestringido(migrator),
    runtimeCanConnect: runtime.database_connect === true,
    migratorCanConnect: migrator.database_connect === true,
    runtimeHasNoDdl: runtime.database_create === false
      && runtime.public_create === false
      && runtime.public_usage === true,
    migratorCanBootstrap: migrator.database_create === false
      && migrator.public_usage === true
      && migrator.public_create === true,
    applicationObjectsAbsent: Array.isArray(runtime.existing_application_objects)
      && runtime.existing_application_objects.length === 0
      && Array.isArray(migrator.existing_application_objects)
      && migrator.existing_application_objects.length === 0,
  };

  return {
    destination: {
      database: destination.databaseName,
      projectConfirmed: destination.projectRef !== null,
    },
    runtime: {
      role: runtime.effective_role,
      sessionRole: runtime.session_role,
      tls: {
        active: runtime.tls_active,
        verified: runtime.tls_verified,
        version: runtime.tls_version || null,
      },
      databaseCreate: runtime.database_create,
      publicSchema: {
        usage: runtime.public_usage,
        create: runtime.public_create,
      },
    },
    migrator: {
      role: migrator.effective_role,
      sessionRole: migrator.session_role,
      tls: {
        active: migrator.tls_active,
        verified: migrator.tls_verified,
        version: migrator.tls_version || null,
      },
      databaseCreate: migrator.database_create,
      publicSchema: {
        usage: migrator.public_usage,
        create: migrator.public_create,
      },
    },
    existingApplicationObjects: runtime.existing_application_objects,
    checks,
  };
}

function obtenerCodigoError(error) {
  if (typeof error?.code === 'string') return error.code;
  if (typeof error?.cause?.code === 'string') return error.cause.code;
  return '';
}

function categorizarError(error) {
  const code = obtenerCodigoError(error);
  if (CONFIGURATION_ERROR_CODES.has(code)) return code;
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
  return 'CONFIGURATION_OR_UNKNOWN_FAILURE';
}

async function consultarEstadoConexion(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    const result = await client.query(CONNECTION_QUERY);
    const stream = client.connection?.stream;
    const tlsActive = stream?.encrypted === true;
    const tlsVerified = tlsActive && stream.authorized === true;
    return {
      ...result.rows[0],
      tls_active: tlsActive,
      tls_verified: tlsVerified,
      tls_version: tlsVerified && typeof stream.getProtocol === 'function'
        ? stream.getProtocol()
        : null,
    };
  } finally {
    client.release();
  }
}

async function verificarConexiones(env = process.env, PoolImpl = Pool) {
  const poolStates = {
    runtime: { opened: false, closed: true },
    migrator: { opened: false, closed: true },
  };
  const queryFailures = {};
  const closeFailures = {};
  let runtimePool;
  let migratorPool;
  let destination;
  let report;

  try {
    destination = validarDestinoPostgres(env);
    runtimePool = new PoolImpl(crearOpcionesPoolPostgres(env.DATABASE_URL, {}, env));
    poolStates.runtime = { opened: true, closed: false };
    migratorPool = new PoolImpl(crearOpcionesPoolPostgres(env.DB_MIGRATIONS_URL, {}, env));
    poolStates.migrator = { opened: true, closed: false };

    const [runtimeResult, migratorResult] = await Promise.allSettled([
      consultarEstadoConexion(runtimePool),
      consultarEstadoConexion(migratorPool),
    ]);
    if (runtimeResult.status === 'rejected') {
      queryFailures.runtime = categorizarError(runtimeResult.reason);
    }
    if (migratorResult.status === 'rejected') {
      queryFailures.migrator = categorizarError(migratorResult.reason);
    }
    if (runtimeResult.status === 'fulfilled' && migratorResult.status === 'fulfilled') {
      report = crearInforme(
        runtimeResult.value,
        migratorResult.value,
        destination
      );
    }
  } catch (error) {
    queryFailures.configuration = categorizarError(error);
  } finally {
    // Los dos pools son independientes: se cierran en paralelo y el fallo de
    // uno no impide intentar cerrar el otro.
    const pools = [['runtime', runtimePool], ['migrator', migratorPool]]
      .filter(([, pool]) => pool);
    await Promise.all(pools.map(async ([name, pool]) => {
      try {
        await pool.end();
        poolStates[name].closed = true;
      } catch (error) {
        closeFailures[name] = categorizarError(error);
      }
    }));
  }

  const checksPassed = report && Object.values(report.checks).every(Boolean);
  const status = Object.keys(queryFailures).length === 0
    && Object.keys(closeFailures).length === 0
    && checksPassed
    ? 'completed'
    : 'failed';

  return {
    status,
    queryFailures,
    poolClosed: {
      runtime: poolStates.runtime.closed,
      migrator: poolStates.migrator.closed,
    },
    closeFailures,
    ...(report ? { report } : {}),
  };
}

async function main() {
  cargarEntorno();
  const result = await verificarConexiones();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'completed') process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.log(JSON.stringify({
      status: 'failed',
      queryFailures: { configuration: categorizarError(error) },
      poolClosed: { runtime: true, migrator: true },
      closeFailures: {},
    }, null, 2));
    process.exitCode = 1;
  });
}

module.exports = {
  CONNECTION_QUERY,
  categorizarError,
  crearInforme,
  verificarConexiones,
};
