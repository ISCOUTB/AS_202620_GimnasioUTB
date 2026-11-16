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
  QrNoValidoError,
  CuentaEstudianteInactivaError,
} = require('../../src/modules/identidad/infrastructure/persistence/identidad-postgres.adapter');

const databaseUrl = process.env.DATABASE_URL;
const AUTH_USER_ID = 'e52fef92-e63f-4f66-8865-7de0647c4c08';
const AUTH_USER_ID_INACTIVO = 'e52fef92-e63f-4f66-8865-7de0647c4c09';

test('PostgreSQL: perfil vinculado a Supabase Auth y consumo transaccional de QR', {
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
      `INSERT INTO estudiantes (
         auth_user_id, codigo_estudiante, correo, cedula_sintetica, nombre, activa
       )
       VALUES
         ($1, 'demo-001', 'demo-001@utb.edu.co', '1000000001', 'Estudiante de prueba', TRUE),
         ($2, 'demo-002', 'demo-002@utb.edu.co', '1000000002', 'Estudiante inactivo', FALSE)`,
      [AUTH_USER_ID, AUTH_USER_ID_INACTIVO]
    );

    const estudiante = await identity.obtenerEstudiantePorAuthId(AUTH_USER_ID);
    assert.equal(estudiante.codigo_estudiante, 'demo-001');
    assert.equal(estudiante.activa, true);

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

    const qrInactivo = await identity.emitirQr('demo-002');
    await assert.rejects(registrarQr(qrInactivo.token), CuentaEstudianteInactivaError);

    await adapter.pool.query(
      `INSERT INTO estudiante_estado_acceso (codigo_estudiante, dentro)
       VALUES ('demo-002', TRUE)`
    );
    await adapter.pool.query('UPDATE aforo_estado SET aforo_actual = 1 WHERE id = 1');
    assert.deepEqual(await registrarQr(qrInactivo.token), {
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
