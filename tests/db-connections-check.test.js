const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONNECTION_QUERY,
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
    tls_active: true,
    tls_version: 'TLSv1.3',
    existing_application_objects: [],
    ...overrides,
  };
}

function crearPoolFalso({ onQuery, onEnd } = {}) {
  return class PoolFalso {
    constructor(options) {
      this.role = new URL(options.connectionString).username;
      this.ssl = options.ssl;
    }

    async query(query) {
      onQuery?.(this.role, query, this);
      return { rows: [connectionState(this.role)] };
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
      assert.match(query.trim(), /^WITH/);
      assert.deepEqual(pool.ssl, { rejectUnauthorized: true });
    },
    onEnd(role) {
      closedRoles.push(role);
    },
  });

  const result = await verificarConexiones(environment(), PoolImpl);

  assert.equal(result.status, 'completed');
  assert.deepEqual(queriedRoles.sort(), ['gimnasio_migrator', 'gimnasio_runtime']);
  assert.deepEqual(closedRoles.sort(), ['gimnasio_migrator', 'gimnasio_runtime']);
  assert.deepEqual(result.poolClosed, { runtime: true, migrator: true });
  assert.ok(Object.values(result.report.checks).every(Boolean));
  assert.doesNotMatch(CONNECTION_QUERY, /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/im);
  assert.doesNotMatch(JSON.stringify(result), /postgresql:\/\//i);
});

test('preflight falla si runtime puede hacer DDL o no hay TLS', async () => {
  class PoolImpl extends crearPoolFalso() {
    async query() {
      const state = connectionState(this.role, {
        tls_active: this.role !== 'gimnasio_runtime',
        public_create: this.role === 'gimnasio_runtime'
          || this.role === 'gimnasio_migrator',
        has_role_memberships: this.role === 'gimnasio_runtime',
      });
      return { rows: [state] };
    }
  }

  const result = await verificarConexiones(environment(), PoolImpl);

  assert.equal(result.status, 'failed');
  assert.equal(result.report.checks.runtimeTlsActive, false);
  assert.equal(result.report.checks.runtimeHasNoDdl, false);
  assert.equal(result.report.checks.runtimeRoleRestricted, false);
  assert.equal(result.poolClosed.runtime, true);
  assert.equal(result.poolClosed.migrator, true);
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
