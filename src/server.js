const express = require('express');
const { crearAforoRouter } = require('./modules/aforo/infrastructure/http/aforo.router');
const { AforoMemoriaAdapter } = require('./modules/aforo/infrastructure/persistence/aforo-memoria.adapter');
const { AforoPostgresAdapter } = require('./modules/aforo/infrastructure/persistence/aforo-postgres.adapter');
const { crearRegistrarAccesoUseCase } = require('./modules/aforo/application/registrar-acceso.usecase');
const { crearRegistrarAccesoQrUseCase } = require('./modules/aforo/application/registrar-acceso-qr.usecase');
const { crearRegistrarAccesoEstudianteUseCase } = require('./modules/aforo/application/registrar-acceso-estudiante.usecase');
const { crearConsultarAforoUseCase } = require('./modules/aforo/application/consultar-aforo.usecase');
const { crearConfigurarGimnasioUseCases } = require('./modules/aforo/application/configurar-gimnasio.usecase');
const { crearIdentidadRouter } = require('./modules/identidad/infrastructure/http/identidad.router');
const { IdentidadPostgresAdapter } = require('./modules/identidad/infrastructure/persistence/identidad-postgres.adapter');
const { AutenticacionLocalAdapter } = require('./modules/identidad/infrastructure/auth/autenticacion-local.adapter');
const { logger } = require('./shared/logger');
const { cargarEntornoRuntime } = require('./shared/environment');
const {
  cabecerasSeguridad,
  crearCors,
  parsearOrigenes,
  crearAutenticacionOperador,
} = require('./shared/http/seguridad');

const LIMITE_CUERPO_JSON = '1kb';

// Rutas que exigen la contraseña de encargado (token de operador, ADR-0007).
const RUTAS_POST_OPERADOR = [
  '/api/v1/aforo/acceso',
  '/api/v1/aforo/acceso-qr',
  '/api/v1/aforo/acceso-cedula',
  '/api/v1/estudiantes/busqueda',
  '/api/v1/operador/verificacion',
];
const RUTAS_PUT_OPERADOR = ['/api/v1/aforo/estado', '/api/v1/aforo/capacidad'];
const NOMBRE_SERVICIO = 'gimnasio-utb-backend';


/**
 * @param {object} [opciones]
 * @param {object} [opciones.aforoRepository] adaptador del puerto de aforo
 * @param {object} [opciones.identidadRepository] repositorio de estudiantes y QR
 * @param {object} [opciones.autenticacion] adaptador del puerto de autenticación de estudiantes
 * @param {string} [opciones.operadorToken] secreto del encargado para registrar y configurar (ADR-0007)
 * @param {string[]} [opciones.origenesCors] orígenes web permitidos (ADR-0007)
 */
