const express = require('express');
const {
  CredencialesInvalidasError,
  EstudianteNoVinculadoError,
  SesionEstudianteInvalidaError,
} = require('../../application/identidad.errors');
const { logger } = require('../../../../shared/logger');

const MENSAJE_IDENTIDAD_NO_DISPONIBLE =
  'La autenticación de estudiantes no está habilitada en este entorno.';
const CORREO_SINTETICO_RE = /^[a-z0-9._%+-]+@utb\.edu\.co$/i;

function extraerBearer(req) {
  const coincidencia = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
  return coincidencia ? coincidencia[1] : null;
}

function crearAutenticacionEstudiante(supabaseAuth, repository) {
  return async function autenticarEstudiante(req, res, next) {
    const token = extraerBearer(req);
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Se requiere una sesión de estudiante válida.',
      });
    }
    if (!supabaseAuth || !repository) {
      return res.status(503).json({
        status: 'error',
        message: MENSAJE_IDENTIDAD_NO_DISPONIBLE,
      });
    }
    try {
      const usuario = await supabaseAuth.obtenerUsuario(token);
      if (!usuario) {
        return res.status(401).json({
          status: 'error',
          message: 'La sesión de estudiante no es válida o expiró.',
        });
      }
      const estudiante = await repository.obtenerEstudiantePorAuthId(usuario.id);
      if (!estudiante) {
        return res.status(403).json({
          status: 'error',
          message: 'La cuenta autenticada no está vinculada a un estudiante.',
        });
      }
      req.estudiante = estudiante;
      return next();
    } catch (error) {
      // Se registra solo el tipo de error: el mensaje podría incluir datos del
      // proveedor o del token. El cliente recibe un 503 genérico.
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

function crearIdentidadRouter(repository, supabaseAuth) {
  const router = express.Router();

  router.post('/sesion', async (req, res) => {
    if (!repository || !supabaseAuth) {
      return res.status(503).json({
        status: 'error',
        message: MENSAJE_IDENTIDAD_NO_DISPONIBLE,
      });
    }
    const { correo, contrasena } = req.body || {};
    if (
      typeof correo !== 'string'
      || !CORREO_SINTETICO_RE.test(correo.trim())
      || typeof contrasena !== 'string'
      || contrasena.length < 1
      || contrasena.length > 256
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'Se requiere un correo sintético @utb.edu.co y una contraseña válida.',
      });
    }

    try {
      const sesion = await supabaseAuth.iniciarSesion(correo.trim().toLowerCase(), contrasena);
      const estudiante = await repository.obtenerEstudiantePorAuthId(sesion.usuario.id);
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
          message: 'La cuenta autenticada no está vinculada a un estudiante.',
        });
      }
      logger.error('identity.login_failed', 'Failed to authenticate student with Supabase Auth');
      return res.status(503).json({
        status: 'error',
        message: MENSAJE_IDENTIDAD_NO_DISPONIBLE,
      });
    }
  });

  router.post('/qr', crearAutenticacionEstudiante(supabaseAuth, repository), async (req, res) => {
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
