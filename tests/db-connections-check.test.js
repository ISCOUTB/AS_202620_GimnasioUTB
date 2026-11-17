const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONNECTION_QUERY,
  categorizarError,
  verificarConexiones,
} = require('../scripts/check-db-connections');

function environment(overrides = {}) {
  const projectRef = 'abcdefghijklmnopqrst';
  const host = `db.${projectRef}.supabase.co`;
  return {
    DATABASE_URL: `postgresql://gimnasio_runtime@${host}:5432/gym_test`,
    DB_MIGRATIONS_URL: `postgresql://gimnasio_migrator@${host}:5432/gym_test`,
    DB_MIGRATIONS_HOST: host,
    DB_MIGRATIONS_TARGET: 'gym_test',
    DB_MIGRATIONS_PROJECT_REF: projectRef,
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
    DATABASE_SSL: 'true',
    ...overrides,
  };
}

function connectionState(role, overrides = {}) {
  return {
    database_name: 'gym_test',
    effective_role: role,
    session_role: role,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
    rolinherit: false,
    has_role_memberships: false,
    database_connect: true,
    database_create: false,
    public_usage: true,
    public_create: role === 'gimnasio_migrator',
    existing_application_objects: [],
    ...overrides,
  };
}

function crearPoolFalso({ onQuery, onEnd, stream, stateOverrides } = {}) {
  return class PoolFalso {
    constructor(options) {
      this.role = new URL(options.connectionString).username;
      this.ssl = options.ssl;
    }

    async connect() {
      return {
        connection: {
          stream: typeof stream === 'function' ? stream(this.role) : stream || {
            encrypted: true,
            authorized: true,
            getProtocol: () => 'TLSv1.3',
          },
        },
        query: async (query) => {
          onQuery?.(this.role, query, this);
          if (query === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
          return {
            rows: [connectionState(this.role, stateOverrides?.(this.role, query))],
          };
        },
        release() {},
      };
    }

    async end() {
      onEnd?.(this.role);
    }
  };
}

test('preflight comprueba ambos roles, TLS y permisos sin escrituras y cierra los pools', async () => {
  const queriedRoles = [];
  const closedRoles = [];
  const PoolImpl = crearPoolFalso({
    onQuery(role, query, pool) {
      queriedRoles.push(role);
      assert.match(query.trim(), /^(SELECT 1|WITH)/);
      assert.deepEqual(pool.ssl, { rejectUnauthorized: true });
    },
    onEnd(role) {
      closedRoles.push(role);
    },
  });

  const result = await verificarConexiones(environment(), PoolImpl);

  assert.equal(result.status, 'completed');
  assert.equal(queriedRoles.length, 4);
  assert.deepEqual(queriedRoles.sort(), [
    'gimnasio_migrator',
    'gimnasio_migrator',
    'gimnasio_runtime',
    'gimnasio_runtime',
  ]);
  assert.deepEqual(closedRoles.sort(), ['gimnasio_migrator', 'gimnasio_runtime']);
  assert.deepEqual(result.poolClosed, { runtime: true, migrator: true });
  assert.ok(Object.values(result.report.checks).every(Boolean));
  assert.deepEqual(result.report.runtime.tls, {
    active: true,
    verified: true,
    version: 'TLSv1.3',
  });
  assert.deepEqual(result.report.migrator.tls, {
    active: true,
    verified: true,
    version: 'TLSv1.3',
  });
  assert.doesNotMatch(CONNECTION_QUERY, /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/im);
  assert.doesNotMatch(JSON.stringify(result), /postgresql:\/\//i);
});

test('preflight identifica desajustes de host sin revelar configuración', async () => {
  class PoolImpl {
    constructor() {
      assert.fail('No debe abrir pools si la confirmación de host es incorrecta');
    }
  }

  const result = await verificarConexiones(
    environment({ DB_MIGRATIONS_HOST: 'wrong-host.example' }),
    PoolImpl
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.queryFailures.configuration, 'DB_MIGRATIONS_HOST_MISMATCH');
  assert.deepEqual(result.poolClosed, { runtime: true, migrator: true });
  assert.doesNotMatch(JSON.stringify(result), /wrong-host|postgresql:\/\//i);
});

test('categoriza errores de configuración sin mostrar sus mensajes', () => {
  const error = Object.assign(
    new Error('DB_MIGRATIONS_HOST no coincide con un valor privado'),
    { code: 'DB_MIGRATIONS_HOST_MISMATCH' }
  );

  assert.equal(categorizarError(error), 'DB_MIGRATIONS_HOST_MISMATCH');
});

test('preflight falla si runtime puede hacer DDL o su socket no tiene TLS', async () => {
  const PoolImpl = crearPoolFalso({
    stream: (role) => ({
      encrypted: role !== 'gimnasio_runtime',
      authorized: role !== 'gimnasio_runtime',
      getProtocol: () => 'TLSv1.3',
    }),
    stateOverrides(role) {
      return {
        public_create: role === 'gimnasio_runtime'
          || role === 'gimnasio_migrator',
        has_role_memberships: role === 'gimnasio_runtime',
      };
    },
  });

  const result = await verificarConexiones(environment(), PoolImpl);

  assert.equal(result.status, 'failed');
  assert.equal(result.report.checks.runtimeTlsActive, false);
  assert.equal(result.report.checks.runtimeTlsVerified, false);
  assert.equal(result.report.checks.runtimeHasNoDdl, false);
  assert.equal(result.report.checks.runtimeRoleRestricted, false);
  assert.equal(result.poolClosed.runtime, true);
  assert.equal(result.poolClosed.migrator, true);
});

test('preflight no aprueba un socket TLS no verificado o sin versión negociada', async () => {
  for (const stream of [
    { encrypted: true, authorized: false, getProtocol: () => 'TLSv1.3' },
    { encrypted: true, authorized: true, getProtocol: () => null },
  ]) {
    const result = await verificarConexiones(
      environment(),
      crearPoolFalso({ stream })
    );

    assert.equal(result.status, 'failed');
    assert.equal(result.report.checks.runtimeTlsActive, true);
    assert.equal(result.report.checks.runtimeTlsVerified, stream.authorized);
    assert.equal(
      result.report.checks.runtimeTlsVersionKnown,
      stream.authorized && Boolean(stream.getProtocol())
    );
  }
});

test('preflight clasifica fallos de conexión y cierra ambos pools', async () => {
  const closedRoles = [];
  const PoolImpl = crearPoolFalso({
    onQuery(role) {
      if (role === 'gimnasio_migrator') {
        const error = new Error('redacted failure');
        error.code = 'ENOTFOUND';
        throw error;
      }
    },
    onEnd(role) {
      closedRoles.push(role);
    },
  });

  const result = await verificarConexiones(environment(), PoolImpl);

  assert.equal(result.status, 'failed');
  assert.equal(result.queryFailures.migrator, 'DNS_FAILURE');
  assert.deepEqual(result.poolClosed, { runtime: true, migrator: true });
  assert.deepEqual(closedRoles.sort(), ['gimnasio_migrator', 'gimnasio_runtime']);
  assert.doesNotMatch(JSON.stringify(result), /redacted failure|localhost|postgresql:\/\//i);
});