function createApp({
  aforoRepository,
  identidadRepository,
  autenticacion,
  operadorToken,
  origenesCors = [],
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cabecerasSeguridad);
  app.use(crearCors({ origenesPermitidos: origenesCors }));
  // La autenticación va antes del parseo: una petición sin token no consume
  // recursos de parseo ni llega al caso de uso.
  const autenticarOperador = crearAutenticacionOperador({ token: operadorToken, logger });
  for (const ruta of RUTAS_POST_OPERADOR) app.post(ruta, autenticarOperador);
  for (const ruta of RUTAS_PUT_OPERADOR) app.put(ruta, autenticarOperador);
  app.use(express.json({ limit: LIMITE_CUERPO_JSON }));
  app.use((error, req, res, next) => {
    if (error?.type === 'entity.too.large') {
      try {
        logger.warn('http.body_too_large', 'Request body exceeds the allowed size');
      } catch {}
      return res.status(413).json({
        status: 'error',
        message: 'El cuerpo de la solicitud excede el tamaño permitido.',
      });
    }
    if (error?.type === 'entity.parse.failed') {
      try {
        logger.warn('http.invalid_json', 'Malformed JSON request body');
      } catch {}
      return res.status(400).json({
        status: 'error',
        message: 'El cuerpo de la solicitud no contiene un JSON válido.',
      });
    }
    return next(error);
  });
  const repository = aforoRepository || new AforoMemoriaAdapter();
  const identityRepository = identidadRepository || null;
  const accessMetrics = { entrada: 0, salida: 0 };

  // Raíz informativa: quien abre la URL del deployment en un navegador ve qué
  // servicio es y qué rutas públicas puede consultar, en vez de un 404.
  app.get('/', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: NOMBRE_SERVICIO,
      descripcion: 'API del sistema de aforo del Gimnasio UTB. El cliente es la app Flutter.',
      endpoints: ['/health', '/ready', '/metrics', '/api/v1/aforo'],
    });
  });

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: NOMBRE_SERVICIO });
  });

  app.get('/ready', async (req, res) => {
    try {
      await repository.obtenerAforoActual();
      res.status(200).json({ status: 'ok', service: NOMBRE_SERVICIO });
    } catch {
      res.status(503).json({ status: 'error', service: NOMBRE_SERVICIO });
    }
  });

  app.get('/metrics', (req, res) => {
    const total = accessMetrics.entrada + accessMetrics.salida;
    res.status(200).json({
      access_operations_total: {
        entrada: accessMetrics.entrada,
        salida: accessMetrics.salida,
        total,
      },
    });
  });

  // --- Composición del módulo aforo (corte vertical) ---
  const registrarAcceso = crearRegistrarAccesoUseCase(repository);
  const registrarAccesoQr = identityRepository
    ? crearRegistrarAccesoQrUseCase(
      repository,
      (transaccion, qr) => identityRepository.consumirQr(transaccion, qr)
    )
    : null;
  const registrarAccesoCedula = identityRepository
    ? crearRegistrarAccesoEstudianteUseCase(
      repository,
      (transaccion, cedula) => identityRepository.registrarPorCedula(transaccion, cedula)
    )
    : null;
  const alRegistrar = (tipoAcceso, canal) => {
    if (tipoAcceso === 'ENTRADA') accessMetrics.entrada += 1;
    if (tipoAcceso === 'SALIDA') accessMetrics.salida += 1;
    try {
      logger.info('aforo.access_processed', `Access operation processed: ${tipoAcceso} (${canal})`);
    } catch {}
  };

  app.use('/api/v1/aforo', crearAforoRouter({
    registrarAcceso,
    consultarAforo: crearConsultarAforoUseCase(repository),
    configurar: crearConfigurarGimnasioUseCases(repository),
    registrarAccesoQr,
    registrarAccesoCedula,
    alRegistrar,
  }));
  app.use('/api/v1/estudiantes', crearIdentidadRouter(identityRepository, autenticacion));

  // La app valida la contraseña de encargado al ingresar, antes de mostrar
  // el panel. Si llega aquí, el middleware ya la aceptó.
  app.post('/api/v1/operador/verificacion', (req, res) => {
    res.status(200).json({ status: 'success', data: { valido: true } });
  });

  return app;
}

if (require.main === module) {
  cargarEntornoRuntime();
  const aforoRepository = new AforoPostgresAdapter();
  // Los tres adaptadores PostgreSQL comparten un pool: el consumo del QR y la
  // actualización del aforo deben ir en la misma transacción (ADR-0008).
  const identidadRepository = new IdentidadPostgresAdapter({
    pool: aforoRepository.pool,
  });
  const autenticacion = new AutenticacionLocalAdapter({
    pool: aforoRepository.pool,
  });
  const app = createApp({
    aforoRepository,
    identidadRepository,
    autenticacion,
    operadorToken: process.env.OPERADOR_TOKEN,
    origenesCors: parsearOrigenes(process.env.CORS_ORIGINS),
  });
  const port = process.env.PORT || 3000;
  const server = app.listen(port, () => {
    logger.info('server.started', `HTTP server listening on port ${port}`);
  });

  process.once('SIGTERM', () => {
    logger.info('server.shutdown_started', 'SIGTERM received; draining HTTP connections');
    server.close(() => {
      aforoRepository.cerrar().then(() => {
        logger.info('server.shutdown_complete', 'PostgreSQL pool closed');
      }).catch(() => {
        logger.error('postgres.pool.close_failed', 'Failed to close PostgreSQL pool');
        process.exitCode = 1;
      });
    });
  });
}

module.exports = { createApp };
