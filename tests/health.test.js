const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');

test('GET /health responde 200 con status ok', async () => {
  const app = createApp();
  const server = app.listen(0); // puerto aleatorio libre
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.status, 'ok');
  } finally {
    server.close();
  }
});

