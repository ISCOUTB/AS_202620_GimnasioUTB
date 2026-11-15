const express = require('express');
const {
  CredencialesInvalidasError,
  SesionEstudianteInvalidaError,
} = require('../../application/identidad.errors');
const { logger } = require('../../../../shared/logger');

const MENSAJE_IDENTIDAD_NO_DISPONIBLE =
  'La autenticación de estudiantes no está habilitada en este entorno.';

function extraerBearer(req) {
  const coincidencia = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
  return coincidencia ? coincidencia[1] : null;
}

function crearAutenticacionEstudiante(repository) {
  return async function autenticarEstudiante(req, res, next) {
    const token = extraerBearer(req);
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Se requiere una sesión de estudiante válida.',
      });
    }
    if (!repository) {
      return res.status(503).json({
        status: 'error',
        message: MENSAJE_IDENTIDAD_NO_DISPONIBLE,
      });
    }
    try {
      const estudiante = await repository.obtenerEstudianteDeSesion(token);
      if (!estudiante) {
        return res.status(401).json({
          status: 'error',
          message: 'La sesión de estudiante no es válida o expiró.',
        });
      }
      req.estudiante = estudiante;
      return next();
    } catch {
      logger.error('identity.session_lookup_failed', 'Failed to validate student session');
      return res.status(503).json({
        status: 'error',
        message: MENSAJE_IDENTIDAD_NO_DISPONIBLE,
      });
    }
  };
}

function crearIdentidadRouter(repository) {
  const router = express.Router();

  router.post('/sesion', async (req, res) => {
    if (!repository) {
      return res.status(503).json({
        status: 'error',
        message: MENSAJE_IDENTIDAD_NO_DISPONIBLE,
      });
    }
    const { codigoEstudiante, contrasena } = req.body || {};
    if (
      typeof codigoEstudiante !== 'string'
      || codigoEstudiante.trim().length < 1
      || codigoEstudiante.trim().length > 64
      || typeof contrasena !== 'string'
      || contrasena.length < 1
      || contrasena.length > 256
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'Código de estudiante y contraseña son requeridos.',
      });
    }
    try {
      const sesion = await repository.iniciarSesion(
        codigoEstudiante.trim(),
        contrasena
      );
      return res.status(200).json({ status: 'success', data: sesion });
    } catch (error) {
      if (error instanceof CredencialesInvalidasError) {
        return res.status(401).json({
          status: 'error',
          message: 'Código de estudiante o contraseña inválidos.',
        });
      }
      logger.error('identity.login_failed', 'Failed to create student session');
      return res.status(503).json({
        status: 'error',
        message: MENSAJE_IDENTIDAD_NO_DISPONIBLE,
      });
    }
  });

  router.post('/qr', crearAutenticacionEstudiante(repository), async (req, res) => {
    try {
      const qr = await repository.emitirQr(req.estudiante.codigo_estudiante);
      return res.status(201).json({ status: 'success', data: qr });
    } catch (error) {
      if (error instanceof SesionEstudianteInvalidaError) {
        return res.status(401).json({
          status: 'error',
          message: 'La sesión de estudiante no es válida o expiró.',
        });
      }
      logger.error('identity.qr_issue_failed', 'Failed to issue student QR');
      return res.status(503).json({
        status: 'error',
        message: MENSAJE_IDENTIDAD_NO_DISPONIBLE,
      });
    }
  });

  return router;
}

module.exports = { crearIdentidadRouter, crearAutenticacionEstudiante };
