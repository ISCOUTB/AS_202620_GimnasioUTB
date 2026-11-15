const express = require('express');
const { crearAforoRouter } = require('./modules/aforo/infrastructure/http/aforo.router');
const { AforoMemoriaAdapter } = require('./modules/aforo/infrastructure/persistence/aforo-memoria.adapter');
const { AforoPostgresAdapter } = require('./modules/aforo/infrastructure/persistence/aforo-postgres.adapter');
const { crearRegistrarAccesoUseCase } = require('./modules/aforo/application/registrar-acceso.usecase');
const { crearRegistrarAccesoQrUseCase } = require('./modules/aforo/application/registrar-acceso-qr.usecase');
const { crearConsultarAforoUseCase } = require('./modules/aforo/application/consultar-aforo.usecase');
const { AforoDomainError } = require('./modules/aforo/domain/aforo');
const { crearIdentidadRouter } = require('./modules/identidad/infrastructure/http/identidad.router');
const { IdentidadPostgresAdapter } = require('./modules/identidad/infrastructure/persistence/identidad-postgres.adapter');
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
 * @param {object} [opciones.identidadRepository] adaptador de identidad (solo cuentas sintéticas)
 * @param {string} [opciones.operadorToken] secreto que exige POST /acceso (ADR-0007)
 * @param {string[]} [opciones.origenesCors] orígenes web permitidos (ADR-0007)
 */
function createApp({
  aforoRepository,
  identidadRepository,
  operadorToken,
  origenesCors = [],
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cabecerasSeguridad);
  app.use(crearCors({ origenesPermitidos: origenesCors }));
  // La autenticación va antes del parseo: una petición sin token no consume
  // recursos de parseo ni llega al caso de uso.
  app.post('/api/v1/aforo/acceso', crearAutenticacionOperador({ token: operadorToken, logger }));
  app.post('/api/v1/aforo/acceso-qr', crearAutenticacionOperador({ token: operadorToken, logger }));
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
  const registrarAccesoQrUseCase = identityRepository
    ? crearRegistrarAccesoQrUseCase(
      repository,
      (transaccion, qr) => identityRepository.consumirQr(transaccion, qr)
    )
    : null;
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
  app.use('/api/v1/estudiantes', crearIdentidadRouter(identityRepository));
  app.post(
    '/api/v1/aforo/acceso-qr',
    async (req, res) => {
      if (!registrarAccesoQrUseCase) {
        return res.status(503).json({
          status: 'error',
          message: 'El acceso por QR no está habilitado en este entorno.',
        });
      }
      const { qr } = req.body || {};
      if (typeof qr !== 'string' || qr.length < 1 || qr.length > 256) {
        return res.status(400).json({
          status: 'error',
          message: 'Se requiere un código QR válido.',
        });
      }
      try {
        const resultado = await registrarAccesoQrUseCase(qr);
        const clave = resultado.tipoAcceso === 'ENTRADA' ? 'entrada' : 'salida';
        accessMetrics[clave] += 1;
        try {
          logger.info('aforo.qr_access_processed', `QR access processed: ${clave}`);
        } catch {}
        return res.status(201).json({
          status: 'success',
          data: {
            tipoAcceso: resultado.tipoAcceso,
            aforoActual: resultado.aforoActual,
          },
        });
      } catch (error) {
        if (error?.code === 'QR_NOT_VALID') {
          return res.status(400).json({ status: 'error', message: error.message });
        }
        if (error instanceof AforoDomainError) {
          return res.status(400).json({ status: 'error', message: error.message });
        }
        logger.error('aforo.qr_access_failed', 'Failed to register QR access');
        return res.status(503).json({
          status: 'error',
          message: 'No fue posible registrar el acceso por QR.',
        });
      }
    }
  );

  return app;
}

if (require.main === module) {
  const aforoRepository = new AforoPostgresAdapter();
  const identidadRepository = new IdentidadPostgresAdapter({
    pool: aforoRepository.pool,
  });
  const app = createApp({
    aforoRepository,
    identidadRepository,
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
