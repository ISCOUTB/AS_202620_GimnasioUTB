/**
 * Prueba de contrato (lado proveedor): el API Backend real debe cumplir
 * lo que promete docs/openapi.yaml. Si alguien renombra un campo, cambia un
 * código HTTP o agrega un campo sin actualizar el contrato, esta prueba falla.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const Ajv2020 = require('ajv/dist/2020');
const { createApp } = require('../src/server');
const { AforoPostgresAdapter } = require('../src/modules/aforo/infrastructure/persistence/aforo-postgres.adapter');
const {
  CredencialesInvalidasError,
  QrNoValidoError,
  CuentaEstudianteInactivaError,
  EstudianteNoEncontradoError,
} = require('../src/modules/identidad/application/identidad.errors');
const {
  PreferenciasAlertaInvalidasError,
} = require('../src/modules/notificaciones/domain/alerta-aforo');

const TOKEN = 'token-de-prueba-de-al-menos-32-caracteres-xx';
const SPEC_ID = 'https://gimnasio-utb.local/openapi.json';
const spec = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8'));

const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ ...spec, $id: SPEC_ID });

// Puntero JSON al esquema de una operación dentro del contrato
const escapar = (s) => s.replace(/~/g, '~0').replace(/\//g, '~1');
function validadorRespuesta(ruta, metodo, status) {
  const respuesta = spec.paths[ruta]?.[metodo]?.responses?.[String(status)];
  assert.ok(respuesta, `El contrato no documenta ${metodo.toUpperCase()} ${ruta} -> ${status}`);
  const ptr = `/paths/${escapar(ruta)}/${metodo}/responses/${status}/content/application~1json/schema`;
  return ajv.getSchema(`${SPEC_ID}#${ptr}`);
}
function validadorSolicitud(ruta, metodo) {
  const ptr = `/paths/${escapar(ruta)}/${metodo}/requestBody/content/application~1json/schema`;
  return ajv.getSchema(`${SPEC_ID}#${ptr}`);
}

async function withServer(
  fn,
  aforoRepository,
  operadorToken = TOKEN,
  identidadRepository,
  autenticacion,
  notificacionesRepository
) {
  const app = createApp({
    aforoRepository,
    operadorToken,
    identidadRepository,
    autenticacion,
    notificacionesRepository,
  });
  const server = app.listen(0);
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

// Cada caso representa una combinación método/ruta/status documentada.
const casos = [
  { nombre: 'GET / -> 200', metodo: 'get', ruta: '/', status: 200 },
  { nombre: 'GET /health -> 200', metodo: 'get', ruta: '/health', status: 200 },
  { nombre: 'GET /ready -> 200', metodo: 'get', ruta: '/ready', status: 200 },
  {
    nombre: 'GET /ready -> 503', metodo: 'get', ruta: '/ready', status: 503,
    aforoRepository: {
      obtenerAforoActual: async () => {
        throw new Error('base de datos no disponible');
      },
      actualizarAforo: async () => 0,
    },
  },
  { nombre: 'GET /metrics -> 200', metodo: 'get', ruta: '/metrics', status: 200 },
  { nombre: 'GET /api/v1/aforo -> 200', metodo: 'get', ruta: '/api/v1/aforo', status: 200 },
  {
    nombre: 'GET /api/v1/notificaciones/preferencias -> 200',
    metodo: 'get', ruta: '/api/v1/notificaciones/preferencias', status: 200,
    tokenEstudiante: 'sesion-valida',
    identidadRepository: { obtenerEstudiantePorCodigo: async (id) => ({ codigo_estudiante: id }) },
    autenticacion: { obtenerUsuario: async () => ({ id: 'demo-001' }) },
    notificacionesRepository: {
      obtenerPreferencias: async () => ({ preferencias: null, capacidadMaxima: 30 }),
    },
  },
  {
    nombre: 'GET /api/v1/notificaciones/preferencias -> 401',
    metodo: 'get', ruta: '/api/v1/notificaciones/preferencias', status: 401,
    identidadRepository: { obtenerEstudiantePorCodigo: async (id) => ({ codigo_estudiante: id }) },
    autenticacion: { obtenerUsuario: async () => null },
    notificacionesRepository: {
      obtenerPreferencias: async () => assert.fail('no debe consultar'),
    },
  },
  {
    nombre: 'GET /api/v1/notificaciones/preferencias -> 503',
    metodo: 'get', ruta: '/api/v1/notificaciones/preferencias', status: 503,
    tokenEstudiante: 'sesion-valida',
    identidadRepository: { obtenerEstudiantePorCodigo: async (id) => ({ codigo_estudiante: id }) },
    autenticacion: { obtenerUsuario: async () => ({ id: 'demo-001' }) },
    notificacionesRepository: {
      obtenerPreferencias: async () => { throw new Error('fallo controlado'); },
    },
  },
  {
    nombre: 'GET /api/v1/notificaciones -> 200',
    metodo: 'get', ruta: '/api/v1/notificaciones', status: 200,
    tokenEstudiante: 'sesion-valida',
    identidadRepository: { obtenerEstudiantePorCodigo: async (id) => ({ codigo_estudiante: id }) },
    autenticacion: { obtenerUsuario: async () => ({ id: 'demo-001' }) },
    notificacionesRepository: {
      listarNotificaciones: async () => [{
        id: 1,
        tipo: 'AFORO_BAJO',
        mensaje: 'Aforo bajo',
        creadaEn: '2026-11-23T15:00:00.000Z',
        leidaEn: null,
      }],
    },
  },
  {
    nombre: 'GET /api/v1/notificaciones -> 401',
    metodo: 'get', ruta: '/api/v1/notificaciones', status: 401,
    identidadRepository: { obtenerEstudiantePorCodigo: async (id) => ({ codigo_estudiante: id }) },
    autenticacion: { obtenerUsuario: async () => null },
    notificacionesRepository: {
      listarNotificaciones: async () => assert.fail('no debe consultar'),
    },
  },
  {
    nombre: 'GET /api/v1/notificaciones -> 503',
    metodo: 'get', ruta: '/api/v1/notificaciones', status: 503,
    tokenEstudiante: 'sesion-valida',
    identidadRepository: { obtenerEstudiantePorCodigo: async (id) => ({ codigo_estudiante: id }) },
    autenticacion: { obtenerUsuario: async () => ({ id: 'demo-001' }) },
    notificacionesRepository: {
      listarNotificaciones: async () => { throw new Error('fallo controlado'); },
    },
  },
  {
    nombre: 'GET /api/v1/aforo -> 503', metodo: 'get', ruta: '/api/v1/aforo', status: 503,
    aforoRepository: {
      obtenerAforoActual: async () => {
        throw new Error('detalle interno no expuesto');
      },
      obtenerEstado: async () => {
        throw new Error('detalle interno no expuesto');
      },
      actualizarAforo: async () => 0,
    },
  },
  {
    nombre: 'POST /api/v1/aforo/acceso (ENTRADA) -> 201',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 201,
    body: { tipoAcceso: 'ENTRADA' }, cumpleSolicitud: true,
  },
  {
    nombre: 'POST /api/v1/aforo/acceso (rechazado) -> 400',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 400,
    solicitudes: [
      { body: { tipoAcceso: 'SALIDA' }, cumpleSolicitud: true },
      { body: { tipoAcceso: 'VISITA' }, cumpleSolicitud: false },
      {
        rawBody: '{"tipoAcceso":',
        respuestaEsperada: {
          status: 'error',
          message: 'El cuerpo de la solicitud no contiene un JSON válido.',
        },
      },
    ],
  },
  {
    nombre: 'POST /api/v1/aforo/acceso (sin token de operador) -> 401',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 401,
    body: { tipoAcceso: 'ENTRADA' }, cumpleSolicitud: true, sinToken: true,
    respuestaEsperada: {
      status: 'error',
      message: 'Se requiere un token de operador válido.',
    },
  },
  {
    nombre: 'POST /api/v1/aforo/acceso (cuerpo demasiado grande) -> 413',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 413,
    solicitudes: [{
      rawBody: JSON.stringify({ tipoAcceso: 'ENTRADA', relleno: 'x'.repeat(2048) }),
      respuestaEsperada: {
        status: 'error',
        message: 'El cuerpo de la solicitud excede el tamaño permitido.',
      },
    }],
  },
  {
    nombre: 'POST /api/v1/aforo/acceso (token no configurado en el servidor) -> 503',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 503,
    body: { tipoAcceso: 'ENTRADA' }, cumpleSolicitud: true, operadorToken: null,
    respuestaEsperada: {
      status: 'error',
      message: 'El registro de accesos no está habilitado en este entorno.',
    },
  },
  {
    nombre: 'POST /api/v1/aforo/acceso (repositorio no disponible) -> 503',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 503,
    body: { tipoAcceso: 'ENTRADA' }, cumpleSolicitud: true,
    aforoRepository: new AforoPostgresAdapter({
      pool: {
        connect: async () => {
          throw new Error('detalle interno de PostgreSQL');
        },
      },
    }),
    respuestaEsperada: {
      status: 'error',
      message: 'No fue posible registrar el acceso.',
    },
  },
  {
    nombre: 'POST /api/v1/aforo/acceso (error inesperado) -> 500',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 500,
    body: { tipoAcceso: 'ENTRADA' }, cumpleSolicitud: true,
    aforoRepository: {
      obtenerAforoActual: async () => 0,
      actualizarAforo: async () => {
        throw new Error('detalle interno inesperado');
      },
    },
    respuestaEsperada: {
      status: 'error',
      message: 'Error interno al registrar el acceso.',
    },
  },
  {
    nombre: 'POST /api/v1/estudiantes/sesion -> 200',
    metodo: 'post', ruta: '/api/v1/estudiantes/sesion', status: 200,
    body: { correo: 'demo-001@utb.edu.co', contrasena: 'clave-de-prueba' },
    cumpleSolicitud: true,
    identidadRepository: {
      obtenerEstudiantePorCodigo: async () => ({
        id: '39a05c8d-b8ea-4fa2-a42a-183f564d8e78',
        codigo_estudiante: 'demo-001',
        correo: 'demo-001@utb.edu.co',
        nombre: 'Demo',
        activa: true,
        dentro: false,
      }),
    },
    autenticacion: {
      iniciarSesion: async () => ({
        token: 'session-token',
        expiresAt: '2026-11-16T12:00:00.000Z',
        usuario: { id: 'demo-001' },
      }),
    },
  },
  {
    nombre: 'POST /api/v1/estudiantes/sesion -> 400',
    metodo: 'post', ruta: '/api/v1/estudiantes/sesion', status: 400,
    solicitudes: [
      { body: {}, cumpleSolicitud: false },
      {
        body: { codigoEstudiante: 'demo-001', contrasena: 'clave-anterior' },
        cumpleSolicitud: false,
      },
    ],
    identidadRepository: {},
    autenticacion: {},
  },
  {
    nombre: 'POST /api/v1/estudiantes/sesion -> 401',
    metodo: 'post', ruta: '/api/v1/estudiantes/sesion', status: 401,
    body: { correo: 'demo-001@utb.edu.co', contrasena: 'incorrecta' },
    cumpleSolicitud: true,
    identidadRepository: {
      obtenerEstudiantePorCodigo: async () => null,
    },
    autenticacion: {
      iniciarSesion: async () => { throw new CredencialesInvalidasError(); },
    },
  },
  {
    nombre: 'POST /api/v1/estudiantes/sesion -> 403',
    metodo: 'post', ruta: '/api/v1/estudiantes/sesion', status: 403,
    body: { correo: 'demo-001@utb.edu.co', contrasena: 'clave-de-prueba' },
    cumpleSolicitud: true,
    identidadRepository: { obtenerEstudiantePorCodigo: async () => null },
    autenticacion: {
      iniciarSesion: async () => ({
        token: 'session-token',
        expiresAt: '2026-11-16T12:00:00.000Z',
        usuario: { id: 'demo-001' },
      }),
    },
  },
  {
    nombre: 'POST /api/v1/estudiantes/sesion -> 503',
    metodo: 'post', ruta: '/api/v1/estudiantes/sesion', status: 503,
    body: { correo: 'demo-001@utb.edu.co', contrasena: 'clave-de-prueba' },
    cumpleSolicitud: true,
  },
  {
    nombre: 'POST /api/v1/estudiantes/qr -> 201',
    metodo: 'post', ruta: '/api/v1/estudiantes/qr', status: 201,
    body: {}, cumpleSolicitud: true,
    identidadRepository: {
      obtenerEstudiantePorCodigo: async () => ({
        id: '39a05c8d-b8ea-4fa2-a42a-183f564d8e78',
        codigo_estudiante: 'demo-001',
        correo: 'demo-001@utb.edu.co',
        nombre: 'Demo',
        activa: true,
      }),
      emitirQr: async () => ({
        token: 'qr-prueba',
        expiresAt: '2026-11-15T12:00:00.000Z',
      }),
    },
    autenticacion: {
      obtenerUsuario: async () => ({
        id: 'demo-001',
      }),
    },
    tokenEstudiante: 'session-token',
  },
  {
    nombre: 'POST /api/v1/estudiantes/qr -> 401',
    metodo: 'post', ruta: '/api/v1/estudiantes/qr', status: 401,
    sinToken: true,
  },
  {
    nombre: 'POST /api/v1/estudiantes/qr -> 503',
    metodo: 'post', ruta: '/api/v1/estudiantes/qr', status: 503,
  },
  {
    nombre: 'POST /api/v1/estudiantes/qr -> 403',
    metodo: 'post', ruta: '/api/v1/estudiantes/qr', status: 403,
    identidadRepository: { obtenerEstudiantePorCodigo: async () => null },
    autenticacion: {
      obtenerUsuario: async () => ({ id: 'demo-001' }),
    },
    tokenEstudiante: 'session-token',
  },
  {
    nombre: 'POST /api/v1/aforo/acceso-qr -> 201',
    metodo: 'post', ruta: '/api/v1/aforo/acceso-qr', status: 201,
    body: { qr: 'qr-prueba' }, cumpleSolicitud: true,
    aforoRepository: {
      obtenerAforoActual: async () => 0,
      actualizarAforo: async (transicionar) => transicionar(0, {}),
    },
    identidadRepository: { consumirQr: async () => 'ENTRADA' },
  },
  {
    nombre: 'POST /api/v1/aforo/acceso-qr (cuenta inactiva) -> 403',
    metodo: 'post', ruta: '/api/v1/aforo/acceso-qr', status: 403,
    body: { qr: 'qr-prueba' }, cumpleSolicitud: true,
    identidadRepository: {
      consumirQr: async () => { throw new CuentaEstudianteInactivaError(); },
    },
    respuestaEsperada: {
      status: 'error',
      message: 'La cuenta está inactiva y no puede registrar una entrada.',
    },
  },
  {
    nombre: 'POST /api/v1/aforo/acceso-qr -> 400',
    metodo: 'post', ruta: '/api/v1/aforo/acceso-qr', status: 400,
    solicitudes: [
      { body: {}, cumpleSolicitud: false },
      { body: { qr: 'qr-prueba' }, cumpleSolicitud: true },
    ],
    identidadRepository: {
      consumirQr: async () => { throw new QrNoValidoError(); },
    },
  },
  {
    nombre: 'POST /api/v1/aforo/acceso-qr -> 401',
    metodo: 'post', ruta: '/api/v1/aforo/acceso-qr', status: 401,
    body: { qr: 'qr-prueba' }, cumpleSolicitud: true, sinToken: true,
  },
  {
    nombre: 'POST /api/v1/aforo/acceso-qr -> 503',
    metodo: 'post', ruta: '/api/v1/aforo/acceso-qr', status: 503,
    body: { qr: 'qr-prueba' }, cumpleSolicitud: true,
  },
];

// --- ADR-0012: estado del gimnasio, capacidad y cédula ---
const ESTADO_CERRADO = { aforoActual: 0, capacidadMaxima: 30, abierto: false, motivoCierre: 'Mantenimiento' };
const ESTADO_LLENO = { aforoActual: 30, capacidadMaxima: 30, abierto: true, motivoCierre: null };
const repositorioCon = (estado) => ({
  obtenerAforoActual: async () => estado.aforoActual,
  obtenerEstado: async () => estado,
  actualizarAforo: async (transicionar) => transicionar(estado.aforoActual, {}, estado),
  modificarEstado: async () => estado,
});
const repositorioCaido = {
  obtenerAforoActual: async () => 0,
  obtenerEstado: async () => { throw new Error('detalle interno'); },
  actualizarAforo: async () => 0,
  modificarEstado: async () => { throw new Error('detalle interno de PostgreSQL'); },
};
const ESTUDIANTE = { codigoEstudiante: 'demo-001', nombre: 'Ana Pérez' };
const identidadCedula = {
  registrarPorCedula: async () => ({ tipoAcceso: 'ENTRADA', estudiante: ESTUDIANTE }),
  buscarPorCedula: async () => ({ ...ESTUDIANTE, activa: true, dentro: false }),
};

casos.push(
  {
    nombre: 'POST /api/v1/aforo/acceso (gimnasio cerrado) -> 409',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 409,
    body: { tipoAcceso: 'ENTRADA' }, cumpleSolicitud: true,
    aforoRepository: repositorioCon(ESTADO_CERRADO),
  },
  {
    nombre: 'POST /api/v1/aforo/acceso (capacidad superada sin confirmar) -> 409',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 409,
    body: { tipoAcceso: 'ENTRADA', confirmarExcesoCapacidad: false }, cumpleSolicitud: true,
    aforoRepository: repositorioCon(ESTADO_LLENO),
    respuestaEsperada: {
      status: 'error',
      code: 'CAPACIDAD_SUPERADA',
      message: 'El gimnasio ya tiene 30 de 30 personas. Confirma para registrar el ingreso de todas formas.',
      data: { aforoActual: 30, capacidadMaxima: 30 },
    },
  },
  {
    nombre: 'POST /api/v1/aforo/acceso-qr (gimnasio cerrado) -> 409',
    metodo: 'post', ruta: '/api/v1/aforo/acceso-qr', status: 409,
    body: { qr: 'qr-prueba' }, cumpleSolicitud: true,
    aforoRepository: repositorioCon(ESTADO_CERRADO),
    identidadRepository: { consumirQr: async () => 'ENTRADA' },
  },
  {
    nombre: 'POST /api/v1/aforo/acceso-cedula -> 201',
    metodo: 'post', ruta: '/api/v1/aforo/acceso-cedula', status: 201,
    body: { cedula: '1012345678', confirmarExcesoCapacidad: true }, cumpleSolicitud: true,
    identidadRepository: identidadCedula,
  },
  {
    nombre: 'POST /api/v1/aforo/acceso-cedula -> 400',
    metodo: 'post', ruta: '/api/v1/aforo/acceso-cedula', status: 400,
    body: { cedula: '12AB' }, cumpleSolicitud: false,
    identidadRepository: identidadCedula,
  },
  {
    nombre: 'POST /api/v1/aforo/acceso-cedula -> 401',
    metodo: 'post', ruta: '/api/v1/aforo/acceso-cedula', status: 401,
    body: { cedula: '1012345678' }, cumpleSolicitud: true, sinToken: true,
  },
  {
    nombre: 'POST /api/v1/aforo/acceso-cedula -> 403',
    metodo: 'post', ruta: '/api/v1/aforo/acceso-cedula', status: 403,
    body: { cedula: '1012345678' }, cumpleSolicitud: true,
    identidadRepository: {
      registrarPorCedula: async () => { throw new CuentaEstudianteInactivaError(); },
    },
  },
  {
    nombre: 'POST /api/v1/aforo/acceso-cedula -> 404',
    metodo: 'post', ruta: '/api/v1/aforo/acceso-cedula', status: 404,
    body: { cedula: '1012345678' }, cumpleSolicitud: true,
    identidadRepository: {
      registrarPorCedula: async () => { throw new EstudianteNoEncontradoError(); },
    },
    respuestaEsperada: {
      status: 'error',
      message: 'No hay ningún estudiante registrado con esa cédula.',
    },
  },
  {
    nombre: 'POST /api/v1/aforo/acceso-cedula -> 409',
    metodo: 'post', ruta: '/api/v1/aforo/acceso-cedula', status: 409,
    body: { cedula: '1012345678' }, cumpleSolicitud: true,
    aforoRepository: repositorioCon(ESTADO_CERRADO),
    identidadRepository: identidadCedula,
  },
  {
    nombre: 'POST /api/v1/aforo/acceso-cedula -> 503',
    metodo: 'post', ruta: '/api/v1/aforo/acceso-cedula', status: 503,
    body: { cedula: '1012345678' }, cumpleSolicitud: true,
  },
  {
    nombre: 'PUT /api/v1/aforo/estado -> 200',
    metodo: 'put', ruta: '/api/v1/aforo/estado', status: 200,
    body: { abierto: false, motivoCierre: 'Mantenimiento' }, cumpleSolicitud: true,
  },
  {
    nombre: 'PUT /api/v1/aforo/estado -> 400',
    metodo: 'put', ruta: '/api/v1/aforo/estado', status: 400,
    body: { abierto: 'no' }, cumpleSolicitud: false,
  },
  {
    nombre: 'PUT /api/v1/aforo/estado -> 401',
    metodo: 'put', ruta: '/api/v1/aforo/estado', status: 401,
    body: { abierto: true }, cumpleSolicitud: true, sinToken: true,
  },
  {
    nombre: 'PUT /api/v1/aforo/estado -> 503',
    metodo: 'put', ruta: '/api/v1/aforo/estado', status: 503,
    body: { abierto: true }, cumpleSolicitud: true,
    aforoRepository: repositorioCaido,
    respuestaEsperada: { status: 'error', message: 'No fue posible guardar el cambio.' },
  },
  {
    nombre: 'PUT /api/v1/aforo/capacidad -> 200',
    metodo: 'put', ruta: '/api/v1/aforo/capacidad', status: 200,
    body: { capacidadMaxima: 45 }, cumpleSolicitud: true,
  },
  {
    nombre: 'PUT /api/v1/aforo/capacidad -> 400',
    metodo: 'put', ruta: '/api/v1/aforo/capacidad', status: 400,
    body: { capacidadMaxima: 0 }, cumpleSolicitud: false,
  },
  {
    nombre: 'PUT /api/v1/aforo/capacidad -> 401',
    metodo: 'put', ruta: '/api/v1/aforo/capacidad', status: 401,
    body: { capacidadMaxima: 45 }, cumpleSolicitud: true, sinToken: true,
  },
  {
    nombre: 'PUT /api/v1/aforo/capacidad -> 503',
    metodo: 'put', ruta: '/api/v1/aforo/capacidad', status: 503,
    body: { capacidadMaxima: 45 }, cumpleSolicitud: true,
    aforoRepository: repositorioCaido,
  },
  {
    nombre: 'POST /api/v1/estudiantes/busqueda -> 200',
    metodo: 'post', ruta: '/api/v1/estudiantes/busqueda', status: 200,
    body: { cedula: '1012345678' }, cumpleSolicitud: true,
    identidadRepository: identidadCedula,
  },
  {
    nombre: 'POST /api/v1/estudiantes/busqueda -> 400',
    metodo: 'post', ruta: '/api/v1/estudiantes/busqueda', status: 400,
    body: { cedula: '123' }, cumpleSolicitud: false,
    identidadRepository: identidadCedula,
  },
  {
    nombre: 'POST /api/v1/estudiantes/busqueda -> 401',
    metodo: 'post', ruta: '/api/v1/estudiantes/busqueda', status: 401,
    body: { cedula: '1012345678' }, cumpleSolicitud: true, sinToken: true,
  },
  {
    nombre: 'POST /api/v1/estudiantes/busqueda -> 404',
    metodo: 'post', ruta: '/api/v1/estudiantes/busqueda', status: 404,
    body: { cedula: '1012345678' }, cumpleSolicitud: true,
    identidadRepository: { buscarPorCedula: async () => null },
  },
  {
    nombre: 'POST /api/v1/estudiantes/busqueda -> 503',
    metodo: 'post', ruta: '/api/v1/estudiantes/busqueda', status: 503,
    body: { cedula: '1012345678' }, cumpleSolicitud: true,
  },
  {
    nombre: 'PUT /api/v1/notificaciones/preferencias -> 200',
    metodo: 'put', ruta: '/api/v1/notificaciones/preferencias', status: 200,
    tokenEstudiante: 'sesion-valida',
    body: {
      habilitada: true, umbral: 8, dias: [1, 3, 5], horaInicio: 480, horaFin: 1080,
    },
    cumpleSolicitud: true,
    identidadRepository: { obtenerEstudiantePorCodigo: async (id) => ({ codigo_estudiante: id }) },
    autenticacion: { obtenerUsuario: async () => ({ id: 'demo-001' }) },
    notificacionesRepository: {
      guardarPreferencias: async (_id, data) => ({
        preferencias: { ...data, compatible: true },
        capacidadMaxima: 30,
      }),
    },
  },
  {
    nombre: 'PUT /api/v1/notificaciones/preferencias -> 400',
    metodo: 'put', ruta: '/api/v1/notificaciones/preferencias', status: 400,
    tokenEstudiante: 'sesion-valida',
    body: {
      habilitada: true, umbral: 31, dias: [1], horaInicio: 480, horaFin: 1080,
    },
    cumpleSolicitud: true,
    identidadRepository: { obtenerEstudiantePorCodigo: async (id) => ({ codigo_estudiante: id }) },
    autenticacion: { obtenerUsuario: async () => ({ id: 'demo-001' }) },
    notificacionesRepository: {
      guardarPreferencias: async () => {
        throw new PreferenciasAlertaInvalidasError('Umbral inválido');
      },
    },
    respuestaEsperada: { status: 'error', message: 'Umbral inválido' },
  },
  {
    nombre: 'PUT /api/v1/notificaciones/preferencias -> 401',
    metodo: 'put', ruta: '/api/v1/notificaciones/preferencias', status: 401,
    body: {
      habilitada: true, umbral: 8, dias: [1], horaInicio: 480, horaFin: 1080,
    },
    cumpleSolicitud: true,
    sinToken: true,
    identidadRepository: { obtenerEstudiantePorCodigo: async (id) => ({ codigo_estudiante: id }) },
    autenticacion: { obtenerUsuario: async () => null },
    notificacionesRepository: {
      guardarPreferencias: async () => assert.fail('no debe guardar'),
    },
  },
  {
    nombre: 'PUT /api/v1/notificaciones/preferencias -> 503',
    metodo: 'put', ruta: '/api/v1/notificaciones/preferencias', status: 503,
    tokenEstudiante: 'sesion-valida',
    body: {
      habilitada: true, umbral: 8, dias: [1], horaInicio: 480, horaFin: 1080,
    },
    cumpleSolicitud: true,
    identidadRepository: { obtenerEstudiantePorCodigo: async (id) => ({ codigo_estudiante: id }) },
    autenticacion: { obtenerUsuario: async () => ({ id: 'demo-001' }) },
    notificacionesRepository: {
      guardarPreferencias: async () => { throw new Error('fallo controlado'); },
    },
  },
  {
    nombre: 'POST /api/v1/operador/verificacion -> 200',
    metodo: 'post', ruta: '/api/v1/operador/verificacion', status: 200,
  },
  {
    nombre: 'POST /api/v1/operador/verificacion -> 401',
    metodo: 'post', ruta: '/api/v1/operador/verificacion', status: 401, sinToken: true,
  },
  {
    nombre: 'POST /api/v1/operador/verificacion -> 503',
    metodo: 'post', ruta: '/api/v1/operador/verificacion', status: 503, operadorToken: null,
  },
);

const cubiertos = new Set();

for (const caso of casos) {
  test(`contrato: ${caso.nombre}`, async () => {
    const solicitudes = caso.solicitudes || [{
      body: caso.body,
      cumpleSolicitud: caso.cumpleSolicitud,
      identidadRepository: caso.identidadRepository,
    }];

    await withServer(async (baseUrl) => {
      for (const solicitud of solicitudes) {
        if (solicitud.body !== undefined) {
          const validaSolicitud = validadorSolicitud(caso.ruta, caso.metodo);
          assert.equal(
            validaSolicitud(solicitud.body), solicitud.cumpleSolicitud,
            'la solicitud de la prueba no coincide con el esquema de solicitud del contrato'
          );
        }

        const res = await fetch(`${baseUrl}${caso.ruta}`, {
          method: caso.metodo.toUpperCase(),
          headers: {
            'Content-Type': solicitud.contentType || 'application/json',
            ...((['post', 'put'].includes(caso.metodo) && !caso.sinToken)
              || (caso.metodo === 'get' && caso.tokenEstudiante)
              ? { Authorization: `Bearer ${caso.tokenEstudiante || TOKEN}` }
              : {}),
          },
          body: solicitud.rawBody ?? (solicitud.body !== undefined
            ? JSON.stringify(solicitud.body)
            : undefined),
        });
        const cuerpo = await res.json();

        // 1) el código HTTP debe estar documentado y ser el esperado
        assert.equal(res.status, caso.status);
        if (res.status >= 400) {
          assert.match(res.headers.get('content-type'), /^application\/json\b/);
        }

        const respuestaEsperada = solicitud.respuestaEsperada || caso.respuestaEsperada;
        if (respuestaEsperada) assert.deepStrictEqual(cuerpo, respuestaEsperada);

        if (caso.ruta === '/api/v1/aforo' && caso.status === 503) {
          assert.match(res.headers.get('content-type'), /^application\/json\b/);
          assert.deepStrictEqual(cuerpo, {
            status: 'error',
            message: 'No fue posible consultar el aforo.',
          });
        }

        if (caso.ruta === '/metrics') {
          const metricas = cuerpo.access_operations_total;
          assert.ok(metricas, 'la respuesta debe incluir access_operations_total');
          for (const nombre of ['entrada', 'salida', 'total']) {
            assert.ok(Number.isInteger(metricas[nombre]), `${nombre} debe ser entero`);
            assert.ok(metricas[nombre] >= 0, `${nombre} no debe ser negativo`);
          }
          assert.equal(metricas.total, metricas.entrada + metricas.salida);
        }

        // 2) el cuerpo debe cumplir el esquema documentado para ese código
        const valida = validadorRespuesta(caso.ruta, caso.metodo, res.status);
        assert.ok(
          valida(cuerpo),
          `Incumple el contrato: ${JSON.stringify(valida.errors)} | cuerpo recibido: ${JSON.stringify(cuerpo)}`
        );
      }

      cubiertos.add(`${caso.metodo.toUpperCase()} ${caso.ruta} ${caso.status}`);
    }, caso.aforoRepository, caso.operadorToken === undefined ? TOKEN : caso.operadorToken,
    caso.identidadRepository, caso.autenticacion, caso.notificacionesRepository);
  });
}

test('contrato: toda respuesta documentada en openapi.yaml está verificada por una prueba', () => {
  const documentados = new Set();
  for (const [ruta, ops] of Object.entries(spec.paths)) {
    for (const [metodo, op] of Object.entries(ops)) {
      for (const status of Object.keys(op.responses)) {
        documentados.add(`${metodo.toUpperCase()} ${ruta} ${status}`);
      }
    }
  }
  assert.deepEqual([...documentados].sort(), [...cubiertos].sort());
});

test('contrato: los cambios incompatibles están versionados y no prometen compatibilidad', () => {
  assert.match(spec.info.version, /^4\./, 'el MAJOR 4 registra el 409 nuevo en las entradas (ADR-0012)');
  assert.ok(spec.paths['/api/v1/estudiantes/sesion']);
  assert.equal(spec.paths['/api/v2/estudiantes/sesion'], undefined);
  assert.match(spec.info.description, /No se afirma que el contrato sea compatible/);
});
