const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const {
  PreferenciasAlertaInvalidasError,
  estaEnPeriodoPermitido,
  validarPreferenciasAlerta,
} = require('../src/modules/notificaciones/domain/alerta-aforo');

const preferencias = {
  habilitada: true,
  umbral: 10,
  dias: [1, 2, 3, 4, 5],
  horaInicio: 480,
  horaFin: 1080,
};

test('el horario usa el día y la hora de America/Bogota, con inicio incluido y fin excluido', () => {
  assert.equal(
    estaEnPeriodoPermitido(preferencias, new Date('2026-11-23T13:00:00.000Z')),
    true
  );
  assert.equal(
    estaEnPeriodoPermitido(preferencias, new Date('2026-11-23T23:00:00.000Z')),
    false
  );
  assert.equal(
    estaEnPeriodoPermitido(preferencias, new Date('2026-11-24T00:00:00.000Z')),
    false,
    'el lunes a las 19:00 de Bogotá está fuera del rango'
  );
});

test('un horario nocturno pertenece al día en que inicia', () => {
  assert.equal(
    estaEnPeriodoPermitido(
      { dias: [1], horaInicio: 22 * 60, horaFin: 2 * 60 },
      new Date('2026-11-24T05:00:00.000Z')
    ),
    true
  );
});

test('valida umbrales, días y horarios sin cambiar preferencias al bajar capacidad', () => {
  validarPreferenciasAlerta(preferencias, 10);
  assert.throws(
    () => validarPreferenciasAlerta({ ...preferencias, umbral: 11 }, 10),
    PreferenciasAlertaInvalidasError
  );
  assert.throws(
    () => validarPreferenciasAlerta({ ...preferencias, dias: [] }, 10),
    PreferenciasAlertaInvalidasError
  );
  assert.throws(
    () => validarPreferenciasAlerta({ ...preferencias, dias: [1, 1] }, 10),
    PreferenciasAlertaInvalidasError
  );
  assert.doesNotThrow(() => validarPreferenciasAlerta({
    ...preferencias,
    habilitada: false,
    umbral: 11,
  }, 10));
});

test('la bandeja y las preferencias exigen sesión de estudiante y usan su identidad', async () => {
  const guardadas = [];
  const notificationRepository = {
    async obtenerPreferencias(codigoEstudiante) {
      return {
        preferencias: null,
        capacidadMaxima: codigoEstudiante === 'estudiante-1' ? 30 : 0,
      };
    },
    async guardarPreferencias(codigoEstudiante, data) {
      guardadas.push({ codigoEstudiante, data });
      return { preferencias: { ...data, compatible: true }, capacidadMaxima: 30 };
    },
    async listarNotificaciones(codigoEstudiante) {
      return [{ id: 1, codigoEstudiante }];
    },
  };
  const app = createApp({
    identidadRepository: {
      async obtenerEstudiantePorCodigo(codigoEstudiante) {
        return { codigo_estudiante: codigoEstudiante };
      },
    },
    autenticacion: {
      async obtenerUsuario(token) {
        return token === 'sesion-valida' ? { id: 'estudiante-1' } : null;
      },
    },
    notificacionesRepository: notificationRepository,
  });
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const noAutenticado = await fetch(`${baseUrl}/api/v1/notificaciones`);
    assert.equal(noAutenticado.status, 401);

    const headers = {
      Authorization: 'Bearer sesion-valida',
      'Content-Type': 'application/json',
    };
    const preferenciasResponse = await fetch(
      `${baseUrl}/api/v1/notificaciones/preferencias`,
      { headers }
    );
    assert.equal(preferenciasResponse.status, 200);
    assert.equal((await preferenciasResponse.json()).data.capacidadMaxima, 30);

    const aviso = { ...preferencias, umbral: 8 };
    const guardarResponse = await fetch(
      `${baseUrl}/api/v1/notificaciones/preferencias`,
      { method: 'PUT', headers, body: JSON.stringify(aviso) }
    );
    assert.equal(guardarResponse.status, 200);
    assert.equal(guardadas[0].codigoEstudiante, 'estudiante-1');
    assert.equal(guardadas[0].data.umbral, 8);

    const listaResponse = await fetch(`${baseUrl}/api/v1/notificaciones`, { headers });
    assert.equal(listaResponse.status, 200);
    assert.equal((await listaResponse.json()).data.notificaciones[0].codigoEstudiante, 'estudiante-1');
  } finally {
    server.close();
  }
});
