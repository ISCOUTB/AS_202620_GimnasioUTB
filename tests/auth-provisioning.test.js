const test = require('node:test');
const assert = require('node:assert/strict');
const {
  provisionarEstudiante,
} = require('../scripts/seed-demo-student');
const {
  crearInformeReconciliacion,
} = require('../scripts/reconcile-student-identities');
const {
  vincularPerfilExistente,
} = require('../scripts/link-student-auth');

const AUTH_ID = 'e52fef92-e63f-4f66-8865-7de0647c4c08';
const AUTH_EMAIL = 'demo-001@utb.edu.co';

function perfil(overrides = {}) {
  return {
    auth_user_id: null,
    codigo_estudiante: 'demo-001',
    correo: null,
    cedula_sintetica: '1234567890',
    nombre: 'Nombre legado',
    activa: false,
    ...overrides,
  };
}

function config(overrides = {}) {
  return {
    correo: AUTH_EMAIL,
    codigo: 'demo-001',
    cedula: '1000000001',
    nombre: 'Nombre nuevo',
    contrasena: 'clave-sintetica-segura',
    ...overrides,
  };
}

class FakePool {
  constructor(perfiles = []) {
    this.perfiles = perfiles;
    this.presencias = new Map([['demo-001', true]]);
    this.failInsert = false;
  }

  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('where codigo_estudiante = $1 or lower(correo)')) {
      return {
        rows: this.perfiles.filter((row) =>
          row.codigo_estudiante === params[0]
          || row.correo?.toLowerCase() === params[1].toLowerCase()
          || row.cedula_sintetica === params[2]
        ),
      };
    }
    if (normalized.startsWith('select auth_user_id, codigo_estudiante, correo, cedula_sintetica')) {
      return {
        rows: this.perfiles.filter((row) => row.codigo_estudiante === params[0]),
      };
    }
    if (normalized.startsWith('select codigo_estudiante from estudiantes where auth_user_id')) {
      return {
        rows: this.perfiles
          .filter((row) => row.auth_user_id === params[0])
          .map((row) => ({ codigo_estudiante: row.codigo_estudiante })),
      };
    }
    if (normalized.startsWith('update estudiantes set auth_user_id')) {
      const row = this.perfiles.find((item) => item.codigo_estudiante === params[0]);
      if (!row || (row.auth_user_id && row.auth_user_id !== params[1])
        || (row.correo && row.correo.toLowerCase() !== params[2].toLowerCase())) {
        return { rowCount: 0, rows: [] };
      }
      row.auth_user_id = params[1];
      row.correo = row.correo || params[2];
      return { rowCount: 1, rows: [{ codigo_estudiante: row.codigo_estudiante }] };
    }
    if (normalized.startsWith('insert into estudiantes')) {
      if (this.failInsert) throw new Error('simulated insert failure');
      const [authUserId, code, email, cedula, name] = params;
      if (this.perfiles.some((row) =>
        row.codigo_estudiante === code
        || row.auth_user_id === authUserId
        || row.correo?.toLowerCase() === email.toLowerCase()
        || row.cedula_sintetica === cedula
      )) {
        return { rowCount: 0, rows: [] };
      }
      this.perfiles.push(perfil({
        auth_user_id: authUserId,
        codigo_estudiante: code,
        correo: email,
        cedula_sintetica: cedula,
        nombre: name,
        activa: true,
      }));
      return { rowCount: 1, rows: [{ codigo_estudiante: code }] };
    }
    if (normalized.startsWith('select codigo_estudiante, auth_user_id, correo, activa')) {
      return { rows: [...this.perfiles] };
    }
    throw new Error(`Unexpected fake-pool query: ${normalized}`);
  }

  async connect() {
    return {
      query: async (sql, params = []) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        if (['begin', 'commit', 'rollback'].includes(normalized)) {
          return { rowCount: null, rows: [] };
        }
        if (normalized.startsWith('select auth_user_id, codigo_estudiante')) {
          return {
            rows: this.perfiles.filter((row) => row.codigo_estudiante === params[0]),
          };
        }
        if (normalized.startsWith('select codigo_estudiante from estudiantes')) {
          return {
            rows: this.perfiles
              .filter((row) => row.auth_user_id === params[0] && row.codigo_estudiante !== params[1])
              .map((row) => ({ codigo_estudiante: row.codigo_estudiante })),
          };
        }
        return this.query(sql, params);
      },
      release() {},
    };
  }

  async end() {}
}

class FakeAuthAdmin {
  constructor(users = []) {
    this.users = users;
    this.createCalls = 0;
    this.deleteCalls = 0;
    this.failCreateAfterCommit = false;
  }

