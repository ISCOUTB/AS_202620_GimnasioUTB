/**
 * Pruebas de las mitigaciones de S13 (docs/s13-seguridad-amenazas.md, ADR-0007).
 * Cada prueba indica la mitigación (M#) que verifica.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const { parsearOrigenes } = require('../src/shared/http/seguridad');

const TOKEN = 'token-de-prueba-de-al-menos-32-caracteres-xx';
const ORIGEN_PERMITIDO = 'http://localhost:8080';

async function withServer(opciones, fn) {
  const app = createApp(opciones);
  const server = app.listen(0);
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

function registrar(baseUrl, headers = {}) {
  return fetch(`${baseUrl}/api/v1/aforo/acceso`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ tipoAcceso: 'ENTRADA' }),
  });
}

test('M1: sin token, con token incorrecto o con otro esquema el POST responde 401 y el aforo no cambia', async () => {
  await withServer({ operadorToken: TOKEN }, async (baseUrl) => {
    const intentos = [
      {},
      { Authorization: 'Bearer token-equivocado' },
      { Authorization: `Basic ${TOKEN}` },
      { Authorization: 'Bearer ' },
    ];
    for (const headers of intentos) {
      const res = await registrar(baseUrl, headers);
      assert.equal(res.status, 401, `cabeceras: ${JSON.stringify(headers)}`);
      assert.match(res.headers.get('www-authenticate'), /^Bearer/);
    }

    const consulta = await (await fetch(`${baseUrl}/api/v1/aforo`)).json();
    assert.equal(consulta.data.aforoActual, 0);
  });
});

test('M1: con el token correcto el POST registra (201)', async () => {
  await withServer({ operadorToken: TOKEN }, async (baseUrl) => {
    const res = await registrar(baseUrl, { Authorization: `Bearer ${TOKEN}` });
    assert.equal(res.status, 201);
  });
});

test('M1: falla cerrado si OPERADOR_TOKEN falta o es más corto de 32 caracteres', async () => {
  for (const operadorToken of [undefined, '', 'corto']) {
    await withServer({ operadorToken }, async (baseUrl) => {
      const res = await registrar(baseUrl, { Authorization: `Bearer ${operadorToken}` });
      assert.equal(res.status, 503);
    });
  }
});

test('M1: las lecturas siguen siendo públicas', async () => {
  await withServer({ operadorToken: TOKEN }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/v1/aforo`);
    assert.equal(res.status, 200);
  });
});

test('M2: CORS solo responde a orígenes de la lista blanca', async () => {
  await withServer({ operadorToken: TOKEN, origenesCors: [ORIGEN_PERMITIDO] }, async (baseUrl) => {
    const permitido = await fetch(`${baseUrl}/api/v1/aforo`, { headers: { Origin: ORIGEN_PERMITIDO } });
    assert.equal(permitido.headers.get('access-control-allow-origin'), ORIGEN_PERMITIDO);
    assert.match(permitido.headers.get('vary'), /Origin/);

    const ajeno = await fetch(`${baseUrl}/api/v1/aforo`, { headers: { Origin: 'https://atacante.example' } });
    assert.equal(ajeno.headers.get('access-control-allow-origin'), null);

    const preflight = await fetch(`${baseUrl}/api/v1/aforo/acceso`, {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGEN_PERMITIDO,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
  });
});

test('M2: parsearOrigenes limpia espacios, vacíos y barras finales', () => {
  assert.deepEqual(
    parsearOrigenes(' http://localhost:8080/ , ,https://app.example'),
    ['http://localhost:8080', 'https://app.example']
  );
  assert.deepEqual(parsearOrigenes(undefined), []);
});

test('M5: cabeceras defensivas presentes y X-Powered-By oculto', async () => {
  await withServer({ operadorToken: TOKEN }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});
