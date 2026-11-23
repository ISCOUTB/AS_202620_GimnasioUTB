const express = require('express');
const {
  PreferenciasAlertaInvalidasError,
} = require('../../domain/alerta-aforo');
const { logger } = require('../../../../shared/logger');

function registrarFallo(evento, error) {
  try {
    logger.error(evento, `Notification request failed (${error?.name || 'Error'})`);
  } catch {}
}

function crearNotificacionesRouter({
  autenticarEstudiante,
  repository,
  evaluarAlGuardarPreferencias,
}) {
  if (typeof autenticarEstudiante !== 'function' || !repository) {
    throw new TypeError('Se requiere autenticación y repositorio de notificaciones');
  }

  const router = express.Router();
  router.use(autenticarEstudiante);

  router.get('/preferencias', async (req, res) => {
    try {
      const data = await repository.obtenerPreferencias(req.estudiante.codigo_estudiante);
      return res.status(200).json({ status: 'success', data });
    } catch (error) {
      registrarFallo('notifications.preferences_read_failed', error);
      return res.status(503).json({
        status: 'error',
        message: 'No fue posible consultar las preferencias de alerta.',
      });
    }
  });

  router.put('/preferencias', async (req, res) => {
    try {
      const data = await repository.guardarPreferencias(
        req.estudiante.codigo_estudiante,
        req.body,
        evaluarAlGuardarPreferencias
      );
      return res.status(200).json({ status: 'success', data });
    } catch (error) {
      if (error instanceof PreferenciasAlertaInvalidasError) {
        return res.status(400).json({
          status: 'error',
          message: error.message,
        });
      }
      registrarFallo('notifications.preferences_write_failed', error);
      return res.status(503).json({
        status: 'error',
        message: 'No fue posible guardar las preferencias de alerta.',
      });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const notificaciones = await repository.listarNotificaciones(
        req.estudiante.codigo_estudiante
      );
      return res.status(200).json({ status: 'success', data: { notificaciones } });
    } catch (error) {
      registrarFallo('notifications.list_failed', error);
      return res.status(503).json({
        status: 'error',
        message: 'No fue posible consultar las notificaciones.',
      });
    }
  });

  return router;
}

module.exports = { crearNotificacionesRouter };
