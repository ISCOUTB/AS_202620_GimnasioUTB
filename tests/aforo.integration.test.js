const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const { logger } = require('../src/shared/logger');

// Token de prueba (ADR-0007): las escrituras exigen Authorization: Bearer.
const TOKEN = 'token-de-prueba-de-al-menos-32-caracteres-xx';
const HEADERS = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

async function withServer(fn) {
  const app = createApp({ operadorToken: TOKEN });
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
      headers: HEADERS,
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
      headers: HEADERS,
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
        headers: HEADERS,
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
  const app = createApp({ operadorToken: TOKEN });
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
      headers: HEADERS,
      body: JSON.stringify({ tipoAcceso: 'ENTRADA' }),
    });
    assert.strictEqual(successfulResponse.status, 201);

    const successfulExitResponse = await fetch(`${baseUrl}/api/v1/aforo/acceso`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ tipoAcceso: 'SALIDA' }),
    });
    assert.strictEqual(successfulExitResponse.status, 201);

    const rejectedResponse = await fetch(`${baseUrl}/api/v1/aforo/acceso`, {
      method: 'POST',
      headers: HEADERS,
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

// --- Estado del gimnasio, capacidad y confirmación (ADR-0012) ---
async function enviar(baseUrl, metodo, ruta, body, headers = HEADERS) {
  const res = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('GET /api/v1/aforo entrega estado, capacidad y porcentaje de ocupación', async () => {
  await withServer(async (baseUrl) => {
    await enviar(baseUrl, 'POST', '/api/v1/aforo/acceso', { tipoAcceso: 'ENTRADA' });
    const { status, body } = await enviar(baseUrl, 'GET', '/api/v1/aforo', undefined, {});
    assert.equal(status, 200);
    assert.deepEqual(body.data, {
      aforoActual: 1,
      capacidadMaxima: 30,
      abierto: true,
      motivoCierre: null,
      porcentajeOcupacion: 3,
    });
  });
});

test('el encargado cierra con motivo: se bloquean las entradas, no las salidas, y al abrir se reanudan', async () => {
  await withServer(async (baseUrl) => {
    await enviar(baseUrl, 'POST', '/api/v1/aforo/acceso', { tipoAcceso: 'ENTRADA' });

    const cierre = await enviar(baseUrl, 'PUT', '/api/v1/aforo/estado', {
      abierto: false, motivoCierre: 'Mantenimiento de máquinas',
    });
    assert.equal(cierre.status, 200);
    assert.equal(cierre.body.data.abierto, false);
    assert.equal(cierre.body.data.motivoCierre, 'Mantenimiento de máquinas');
    assert.equal(cierre.body.data.aforoActual, 1, 'cerrar no saca a nadie');

    const entrada = await enviar(baseUrl, 'POST', '/api/v1/aforo/acceso', { tipoAcceso: 'ENTRADA' });
    assert.equal(entrada.status, 409);
    assert.equal(entrada.body.code, 'GIMNASIO_CERRADO');
    assert.match(entrada.body.message, /Mantenimiento de máquinas/);

    const salida = await enviar(baseUrl, 'POST', '/api/v1/aforo/acceso', { tipoAcceso: 'SALIDA' });
    assert.equal(salida.status, 201);
    assert.equal(salida.body.data.aforoActual, 0);

    const apertura = await enviar(baseUrl, 'PUT', '/api/v1/aforo/estado', { abierto: true });
    assert.equal(apertura.body.data.motivoCierre, null);
    const otra = await enviar(baseUrl, 'POST', '/api/v1/aforo/acceso', { tipoAcceso: 'ENTRADA' });
    assert.equal(otra.status, 201);
  });
});

test('superar la capacidad pide confirmación (409) y con ella registra el ingreso', async () => {
  await withServer(async (baseUrl) => {
    const capacidad = await enviar(baseUrl, 'PUT', '/api/v1/aforo/capacidad', { capacidadMaxima: 1 });
    assert.equal(capacidad.status, 200);
    assert.equal(capacidad.body.data.capacidadMaxima, 1);

    await enviar(baseUrl, 'POST', '/api/v1/aforo/acceso', { tipoAcceso: 'ENTRADA' });
    const sinConfirmar = await enviar(baseUrl, 'POST', '/api/v1/aforo/acceso', { tipoAcceso: 'ENTRADA' });
    assert.equal(sinConfirmar.status, 409);
    assert.equal(sinConfirmar.body.code, 'CAPACIDAD_SUPERADA');
    assert.deepEqual(sinConfirmar.body.data, { aforoActual: 1, capacidadMaxima: 1 });

    const confirmado = await enviar(baseUrl, 'POST', '/api/v1/aforo/acceso', {
      tipoAcceso: 'ENTRADA', confirmarExcesoCapacidad: true,
    });
    assert.equal(confirmado.status, 201);
    assert.equal(confirmado.body.data.aforoActual, 2);

    const { body } = await enviar(baseUrl, 'GET', '/api/v1/aforo', undefined, {});
    assert.equal(body.data.porcentajeOcupacion, 200);
  });
});

test('configurar el gimnasio exige la contraseña de encargado y valida los datos', async () => {
  await withServer(async (baseUrl) => {
    const sinToken = { 'Content-Type': 'application/json' };
    assert.equal((await enviar(baseUrl, 'PUT', '/api/v1/aforo/estado', { abierto: false }, sinToken)).status, 401);
    assert.equal((await enviar(baseUrl, 'PUT', '/api/v1/aforo/capacidad', { capacidadMaxima: 9 }, sinToken)).status, 401);
    assert.equal((await enviar(baseUrl, 'PUT', '/api/v1/aforo/capacidad', { capacidadMaxima: 0 })).status, 400);
    assert.equal((await enviar(baseUrl, 'PUT', '/api/v1/aforo/estado', {})).status, 400);
    const confirmacionInvalida = await enviar(baseUrl, 'POST', '/api/v1/aforo/acceso', {
      tipoAcceso: 'ENTRADA', confirmarExcesoCapacidad: 'si',
    });
    assert.equal(confirmacionInvalida.status, 400);

    const verificacion = await enviar(baseUrl, 'POST', '/api/v1/operador/verificacion', {});
    assert.equal(verificacion.status, 200);
    assert.equal((await enviar(baseUrl, 'POST', '/api/v1/operador/verificacion', {}, sinToken)).status, 401);
  });
});
