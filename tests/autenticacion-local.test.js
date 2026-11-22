const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { AutenticacionLocalAdapter } = require('../src/modules/identidad/infrastructure/auth/autenticacion-local.adapter');
const { crearHashContrasena, verificarContrasena } = require('../src/modules/identidad/infrastructure/auth/contrasena');
const { CredencialesInvalidasError } = require('../src/modules/identidad/application/identidad.errors');

test('el hash de contraseña usa scrypt con salt aleatorio y se verifica', async () => {
  const hash = await crearHashContrasena('clave-de-prueba-123');
  const otro = await crearHashContrasena('clave-de-prueba-123');
  assert.match(hash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.notEqual(hash, otro, 'cada hash lleva su propio salt');
  assert.equal(await verificarContrasena('clave-de-prueba-123', hash), true);
  assert.equal(await verificarContrasena('clave-incorrecta', hash), false);
});

test('un hash ausente o con otro formato nunca valida', async () => {
  for (const hash of [null, undefined, '', 'texto-plano', 'bcrypt$abc$def']) {
    assert.equal(await verificarContrasena('cualquier-clave', hash), false);
  }
});

function poolFalso(estudiante) {
  const consultas = [];
  return {
    consultas,
    async query(sql, params) {
      consultas.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (sql.includes('FROM estudiantes')) return { rows: estudiante ? [estudiante] : [] };
      if (sql.includes('FROM sesiones_estudiantes')) {
        const guardado = consultas.find((c) => c.sql.startsWith('INSERT INTO sesiones_estudiantes'));
        return { rows: guardado && guardado.params[0] === params[0] ? [{ codigo_estudiante: 'demo-001' }] : [] };
      }
      return { rows: [] };
    },
  };
}

test('el login correcto crea una sesión de 8 horas y guarda solo el hash del token', async () => {
  const pool = poolFalso({
    codigo_estudiante: 'demo-001',
    password_hash: await crearHashContrasena('clave-de-prueba-123'),
  });
  const auth = new AutenticacionLocalAdapter({ pool });
  const antes = Date.now();
  const sesion = await auth.iniciarSesion('demo-001@utb.edu.co', 'clave-de-prueba-123');

  assert.deepEqual(sesion.usuario, { id: 'demo-001' });
  const insert = pool.consultas.find((c) => c.sql.startsWith('INSERT INTO sesiones_estudiantes'));
  assert.equal(insert.params[0], crypto.createHash('sha256').update(sesion.token).digest('hex'));
  assert.notEqual(insert.params[0], sesion.token);
  const duracion = Date.parse(sesion.expiresAt) - antes;
  assert.ok(duracion > 7.9 * 3600 * 1000 && duracion <= 8 * 3600 * 1000 + 1000);
  assert.match(pool.consultas[0].sql, /WHERE LOWER\(correo\) = LOWER\(\$1\) AND activa/);

  assert.deepEqual(await auth.obtenerUsuario(sesion.token), { id: 'demo-001' });
  assert.equal(await auth.obtenerUsuario('otro-token'), null);
  assert.equal(await auth.obtenerUsuario(''), null);
});

test('contraseña incorrecta o correo inexistente dan el mismo error y no crean sesión', async () => {
  const pool = poolFalso({
    codigo_estudiante: 'demo-001',
    password_hash: await crearHashContrasena('clave-de-prueba-123'),
  });
  const auth = new AutenticacionLocalAdapter({ pool });
  await assert.rejects(auth.iniciarSesion('demo-001@utb.edu.co', 'otra-clave'), CredencialesInvalidasError);

  const sinEstudiante = poolFalso(null);
  await assert.rejects(
    new AutenticacionLocalAdapter({ pool: sinEstudiante }).iniciarSesion('nadie@utb.edu.co', 'otra-clave'),
    CredencialesInvalidasError
  );
  for (const p of [pool, sinEstudiante]) {
    assert.equal(p.consultas.some((c) => c.sql.startsWith('INSERT')), false);
  }
});

test('el adaptador exige un pool PostgreSQL', () => {
  assert.throws(() => new AutenticacionLocalAdapter(), /pool PostgreSQL/);
});