  async listarUsuarios() {
    return this.users.map((user) => ({ ...user }));
  }

  async crearUsuario({ correo }) {
    this.createCalls += 1;
    const user = { id: AUTH_ID, email: correo };
    this.users.push(user);
    if (this.failCreateAfterCommit) throw new Error('simulated lost create response');
    return user;
  }

  async eliminarUsuario() {
    this.deleteCalls += 1;
  }
}

test('repetir el seed reutiliza la identidad y no duplica el perfil', async () => {
  const pool = new FakePool();
  const authAdmin = new FakeAuthAdmin();

  const first = await provisionarEstudiante({ pool, authAdmin, config: config() });
  const second = await provisionarEstudiante({ pool, authAdmin, config: config() });

  assert.equal(first.status, 'created-profile');
  assert.equal(second.status, 'already-linked');
  assert.equal(authAdmin.createCalls, 1);
  assert.equal(pool.perfiles.length, 1);
});

test('reintento recupera cuenta Auth creada antes de perderse la respuesta', async () => {
  const pool = new FakePool();
  const authAdmin = new FakeAuthAdmin();
  authAdmin.failCreateAfterCommit = true;

  const result = await provisionarEstudiante({ pool, authAdmin, config: config() });

  assert.equal(result.status, 'created-profile');
  assert.equal(pool.perfiles.length, 1);
  assert.equal(authAdmin.users.length, 1);
  assert.equal(authAdmin.deleteCalls, 0);
});

test('si falla la escritura local no elimina automáticamente la cuenta Auth', async () => {
  const pool = new FakePool();
  pool.failInsert = true;
  const authAdmin = new FakeAuthAdmin();

  await assert.rejects(
    provisionarEstudiante({ pool, authAdmin, config: config() }),
    /simulated insert failure/
  );
  assert.equal(authAdmin.users.length, 1);
  assert.equal(authAdmin.deleteCalls, 0);
  assert.equal(pool.perfiles.length, 0);
});

test('vincular por código conserva los datos y la presencia del perfil', async () => {
  const local = perfil();
  const pool = new FakePool([local]);
  const authAdmin = new FakeAuthAdmin([{ id: AUTH_ID, email: AUTH_EMAIL }]);

  const result = await vincularPerfilExistente({
    pool,
    authAdmin,
    codigo: 'demo-001',
    correo: AUTH_EMAIL,
  });

  assert.equal(result.status, 'linked-existing-profile');
  assert.equal(local.auth_user_id, AUTH_ID);
  assert.equal(local.correo, AUTH_EMAIL);
  assert.equal(local.codigo_estudiante, 'demo-001');
  assert.equal(local.nombre, 'Nombre legado');
  assert.equal(local.cedula_sintetica, '1234567890');
  assert.equal(local.activa, false);
  assert.equal(pool.presencias.get('demo-001'), true);
});

test('vincular no sobrescribe otra identidad ni duplica el vínculo Auth', async () => {
  const local = perfil();
  const existing = perfil({
    codigo_estudiante: 'demo-002',
    auth_user_id: AUTH_ID,
    correo: AUTH_EMAIL,
  });
  const pool = new FakePool([local, existing]);
  const authAdmin = new FakeAuthAdmin([{ id: AUTH_ID, email: AUTH_EMAIL }]);

  await assert.rejects(
    vincularPerfilExistente({
      pool,
      authAdmin,
      codigo: 'demo-001',
      correo: AUTH_EMAIL,
    }),
    /ya está vinculada al código demo-002/
  );
  assert.equal(local.auth_user_id, null);
});

test('la reconciliación detecta cuentas huérfanas, perfiles sin Auth y vínculos rotos', () => {
  const report = crearInformeReconciliacion(
    [
      perfil({ codigo_estudiante: 'unlinked', correo: 'candidate@utb.edu.co' }),
      perfil({
        codigo_estudiante: 'dangling',
        auth_user_id: 'a52fef92-e63f-4f66-8865-7de0647c4c08',
        correo: 'dangling@utb.edu.co',
      }),
    ],
    [
      { id: AUTH_ID, email: 'orphan@utb.edu.co' },
      { id: 'b52fef92-e63f-4f66-8865-7de0647c4c08', email: 'candidate@utb.edu.co' },
    ]
  );

  assert.equal(report.authSinPerfil[0].correo, 'orphan@utb.edu.co');
  assert.equal(report.authConCandidato[0].codigosEstudiante[0], 'unlinked');
  assert.equal(report.perfilesSinAuth[0].codigoEstudiante, 'unlinked');
  assert.equal(report.perfilesConAuthInexistente[0].codigoEstudiante, 'dangling');
});
