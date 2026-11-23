const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { crearOpcionesPoolPostgres } = require('../../src/shared/postgres-pool');
const { AforoPostgresAdapter } = require('../../src/modules/aforo/infrastructure/persistence/aforo-postgres.adapter');
const { NotificacionesPostgresAdapter } = require('../../src/modules/notificaciones/infrastructure/persistence/notificaciones-postgres.adapter');
const { crearEvaluadorAlertasAforo } = require('../../src/modules/notificaciones/application/evaluar-alertas-aforo.usecase');

const databaseUrl = process.env.DATABASE_URL;
const HORARIO_HABIL = new Date('2026-11-23T15:00:00.000Z');
const HORARIO_NO_HABIL = new Date('2026-11-24T02:00:00.000Z');

test('PostgreSQL: alertas individuales, períodos, capacidad, episodios y concurrencia', {
  skip: !databaseUrl,
}, async () => {
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  assert.match(databaseName, /test/i, 'DATABASE_URL debe apuntar a una base de pruebas');

  const schema = `notificaciones_test_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new Pool(crearOpcionesPoolPostgres(databaseUrl));
  let aforo;
  let schemaCreated = false;
  try {
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    aforo = new AforoPostgresAdapter({ connectionString: databaseUrl, schema });
    const schemaSql = await fs.readFile(
      path.join(__dirname, '../../src/modules/aforo/infrastructure/persistence/schema.sql'),
      'utf8'
    );
    await aforo.pool.query(schemaSql);
    const notifications = new NotificacionesPostgresAdapter({ pool: aforo.pool });
    let ahora = HORARIO_HABIL;
    const evaluator = crearEvaluadorAlertasAforo({
      repository: notifications,
      now: () => ahora,
    });

    for (const codigoEstudiante of [
      'umbral-igual',
      'umbral-mayor',
      'fuera-horario',
      'capacidad',
      'guardar-inmediato',
    ]) {
      await aforo.pool.query(
        'INSERT INTO estudiantes (codigo_estudiante, nombre) VALUES ($1, $1)',
        [codigoEstudiante]
      );
    }

    const configurarPreferencia = (codigoEstudiante, umbral) =>
      notifications.guardarPreferencias(codigoEstudiante, {
        habilitada: true,
        umbral,
        dias: [1, 2, 3, 4, 5],
        horaInicio: 480,
        horaFin: 1080,
      });

    await configurarPreferencia('umbral-igual', 5);
    await configurarPreferencia('umbral-mayor', 6);

    await aforo.pool.query('UPDATE aforo_estado SET aforo_actual = 5 WHERE id = 1');
    await evaluator.evaluarAhora();
    let filas = await aforo.pool.query(
      `SELECT codigo_estudiante, COUNT(*)::INTEGER AS total
       FROM notificaciones GROUP BY codigo_estudiante`
    );
    assert.deepEqual(filas.rows.map((row) => [row.codigo_estudiante, row.total]), [
      ['umbral-mayor', 1],
    ]);

    await evaluator.evaluarAhora();
    filas = await aforo.pool.query(
      `SELECT COUNT(*)::INTEGER AS total FROM notificaciones
       WHERE codigo_estudiante = 'umbral-mayor'`
    );
    assert.equal(filas.rows[0].total, 1, 'no repite mientras siga bajo el umbral');

    await aforo.actualizarAforo(
      (aforoActual) => aforoActual + 1,
      evaluator.alCambiarAforo
    );
    await aforo.actualizarAforo(
      (aforoActual) => aforoActual - 2,
      evaluator.alCambiarAforo
    );
    await Promise.all([evaluator.evaluarAhora(), evaluator.evaluarAhora()]);
    filas = await aforo.pool.query(
      `SELECT COUNT(*)::INTEGER AS total FROM notificaciones
       WHERE codigo_estudiante = 'umbral-mayor'`
    );
    assert.equal(filas.rows[0].total, 2, 'se reactiva después de volver al umbral');

    await notifications.guardarPreferencias('guardar-inmediato', {
      habilitada: true,
      umbral: 9,
      dias: [1, 2, 3, 4, 5],
      horaInicio: 480,
      horaFin: 1080,
    }, async (client, estado) => evaluator.alCambiarAforo(client, estado.aforo_actual, {
      aforoActual: estado.aforo_actual,
      capacidadMaxima: estado.capacidad_maxima,
      abierto: estado.abierto,
      motivoCierre: estado.motivo_cierre,
    }));
    filas = await aforo.pool.query(
      `SELECT COUNT(*)::INTEGER AS total FROM notificaciones
       WHERE codigo_estudiante = 'guardar-inmediato'`
    );
    assert.equal(filas.rows[0].total, 1, 'evalúa de inmediato una preferencia guardada');

    await notifications.guardarPreferencias('fuera-horario', {
      habilitada: true,
      umbral: 8,
      dias: [1, 2, 3, 4, 5],
      horaInicio: 600,
      horaFin: 1080,
    });
    await notifications.guardarPreferencias('capacidad', {
      habilitada: true,
      umbral: 6,
      dias: [1, 2, 3, 4, 5],
      horaInicio: 720,
      horaFin: 1080,
    });
    ahora = HORARIO_NO_HABIL;
    await evaluator.evaluarAhora();
    filas = await aforo.pool.query(
      `SELECT COUNT(*)::INTEGER AS total FROM notificaciones
       WHERE codigo_estudiante = 'fuera-horario'`
    );
    assert.equal(filas.rows[0].total, 0, 'no envía fuera del período permitido');

    ahora = HORARIO_HABIL;
    await evaluator.evaluarAhora();
    filas = await aforo.pool.query(
      `SELECT COUNT(*)::INTEGER AS total FROM notificaciones
       WHERE codigo_estudiante = 'fuera-horario'`
    );
    assert.equal(filas.rows[0].total, 1, 'revalida la condición actual en el siguiente período');

    ahora = new Date('2026-11-23T19:00:00.000Z');
    await aforo.modificarEstado(
      (estado) => ({ capacidadMaxima: 5 }),
      async (client, estado) =>
        evaluator.alCambiarAforo(client, estado.aforoActual, estado)
    );
    const preferenciaIncompatible = await notifications.obtenerPreferencias('capacidad');
    assert.equal(preferenciaIncompatible.preferencias.umbral, 6);
    assert.equal(preferenciaIncompatible.preferencias.compatible, false);
    filas = await aforo.pool.query(
      `SELECT COUNT(*)::INTEGER AS total FROM notificaciones
       WHERE codigo_estudiante = 'capacidad'`
    );
    assert.equal(filas.rows[0].total, 0, 'pausa sin reescribir preferencias');

    await aforo.modificarEstado(
      () => ({ capacidadMaxima: 10 }),
      async (client, estado) =>
        evaluator.alCambiarAforo(client, estado.aforoActual, estado)
    );
    filas = await aforo.pool.query(
      `SELECT COUNT(*)::INTEGER AS total FROM notificaciones
       WHERE codigo_estudiante = 'capacidad'`
    );
    assert.equal(filas.rows[0].total, 1, 'se reanuda al volver a ser compatible');
  } finally {
    if (aforo) await aforo.cerrar();
    if (schemaCreated) await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await adminPool.end();
  }
});
