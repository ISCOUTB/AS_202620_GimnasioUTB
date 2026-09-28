const express = require('express');
const { AforoDomainError } = require('../../domain/aforo');
const { AforoRepositoryError } = require('../../application/ports/aforo-repository.port');
const { logger } = require('../../../../shared/logger');

/**
 * Adaptador HTTP del módulo aforo. Traduce peticiones Express hacia el
 * caso de uso — no contiene ninguna regla de negocio, solo parseo de
 * la petición y formato de la respuesta.
 *
 * @param {(tipoAcceso: string) => Promise<number>} registrarAcceso
 * @param {() => Promise<number>} obtenerAforoActual
 */
function crearAforoRouter(registrarAcceso, obtenerAforoActual) {
  const router = express.Router();

  router.post('/acceso', async (req, res) => {
    try {
      const { tipoAcceso } = req.body || {};
      const aforoActual = await registrarAcceso(tipoAcceso);
      res.status(201).json({ status: 'success', data: { aforoActual } });
    } catch (error) {
      if (error instanceof AforoDomainError) {
        try {
          logger.warn('aforo.access_rejected', 'Access operation rejected');
        } catch {}
        return res.status(400).json({ status: 'error', message: error.message });
      }

      if (error instanceof AforoRepositoryError) {
        try {
          logger.error('aforo.repository_write_failed', 'Failed to update aforo repository');
        } catch {}
        return res.status(503).json({
          status: 'error',
          message: 'No fue posible registrar el acceso.',
        });
      }

      try {
        logger.error('aforo.access_unexpected_error', 'Unexpected error while registering access');
      } catch {}
      return res.status(500).json({
        status: 'error',
        message: 'Error interno al registrar el acceso.',
      });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const aforoActual = await obtenerAforoActual();
      return res.status(200).json({ status: 'success', data: { aforoActual } });
    } catch {
      try {
        logger.error('aforo.read_failed', 'Failed to read current aforo');
      } catch {}
      return res.status(503).json({
        status: 'error',
        message: 'No fue posible consultar el aforo.',
      });
    }
  });

  return router;
}

module.exports = { crearAforoRouter };
