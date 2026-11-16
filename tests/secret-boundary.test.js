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

test('la API runtime no inyecta la clave privilegiada de Supabase', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/server.js'), 'utf8');
  assert.equal(source.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
});

test('el código Flutter no contiene claves privilegiadas ni su configuración', () => {
  const flutterLib = path.join(ROOT, 'docs', 'Flutter', 'lib');
  for (const file of archivosDart(flutterLib)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(
      source.includes('SUPABASE_SERVICE_ROLE_KEY') || source.includes('service_role'),
      false,
      `${path.relative(ROOT, file)} no debe contener claves de servicio`
    );
  }
});

test('la respuesta de login solo expone el token Auth y datos del perfil', async () => {
  const serviceKeyMarker = 'service-role-never-return-this';
  const app = createApp({
    identidadRepository: {
      async obtenerEstudiantePorAuthId() {
        return {
          codigo_estudiante: 'demo-001',
          nombre: 'Estudiante de prueba',
        };
      },
    },
    supabaseAuth: {
      async iniciarSesion() {
        return {
          token: 'access-token',
          expiresAt: '2026-11-16T12:00:00.000Z',
          serviceRoleKey: serviceKeyMarker,
          usuario: { id: 'e52fef92-e63f-4f66-8865-7de0647c4c08' },
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
    assert.equal(body.includes(serviceKeyMarker), false);
    assert.equal(body.includes('serviceRoleKey'), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('errores de PostgreSQL y Auth no filtran configuración en logs ni respuestas', async () => {
  const marker = 'CONFIGURATION_SECRET_MARKER_DO_NOT_LEAK';
  const app = createApp({
    aforoRepository: {
      async obtenerAforoActual() {
        throw new Error(marker);
      },
    },
    identidadRepository: {},
    supabaseAuth: {
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
