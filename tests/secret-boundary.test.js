const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../src/server');
const { logger } = require('../src/shared/logger');

const ROOT = path.join(__dirname, '..');

function archivosDart(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return archivosDart(fullPath);
    return entry.isFile() && entry.name.endsWith('.dart') ? [fullPath] : [];
  });
}

test('la API runtime no lee credenciales administrativas', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/server.js'), 'utf8');
  for (const secreto of ['DB_MIGRATIONS_URL', 'DB_ADMIN_URL', 'POSTGRES_PASSWORD', 'DEMO_STUDENTS']) {
    assert.equal(source.includes(secreto), false, `server.js no debe leer ${secreto}`);
  }
});

test('el código Flutter no contiene credenciales de base de datos ni contraseñas', () => {
  const flutterLib = path.join(ROOT, 'docs', 'Flutter', 'lib');
  for (const file of archivosDart(flutterLib)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(
      /DB_MIGRATIONS_URL|DB_ADMIN_URL|POSTGRES_PASSWORD|postgresql:\/\//.test(source),
      false,
      `${path.relative(ROOT, file)} no debe contener credenciales de base de datos`
    );
  }
});

test('la respuesta de login solo expone el token de sesión y datos del perfil', async () => {
  const marcador = 'password-hash-never-return-this';
  const app = createApp({
    identidadRepository: {
      async obtenerEstudiantePorCodigo() {
        return {
          codigo_estudiante: 'demo-001',
          nombre: 'Estudiante de prueba',
          password_hash: marcador,
        };
      },
    },
    autenticacion: {
      async iniciarSesion() {
        return {
          token: 'session-token',
          expiresAt: '2026-11-16T12:00:00.000Z',
          passwordHash: marcador,
          usuario: { id: 'demo-001' },
        };
      },
    },
  });
  const server = app.listen(0);
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/v1/estudiantes/sesion`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correo: 'demo-001@utb.edu.co',
          contrasena: 'clave-sintetica',
        }),
      }
    );
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(body.includes(marcador), false);
    assert.equal(/password/i.test(body), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('errores de PostgreSQL y de autenticación no filtran configuración en logs ni respuestas', async () => {
  const marker = 'CONFIGURATION_SECRET_MARKER_DO_NOT_LEAK';
  const app = createApp({
    aforoRepository: {
      async obtenerAforoActual() {
        throw new Error(marker);
      },
    },
    identidadRepository: {},
    autenticacion: {
      async iniciarSesion() {
        throw new Error(marker);
      },
    },
  });
  const loggedMessages = [];
  const originalError = logger.error;
  logger.error = (event, message) => loggedMessages.push(`${event} ${message}`);
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const postgresResponse = await fetch(`${baseUrl}/api/v1/aforo`);
    const postgresBody = await postgresResponse.text();
    const authResponse = await fetch(`${baseUrl}/api/v1/estudiantes/sesion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correo: 'demo-001@utb.edu.co',
        contrasena: 'synthetic-test-value',
      }),
    });
    const authBody = await authResponse.text();

    assert.equal(postgresResponse.status, 503);
    assert.equal(authResponse.status, 503);
    assert.equal(
      [postgresBody, authBody, ...loggedMessages].some((value) => value.includes(marker)),
      false
    );
  } finally {
    logger.error = originalError;
    await new Promise((resolve) => server.close(resolve));
  }
});
