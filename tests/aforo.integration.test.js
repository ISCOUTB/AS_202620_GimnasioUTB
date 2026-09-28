const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const { logger } = require('../src/shared/logger');

async function withServer(fn) {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test('corte vertical: registrar una entrada sube el aforo y se refleja en la consulta', async () => {
  await withServer(async (baseUrl) => {
    const postRes = await fetch(`${baseUrl}/api/v1/aforo/acceso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estudianteId: 'T00012345', tipoAcceso: 'ENTRADA' }),
    });
    const postBody = await postRes.json();

    assert.strictEqual(postRes.status, 201);
    assert.strictEqual(postBody.data.aforoActual, 1);

    const getRes = await fetch(`${baseUrl}/api/v1/aforo`);
    const getBody = await getRes.json();

    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getBody.data.aforoActual, 1);
  });
});

test('corte vertical: una salida sin aforo previo responde 400 (regla de dominio respetada de punta a punta)', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/v1/aforo/acceso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estudianteId: 'T00012345', tipoAcceso: 'SALIDA' }),
    });
    const body = await res.json();

    assert.strictEqual(res.status, 400);
    assert.strictEqual(body.status, 'error');
  });
});

test('GET /metrics cuenta entradas y salidas procesadas', async () => {
  await withServer(async (baseUrl) => {
    for (const tipoAcceso of ['ENTRADA', 'SALIDA']) {
      const response = await fetch(`${baseUrl}/api/v1/aforo/acceso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipoAcceso }),
      });
      assert.strictEqual(response.status, 201);
    }

    const response = await fetch(`${baseUrl}/metrics`);
    const body = await response.json();

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(body, {
      access_operations_total: { entrada: 1, salida: 1, total: 2 },
    });
  });
});

test('fallos del logger no alteran el resultado HTTP ni ocultan errores del acceso', async () => {
  const originalInfo = logger.info;
  const originalWarn = logger.warn;
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  logger.info = () => {
    throw new Error('fallo del logger info');
  };
  logger.warn = () => {
    throw new Error('fallo del logger warn');
  };

  try {
    const successfulResponse = await fetch(`${baseUrl}/api/v1/aforo/acceso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipoAcceso: 'ENTRADA' }),
    });
    assert.strictEqual(successfulResponse.status, 201);

    const successfulExitResponse = await fetch(`${baseUrl}/api/v1/aforo/acceso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipoAcceso: 'SALIDA' }),
    });
    assert.strictEqual(successfulExitResponse.status, 201);

    const rejectedResponse = await fetch(`${baseUrl}/api/v1/aforo/acceso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipoAcceso: 'SALIDA' }),
    });
    const rejectedBody = await rejectedResponse.json();
    assert.strictEqual(rejectedResponse.status, 400);
    assert.match(rejectedBody.message, /aforo ya está en 0/i);

    const metricsResponse = await fetch(`${baseUrl}/metrics`);
    const metricsBody = await metricsResponse.json();
    assert.deepStrictEqual(metricsBody, {
      access_operations_total: { entrada: 1, salida: 1, total: 2 },
    });
  } finally {
    logger.info = originalInfo;
    logger.warn = originalWarn;
    server.close();
  }
});
