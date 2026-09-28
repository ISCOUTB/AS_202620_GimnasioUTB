const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const { createLogger } = require('../src/shared/logger');

test('logger emite registros JSON con nivel, evento y mensaje', () => {
  const output = [];
  const logger = createLogger((line) => output.push(line));

  logger.info('test.event', 'Structured log message');

  const record = JSON.parse(output[0]);
  assert.strictEqual(record.level, 'info');
  assert.strictEqual(record.event, 'test.event');
  assert.strictEqual(record.message, 'Structured log message');
  assert.ok(Number.isFinite(Date.parse(record.timestamp)));
});

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

test('GET /ready responde 200 cuando el repositorio está disponible', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/ready`);
    const body = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.status, 'ok');
  } finally {
    server.close();
  }
});

test('GET /ready responde 503 sin alterar liveness cuando falla el repositorio', async () => {
  const app = createApp({
    aforoRepository: {
      obtenerAforoActual: async () => {
        throw new Error('base de datos no disponible');
      },
      actualizarAforo: async () => 0,
    },
  });
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
    const readyResponse = await fetch(`http://127.0.0.1:${port}/ready`);
    const body = await readyResponse.json();

    assert.strictEqual(healthResponse.status, 200);
    assert.strictEqual(readyResponse.status, 503);
    assert.strictEqual(body.status, 'error');
  } finally {
    server.close();
  }
});

