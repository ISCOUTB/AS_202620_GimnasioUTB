const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { aplicarAcceso } = require('../../src/modules/aforo/domain/aforo');
const { crearRegistrarAccesoQrUseCase } = require('../../src/modules/aforo/application/registrar-acceso-qr.usecase');
const { AforoPostgresAdapter } = require('../../src/modules/aforo/infrastructure/persistence/aforo-postgres.adapter');
const {
  IdentidadPostgresAdapter,
  crearHashContrasena,
  CredencialesInvalidasError,
  QrNoValidoError,
} = require('../../src/modules/identidad/infrastructure/persistence/identidad-postgres.adapter');

const databaseUrl = process.env.DATABASE_URL;

test('PostgreSQL: sesión sintética y consumo transaccional de QR', {
  skip: !databaseUrl,
}, async () => {
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  assert.match(databaseName, /test/i, 'DATABASE_URL debe apuntar a una base de pruebas');

  const schema = `identidad_test_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  let adapter;
  let schemaCreated = false;
  try {
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    adapter = new AforoPostgresAdapter({ connectionString: databaseUrl, schema });
    const schemaSql = await fs.readFile(
      path.join(__dirname, '../../src/modules/aforo/infrastructure/persistence/schema.sql'),
      'utf8'
    );
    await adapter.pool.query(schemaSql);
    const identity = new IdentidadPostgresAdapter({ pool: adapter.pool });
    await adapter.pool.query(
      `INSERT INTO estudiantes (codigo_estudiante, nombre, password_hash)
       VALUES ($1, $2, $3)`,
      ['demo-001', 'Estudiante de prueba', await crearHashContrasena('clave-de-prueba')]
    );

    const session = await identity.iniciarSesion('demo-001', 'clave-de-prueba');
    assert.equal((await identity.obtenerEstudianteDeSesion(session.token)).nombre, 'Estudiante de prueba');
    await assert.rejects(
      identity.iniciarSesion('demo-001', 'incorrecta'),
      CredencialesInvalidasError
    );

    const registrarQr = crearRegistrarAccesoQrUseCase(
      adapter,
      (client, token) => identity.consumirQr(client, token)
    );
    const primerQr = await identity.emitirQr('demo-001');
    assert.deepEqual(await registrarQr(primerQr.token), {
      tipoAcceso: 'ENTRADA',
      aforoActual: 1,
    });
    await assert.rejects(registrarQr(primerQr.token), QrNoValidoError);

    const segundoQr = await identity.emitirQr('demo-001');
    await adapter.pool.query('UPDATE aforo_estado SET aforo_actual = 0 WHERE id = 1');
    await assert.rejects(registrarQr(segundoQr.token), /aforo ya está en 0/i);
    assert.equal(await adapter.obtenerAforoActual(), 0);

    await adapter.pool.query('UPDATE aforo_estado SET aforo_actual = 1 WHERE id = 1');
    assert.deepEqual(await registrarQr(segundoQr.token), {
      tipoAcceso: 'SALIDA',
      aforoActual: 0,
    });
  } finally {
    try {
      if (adapter) await adapter.cerrar();
    } finally {
      try {
        if (schemaCreated) await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await adminPool.end();
      }
    }
  }
});
