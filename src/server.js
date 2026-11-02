const express = require('express');
const { crearAforoRouter } = require('./modules/aforo/infrastructure/http/aforo.router');
const { AforoMemoriaAdapter } = require('./modules/aforo/infrastructure/persistence/aforo-memoria.adapter');
const { AforoPostgresAdapter } = require('./modules/aforo/infrastructure/persistence/aforo-postgres.adapter');
const { crearRegistrarAccesoUseCase } = require('./modules/aforo/application/registrar-acceso.usecase');
const { crearConsultarAforoUseCase } = require('./modules/aforo/application/consultar-aforo.usecase');
const { logger } = require('./shared/logger');
const {
  cabecerasSeguridad,
  crearCors,
  parsearOrigenes,
  crearAutenticacionOperador,
} = require('./shared/http/seguridad');

const LIMITE_CUERPO_JSON = '1kb';


/**
 * @param {object} [opciones]
 * @param {object} [opciones.aforoRepository] adaptador del puerto de aforo
 * @param {string} [opciones.operadorToken] secreto que exige POST /acceso (ADR-0007)
 * @param {string[]} [opciones.origenesCors] orígenes web permitidos (ADR-0007)
 */
function createApp({ aforoRepository, operadorToken, origenesCors = [] } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cabecerasSeguridad);
  app.use(crearCors({ origenesPermitidos: origenesCors }));
  // La autenticación va antes del parseo: una petición sin token no consume
  // recursos de parseo ni llega al caso de uso.
  app.post('/api/v1/aforo/acceso', crearAutenticacionOperador({ token: operadorToken, logger }));
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
  const accessMetrics = { entrada: 0, salida: 0 };

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'gimnasio-utb-backend' });
  });

  app.get('/ready', async (req, res) => {
    try {
      await repository.obtenerAforoActual();
      res.status(200).json({ status: 'ok', service: 'gimnasio-utb-backend' });
    } catch {
      res.status(503).json({ status: 'error', service: 'gimnasio-utb-backend' });
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
  const registrarAccesoUseCase = crearRegistrarAccesoUseCase(repository);
  const registrarAcceso = async (tipoAcceso) => {
    const aforoActual = await registrarAccesoUseCase(tipoAcceso);
    if (tipoAcceso === 'ENTRADA') accessMetrics.entrada += 1;
    if (tipoAcceso === 'SALIDA') accessMetrics.salida += 1;
    try {
      logger.info('aforo.access_processed', `Access operation processed: ${tipoAcceso}`);
    } catch {}
    return aforoActual;
  };
  const obtenerAforoActual = crearConsultarAforoUseCase(repository);

  app.use('/api/v1/aforo', crearAforoRouter(registrarAcceso, obtenerAforoActual));

  return app;
}

if (require.main === module) {
  const aforoRepository = new AforoPostgresAdapter();
  const app = createApp({
    aforoRepository,
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
