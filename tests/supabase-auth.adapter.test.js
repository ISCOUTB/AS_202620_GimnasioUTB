const test = require('node:test');
const assert = require('node:assert/strict');
const { SupabaseAuthAdapter } = require('../src/modules/identidad/infrastructure/auth/supabase-auth.adapter');
const { SupabaseAuthAdminAdapter } = require('../src/modules/identidad/infrastructure/auth/supabase-auth-admin.adapter');
const { normalizarSupabaseUrl } = require('../src/modules/identidad/infrastructure/auth/supabase-url');
const {
  CredencialesInvalidasError,
  IdentidadProveedorError,
} = require('../src/modules/identidad/application/identidad.errors');

const USER_ID = 'e52fef92-e63f-4f66-8865-7de0647c4c08';

function respuesta(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test('Supabase Auth intercambia correo y contraseña por el token de acceso', async () => {
  const adapter = new SupabaseAuthAdapter({
    url: 'https://gym-demo.supabase.co/',
    anonKey: 'anon-test-key',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://gym-demo.supabase.co/auth/v1/token?grant_type=password');
      assert.equal(options.headers.apikey, 'anon-test-key');
      assert.deepEqual(JSON.parse(options.body), {
        email: 'demo-001@utb.edu.co',
        password: 'clave-sintetica',
      });
      return respuesta(200, {
        access_token: 'access-token',
        expires_in: 3600,
        user: { id: USER_ID, email: 'demo-001@utb.edu.co' },
      });
    },
  });

  const session = await adapter.iniciarSesion('demo-001@utb.edu.co', 'clave-sintetica');
  assert.equal(session.token, 'access-token');
  assert.equal(session.usuario.id, USER_ID);
  assert.equal(Date.parse(session.expiresAt) > Date.now(), true);
});

test('Supabase Auth valida access tokens contra el endpoint de usuario', async () => {
  const adapter = new SupabaseAuthAdapter({
    url: 'https://gym-demo.supabase.co',
    anonKey: 'anon-test-key',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://gym-demo.supabase.co/auth/v1/user');
      assert.equal(options.headers.Authorization, 'Bearer access-token');
      return respuesta(200, { id: USER_ID, email: 'demo-001@utb.edu.co' });
    },
  });

  assert.deepEqual(await adapter.obtenerUsuario('access-token'), {
    id: USER_ID,
    correo: 'demo-001@utb.edu.co',
  });
});

test('Supabase Auth prefiere la publishable key y conserva la anon key heredada', async () => {
  for (const [env, expectedKey] of [
    [
      { SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key', SUPABASE_ANON_KEY: 'anon-test-key' },
      'publishable-test-key',
    ],
    [{ SUPABASE_ANON_KEY: 'anon-test-key' }, 'anon-test-key'],
  ]) {
    const adapter = new SupabaseAuthAdapter({
      url: 'https://gym-demo.supabase.co',
      env,
      fetchImpl: async (_url, options) => {
        assert.equal(options.headers.apikey, expectedKey);
        return respuesta(401, {});
      },
    });

    assert.equal(await adapter.obtenerUsuario('invalid-token'), null);
  }
});

test('Supabase Auth distingue credenciales incorrectas de fallos del proveedor', async () => {
  const invalidCredentials = new SupabaseAuthAdapter({
    url: 'https://gym-demo.supabase.co',
    anonKey: 'anon-test-key',
    fetchImpl: async () => respuesta(400, { message: 'invalid credentials' }),
  });
  await assert.rejects(
    invalidCredentials.iniciarSesion('demo-001@utb.edu.co', 'incorrecta'),
    CredencialesInvalidasError
  );

  const unavailable = new SupabaseAuthAdapter({
    url: 'https://gym-demo.supabase.co',
    anonKey: 'anon-test-key',
    fetchImpl: async () => respuesta(503, {}),
  });
  await assert.rejects(
    unavailable.iniciarSesion('demo-001@utb.edu.co', 'clave-sintetica'),
    IdentidadProveedorError
  );
});

test('Supabase Auth devuelve null para tokens inválidos', async () => {
  const adapter = new SupabaseAuthAdapter({
    url: 'https://gym-demo.supabase.co',
    anonKey: 'anon-test-key',
    fetchImpl: async () => respuesta(401, {}),
  });
  assert.equal(await adapter.obtenerUsuario('invalid-token'), null);
});

test('SUPABASE_URL exige HTTPS salvo localhost y no admite rutas adicionales', () => {
  assert.equal(normalizarSupabaseUrl('http://127.0.0.1:54321'), 'http://127.0.0.1:54321');
  assert.throws(() => normalizarSupabaseUrl('http://gym-demo.supabase.co'), /debe usar HTTPS/);
  assert.throws(() => normalizarSupabaseUrl('https://gym-demo.supabase.co/auth'), /raíz del proyecto/);
});

test('Supabase Auth Admin solo usa la clave de servicio para provisioning', async () => {
  const adapter = new SupabaseAuthAdminAdapter({
    url: 'https://gym-demo.supabase.co',
    serviceRoleKey: 'service-role-test-key',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://gym-demo.supabase.co/auth/v1/admin/users');
      assert.equal(options.headers.apikey, 'service-role-test-key');
      assert.equal(options.headers.Authorization, 'Bearer service-role-test-key');
      assert.deepEqual(JSON.parse(options.body), {
        email: 'demo-001@utb.edu.co',
        password: 'clave-sintetica',
        email_confirm: true,
      });
      return respuesta(201, { id: USER_ID });
    },
  });

  assert.deepEqual(await adapter.crearUsuario({
    correo: 'demo-001@utb.edu.co',
    contrasena: 'clave-sintetica',
  }), { id: USER_ID });
});

test('Supabase Auth Admin pagina la lista de usuarios para reconciliación', async () => {
  const adapter = new SupabaseAuthAdminAdapter({
    url: 'https://gym-demo.supabase.co',
    serviceRoleKey: 'service-role-test-key',
    fetchImpl: async (url, options) => {
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.apikey, 'service-role-test-key');
      const page = new URL(url).searchParams.get('page');
      if (page === '1') {
        return respuesta(200, {
          users: Array.from({ length: 100 }, (_, index) => ({
            id: `e52fef92-e63f-4f66-8865-${String(index).padStart(12, '0')}`,
            email: `demo-${index}@utb.edu.co`,
          })),
        });
      }
      assert.equal(page, '2');
      return respuesta(200, {
        users: [{ id: USER_ID, email: 'demo-final@utb.edu.co' }],
      });
    },
  });

  const users = await adapter.listarUsuarios();
  assert.equal(users.length, 101);
  assert.equal(users[100].email, 'demo-final@utb.edu.co');
});
