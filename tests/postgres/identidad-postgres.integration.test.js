const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { crearOpcionesPoolPostgres } = require('../../src/shared/postgres-pool');
const {
  aplicarAcceso,
  GimnasioCerradoError,
  CapacidadSuperadaError,
} = require('../../src/modules/aforo/domain/aforo');
const { crearRegistrarAccesoQrUseCase } = require('../../src/modules/aforo/application/registrar-acceso-qr.usecase');
const { crearRegistrarAccesoEstudianteUseCase } = require('../../src/modules/aforo/application/registrar-acceso-estudiante.usecase');
const { AforoPostgresAdapter } = require('../../src/modules/aforo/infrastructure/persistence/aforo-postgres.adapter');
const {
  IdentidadPostgresAdapter,
  QrNoValidoError,
  CuentaEstudianteInactivaError,
  EstudianteNoEncontradoError,
} = require('../../src/modules/identidad/infrastructure/persistence/identidad-postgres.adapter');

const { AutenticacionLocalAdapter } = require('../../src/modules/identidad/infrastructure/auth/autenticacion-local.adapter');
const { crearHashContrasena } = require('../../src/modules/identidad/infrastructure/auth/contrasena');
const { CredencialesInvalidasError } = require('../../src/modules/identidad/application/identidad.errors');

const databaseUrl = process.env.DATABASE_URL;

test('PostgreSQL: login propio y consumo transaccional de QR', {
  skip: !databaseUrl,
}, async () => {
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  assert.match(databaseName, /test/i, 'DATABASE_URL debe apuntar a una base de pruebas');

  const schema = `identidad_test_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new Pool(crearOpcionesPoolPostgres(databaseUrl));
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
    const hash = await crearHashContrasena('clave-de-prueba-123');
    await adapter.pool.query(
      `INSERT INTO estudiantes (
         codigo_estudiante, correo, cedula_sintetica, nombre, password_hash, activa
       )
       VALUES
         ('demo-001', 'demo-001@utb.edu.co', '1000000001', 'Estudiante de prueba', $1, TRUE),
         ('demo-002', 'demo-002@utb.edu.co', '1000000002', 'Estudiante inactivo', $1, FALSE)`,
      [hash]
    );

    const autenticacion = new AutenticacionLocalAdapter({ pool: adapter.pool });
    const sesion = await autenticacion.iniciarSesion('DEMO-001@utb.edu.co', 'clave-de-prueba-123');
    assert.deepEqual(await autenticacion.obtenerUsuario(sesion.token), { id: 'demo-001' });
    assert.equal(await autenticacion.obtenerUsuario('token-inventado'), null);
    await assert.rejects(
      autenticacion.iniciarSesion('demo-001@utb.edu.co', 'clave-incorrecta'),
      CredencialesInvalidasError
    );
    await assert.rejects(
      autenticacion.iniciarSesion('demo-002@utb.edu.co', 'clave-de-prueba-123'),
      CredencialesInvalidasError
    );

    const estudiante = await identity.obtenerEstudiantePorCodigo('demo-001');
    assert.equal(estudiante.codigo_estudiante, 'demo-001');
    assert.equal(estudiante.activa, true);

    const registrarQr = crearRegistrarAccesoQrUseCase(
      adapter,
      (client, token) => identity.consumirQr(client, token)
    );
    const primerQr = await identity.emitirQr('demo-001');
    const demo1 = { codigoEstudiante: 'demo-001', nombre: 'Estudiante de prueba' };
    const demo2 = { codigoEstudiante: 'demo-002', nombre: 'Estudiante inactivo' };
    assert.deepEqual(await registrarQr(primerQr.token), {
      tipoAcceso: 'ENTRADA',
      aforoActual: 1,
      estudiante: demo1,
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
      estudiante: demo1,
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
      estudiante: demo2,
    });

    // --- ADR-0012: estado, capacidad y registro por cédula contra PostgreSQL real ---
    assert.deepEqual(await adapter.obtenerEstado(), {
      aforoActual: 0, capacidadMaxima: 30, abierto: true, motivoCierre: null,
    });
    const registrarCedula = crearRegistrarAccesoEstudianteUseCase(
      adapter,
      (client, cedula) => identity.registrarPorCedula(client, cedula)
    );
    assert.deepEqual(await identity.buscarPorCedula('1000000001'), {
      codigoEstudiante: 'demo-001', nombre: 'Estudiante de prueba', activa: true, dentro: false,
    });
    assert.equal(await identity.buscarPorCedula('99999'), null);
    await assert.rejects(registrarCedula('99999'), EstudianteNoEncontradoError);
    assert.deepEqual(await registrarCedula('1000000001'), {
      tipoAcceso: 'ENTRADA', aforoActual: 1, estudiante: demo1,
    });

    // Cerrado: el QR de un estudiante que está fuera se rechaza y NO se gasta.
    await adapter.modificarEstado(() => ({ abierto: false, motivoCierre: 'Fumigación' }));
    await adapter.pool.query(
      "UPDATE estudiantes SET activa = TRUE WHERE codigo_estudiante = 'demo-002'"
    );
    const qrCerrado = await identity.emitirQr('demo-002');
    await assert.rejects(registrarQr(qrCerrado.token), GimnasioCerradoError);
    assert.equal((await identity.buscarPorCedula('1000000002')).dentro, false);
    // Quien ya estaba dentro sale aunque el gimnasio esté cerrado.
    assert.equal((await registrarCedula('1000000001')).tipoAcceso, 'SALIDA');

    // Capacidad superada sin confirmar: se rechaza y el mismo QR sirve al confirmar.
    await adapter.modificarEstado(() => ({ abierto: true, motivoCierre: null, capacidadMaxima: 1 }));
    await registrarCedula('1000000001');
    await assert.rejects(registrarQr(qrCerrado.token), CapacidadSuperadaError);
    assert.deepEqual(await registrarQr(qrCerrado.token, { confirmarExcesoCapacidad: true }), {
      tipoAcceso: 'ENTRADA', aforoActual: 2, estudiante: demo2,
    });
    await assert.rejects(
      adapter.pool.query("UPDATE aforo_estado SET motivo_cierre = 'x' WHERE id = 1"),
      /aforo_estado_motivo_solo_cerrado_check/
    );
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
