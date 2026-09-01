const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');

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
