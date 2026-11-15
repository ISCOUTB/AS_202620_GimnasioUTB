const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const { QrNoValidoError } = require('../src/modules/identidad/application/identidad.errors');

const TOKEN_OPERADOR = 'token-operador-de-prueba-con-32-caracteres';

async function conServidor(app, ejecutar) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    await ejecutar(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function crearRepositorios({ qrValido = true } = {}) {
  let aforo = 0;
  const identidadRepository = {
    async iniciarSesion(codigoEstudiante, contrasena) {
      assert.equal(codigoEstudiante, 'demo-001');
      assert.equal(contrasena, 'clave-de-prueba');
      return {
        token: 'sesion-de-prueba',
        expiresAt: '2026-11-15T12:00:00.000Z',
        estudiante: {
          codigoEstudiante: 'demo-001',
          nombre: 'Estudiante de prueba',
        },
      };
    },
    async obtenerEstudianteDeSesion(token) {
      return token === 'sesion-de-prueba'
        ? { codigo_estudiante: 'demo-001', nombre: 'Estudiante de prueba' }
        : null;
    },
    async emitirQr(codigoEstudiante) {
      assert.equal(codigoEstudiante, 'demo-001');
      return { token: 'qr-de-prueba', expiresAt: '2026-11-15T12:00:00.000Z' };
    },
    async consumirQr(_transaccion, token) {
      if (!qrValido || token !== 'qr-de-prueba') throw new QrNoValidoError();
      return 'ENTRADA';
    },
  };
  const aforoRepository = {
    async obtenerAforoActual() {
      return aforo;
    },
    async actualizarAforo(transicionar) {
      const nuevoAforo = await transicionar(aforo, {});
      aforo = nuevoAforo;
      return aforo;
    },
  };
  return { aforoRepository, identidadRepository };
}

test('estudiante inicia sesión, emite un QR y el encargado registra el acceso', async () => {
  const repositories = crearRepositorios();
  const app = createApp({
    ...repositories,
    operadorToken: TOKEN_OPERADOR,
  });

  await conServidor(app, async (baseUrl) => {
    const login = await fetch(`${baseUrl}/api/v1/estudiantes/sesion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigoEstudiante: 'demo-001',
        contrasena: 'clave-de-prueba',
      }),
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).data.token, 'sesion-de-prueba');

    const qr = await fetch(`${baseUrl}/api/v1/estudiantes/qr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer sesion-de-prueba',
      },
      body: '{}',
    });
    assert.equal(qr.status, 201);
    assert.equal((await qr.json()).data.token, 'qr-de-prueba');

    const acceso = await fetch(`${baseUrl}/api/v1/aforo/acceso-qr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN_OPERADOR}`,
      },
      body: JSON.stringify({ qr: 'qr-de-prueba' }),
    });
    assert.equal(acceso.status, 201);
    assert.deepEqual((await acceso.json()).data, {
      tipoAcceso: 'ENTRADA',
      aforoActual: 1,
    });
  });
});

test('un QR inválido no modifica el aforo y el endpoint requiere token de operador', async () => {
  const app = createApp({
    ...crearRepositorios({ qrValido: false }),
    operadorToken: TOKEN_OPERADOR,
  });

  await conServidor(app, async (baseUrl) => {
    const sinToken = await fetch(`${baseUrl}/api/v1/aforo/acceso-qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr: 'qr-de-prueba' }),
    });
    assert.equal(sinToken.status, 401);

    const invalido = await fetch(`${baseUrl}/api/v1/aforo/acceso-qr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN_OPERADOR}`,
      },
      body: JSON.stringify({ qr: 'qr-de-prueba' }),
    });
    assert.equal(invalido.status, 400);
    const aforo = await fetch(`${baseUrl}/api/v1/aforo`);
    assert.equal((await aforo.json()).data.aforoActual, 0);
  });
});

test('no habilita sesiones estudiantiles cuando no hay repositorio de identidad', async () => {
  const app = createApp({ operadorToken: TOKEN_OPERADOR });
  await conServidor(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/estudiantes/sesion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigoEstudiante: 'demo-001',
        contrasena: 'clave-de-prueba',
      }),
    });
    assert.equal(response.status, 503);
  });
});
