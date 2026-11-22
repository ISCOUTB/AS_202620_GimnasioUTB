const express = require('express');
const {
  CredencialesInvalidasError,
  EstudianteNoVinculadoError,
  SesionEstudianteInvalidaError,
} = require('../../application/identidad.errors');
const { logger } = require('../../../../shared/logger');

const MENSAJE_IDENTIDAD_NO_DISPONIBLE =
  'La autenticación de estudiantes no está habilitada en este entorno.';
const CORREO_UTB_RE = /^[a-z0-9._%+-]+@utb\.edu\.co$/i;
const CEDULA_RE = /^\d{5,12}$/;

function extraerBearer(req) {
  const coincidencia = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
  return coincidencia ? coincidencia[1] : null;
}

function crearAutenticacionEstudiante(autenticacion, repository) {
  return async function autenticarEstudiante(req, res, next) {
    const token = extraerBearer(req);
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Se requiere una sesión de estudiante válida.',
      });
    }
    if (!autenticacion || !repository) {
      return res.status(503).json({
        status: 'error',
        message: MENSAJE_IDENTIDAD_NO_DISPONIBLE,
      });
    }
    try {
      const usuario = await autenticacion.obtenerUsuario(token);
      if (!usuario) {
        return res.status(401).json({
          status: 'error',
          message: 'La sesión de estudiante no es válida o expiró.',
        });
      }
      const estudiante = await repository.obtenerEstudiantePorCodigo(usuario.id);
      if (!estudiante) {
        return res.status(403).json({
          status: 'error',
          message: 'La sesión no corresponde a un estudiante registrado.',
        });
      }
      req.estudiante = estudiante;
      return next();
    } catch (error) {
      // Se registra solo el tipo de error: el mensaje podría incluir datos del
      // token o de la base de datos. El cliente recibe un 503 genérico.
      logger.error(
        'identity.session_lookup_failed',
        `Failed to validate student session (${error?.name || 'Error'})`
      );
      return res.status(503).json({
        status: 'error',
        message: MENSAJE_IDENTIDAD_NO_DISPONIBLE,
      });
    }
  };
}

function crearIdentidadRouter(repository, autenticacion) {
  const router = express.Router();

  router.post('/sesion', async (req, res) => {
    if (!repository || !autenticacion) {
      return res.status(503).json({
        status: 'error',
        message: MENSAJE_IDENTIDAD_NO_DISPONIBLE,
      });
    }
    const { correo, contrasena } = req.body || {};
    if (
      typeof correo !== 'string'
      || !CORREO_UTB_RE.test(correo.trim())
      || typeof contrasena !== 'string'
      || contrasena.length < 1
      || contrasena.length > 256
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'Ingresa un correo @utb.edu.co y tu contraseña.',
      });
    }

    try {
      const sesion = await autenticacion.iniciarSesion(correo.trim().toLowerCase(), contrasena);
      const estudiante = await repository.obtenerEstudiantePorCodigo(sesion.usuario.id);
      if (!estudiante) throw new EstudianteNoVinculadoError();
      return res.status(200).json({
        status: 'success',
        data: {
          token: sesion.token,
          expiresAt: sesion.expiresAt,
          estudiante: {
            codigoEstudiante: estudiante.codigo_estudiante,
            nombre: estudiante.nombre,
          },
        },
      });
    } catch (error) {
      if (error instanceof CredencialesInvalidasError) {
        return res.status(401).json({
          status: 'error',
          message: 'Correo o contraseña inválidos.',
        });
      }
      if (error instanceof EstudianteNoVinculadoError) {
        return res.status(403).json({
          status: 'error',
          message: 'La sesión no corresponde a un estudiante registrado.',
        });
      }
      logger.error('identity.login_failed', 'Failed to authenticate student');
      return res.status(503).json({
        status: 'error',
        message: MENSAJE_IDENTIDAD_NO_DISPONIBLE,
      });
    }
  });

  router.post('/qr', crearAutenticacionEstudiante(autenticacion, repository), async (req, res) => {
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

  // Búsqueda por cédula para el encargado (ADR-0012). El token de operador
  // se valida en server.js antes de parsear el cuerpo, como en los registros.
  router.post('/busqueda', async (req, res) => {
    if (!repository) {
      return res.status(503).json({ status: 'error', message: MENSAJE_IDENTIDAD_NO_DISPONIBLE });
    }
    const { cedula } = req.body || {};
    if (typeof cedula !== 'string' || !CEDULA_RE.test(cedula)) {
      return res.status(400).json({
        status: 'error',
        message: 'La cédula debe tener entre 5 y 12 dígitos.',
      });
    }
    try {
      const estudiante = await repository.buscarPorCedula(cedula);
      if (!estudiante) {
        return res.status(404).json({
          status: 'error',
          message: 'No hay ningún estudiante registrado con esa cédula.',
        });
      }
      return res.status(200).json({ status: 'success', data: estudiante });
    } catch {
      logger.error('identity.search_failed', 'Failed to search student by id number');
      return res.status(503).json({
        status: 'error',
        message: 'No fue posible buscar al estudiante.',
      });
    }
  });

  return router;
}

module.exports = { crearIdentidadRouter, crearAutenticacionEstudiante };
