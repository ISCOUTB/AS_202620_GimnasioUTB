const express = require('express');
const { AforoDomainError } = require('../../domain/aforo');
const { AforoRepositoryError } = require('../../application/ports/aforo-repository.port');
const { logger } = require('../../../../shared/logger');

/**
 * Adaptador HTTP del módulo aforo. Traduce peticiones Express hacia los
 * casos de uso — no contiene ninguna regla de negocio, solo parseo de la
 * petición y formato de la respuesta.
 *
 * Los errores del módulo de identidad (QR, cédula, cuenta inactiva) se
 * reconocen por su `code`, sin importar ese módulo (regla M1 de arch:check).
 */

const CEDULA_RE = /^\d{5,12}$/;

const ESTADO_POR_CODIGO = {
  GIMNASIO_CERRADO: 409,
  CAPACIDAD_SUPERADA: 409,
  QR_NOT_VALID: 400,
  STUDENT_INACTIVE: 403,
  STUDENT_NOT_FOUND: 404,
};

function registrarLog(nivel, evento, mensaje) {
  try {
    logger[nivel](evento, mensaje);
  } catch {}
}

function cuerpoDeError(error) {
  const cuerpo = { status: 'error', message: error.message };
  if (error.code === 'GIMNASIO_CERRADO' || error.code === 'CAPACIDAD_SUPERADA') {
    cuerpo.code = error.code;
  }
  if (error.code === 'CAPACIDAD_SUPERADA') {
    cuerpo.data = { aforoActual: error.aforoActual, capacidadMaxima: error.capacidadMaxima };
  }
  return cuerpo;
}

/**
 * Responde un error conocido (dominio o identidad) y devuelve true; si no
 * lo conoce, devuelve false para que el llamador decida.
 */
function responderErrorConocido(res, error) {
  const status = ESTADO_POR_CODIGO[error?.code];
  if (status) {
    registrarLog('warn', 'aforo.access_rejected', `Access operation rejected: ${error.code}`);
    res.status(status).json(cuerpoDeError(error));
    return true;
  }
  if (error instanceof AforoDomainError) {
    registrarLog('warn', 'aforo.access_rejected', 'Access operation rejected');
    res.status(400).json({ status: 'error', message: error.message });
    return true;
  }
  return false;
}

function leerConfirmacion(body) {
  const valor = body?.confirmarExcesoCapacidad;
  if (valor === undefined) return { confirmarExcesoCapacidad: false };
  if (typeof valor !== 'boolean') return null;
  return { confirmarExcesoCapacidad: valor };
}

function rechazar(res, message) {
  return res.status(400).json({ status: 'error', message });
}

function noHabilitado(res, message) {
  return res.status(503).json({ status: 'error', message });
}

/**
 * @param {object} casosDeUso
 * @param {(tipoAcceso: string, opciones?: object) => Promise<number>} casosDeUso.registrarAcceso
 * @param {() => Promise<object>} casosDeUso.consultarAforo
 * @param {{cambiarApertura: Function, cambiarCapacidad: Function}} casosDeUso.configurar
 * @param {Function|null} [casosDeUso.registrarAccesoQr]
 * @param {Function|null} [casosDeUso.registrarAccesoCedula]
 * @param {(tipoAcceso: string, canal: string) => void} [casosDeUso.alRegistrar] métricas y logs
 */
function crearAforoRouter({
  registrarAcceso,
  consultarAforo,
  configurar,
  registrarAccesoQr = null,
  registrarAccesoCedula = null,
  alRegistrar = () => {},
}) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const estado = await consultarAforo();
      return res.status(200).json({ status: 'success', data: estado });
    } catch {
      registrarLog('error', 'aforo.read_failed', 'Failed to read current aforo');
      return res.status(503).json({
        status: 'error',
        message: 'No fue posible consultar el aforo.',
      });
    }
  });

  router.post('/acceso', async (req, res) => {
    const opciones = leerConfirmacion(req.body);
    if (!opciones) return rechazar(res, 'confirmarExcesoCapacidad debe ser true o false.');
    try {
      const { tipoAcceso } = req.body || {};
      const aforoActual = await registrarAcceso(tipoAcceso, opciones);
      alRegistrar(tipoAcceso, 'manual');
      return res.status(201).json({ status: 'success', data: { aforoActual } });
    } catch (error) {
      if (responderErrorConocido(res, error)) return undefined;

      if (error instanceof AforoRepositoryError) {
        registrarLog('error', 'aforo.repository_write_failed', 'Failed to update aforo repository');
        return res.status(503).json({
          status: 'error',
          message: 'No fue posible registrar el acceso.',
        });
      }

      registrarLog('error', 'aforo.access_unexpected_error', 'Unexpected error while registering access');
      return res.status(500).json({
        status: 'error',
        message: 'Error interno al registrar el acceso.',
      });
    }
  });

  /** QR y cédula comparten respuesta y manejo de errores. */
  function rutaAccesoEstudiante({ casoDeUso, campo, valida, mensajeInvalido, canal, mensajeFallo }) {
    return async (req, res) => {
      if (!casoDeUso) {
        return noHabilitado(res, 'El acceso por estudiante no está habilitado en este entorno.');
      }
      const credencial = req.body?.[campo];
      if (!valida(credencial)) return rechazar(res, mensajeInvalido);
      const opciones = leerConfirmacion(req.body);
      if (!opciones) return rechazar(res, 'confirmarExcesoCapacidad debe ser true o false.');
      try {
        const resultado = await casoDeUso(credencial, opciones);
        alRegistrar(resultado.tipoAcceso, canal);
        const data = { tipoAcceso: resultado.tipoAcceso, aforoActual: resultado.aforoActual };
        if (resultado.estudiante) data.estudiante = resultado.estudiante;
        return res.status(201).json({ status: 'success', data });
      } catch (error) {
        if (responderErrorConocido(res, error)) return undefined;
        registrarLog('error', `aforo.${canal}_access_failed`, `Failed to register ${canal} access`);
        return res.status(503).json({ status: 'error', message: mensajeFallo });
      }
    };
  }

  router.post('/acceso-qr', rutaAccesoEstudiante({
    casoDeUso: registrarAccesoQr,
    campo: 'qr',
    valida: (qr) => typeof qr === 'string' && qr.length >= 1 && qr.length <= 256,
    mensajeInvalido: 'Se requiere un código QR válido.',
    canal: 'qr',
    mensajeFallo: 'No fue posible registrar el acceso por QR.',
  }));

  router.post('/acceso-cedula', rutaAccesoEstudiante({
    casoDeUso: registrarAccesoCedula,
    campo: 'cedula',
    valida: (cedula) => typeof cedula === 'string' && CEDULA_RE.test(cedula),
    mensajeInvalido: 'La cédula debe tener entre 5 y 12 dígitos.',
    canal: 'cedula',
    mensajeFallo: 'No fue posible registrar el acceso por cédula.',
  }));

  async function responderConfiguracion(res, operacion) {
    try {
      const estado = await operacion();
      return res.status(200).json({ status: 'success', data: estado });
    } catch (error) {
      if (error instanceof AforoDomainError) {
        return rechazar(res, error.message);
      }
      registrarLog('error', 'aforo.config_update_failed', 'Failed to update gym configuration');
      return res.status(503).json({
        status: 'error',
        message: 'No fue posible guardar el cambio.',
      });
    }
  }

  router.put('/estado', (req, res) => {
    const { abierto, motivoCierre } = req.body || {};
    return responderConfiguracion(res, () => configurar.cambiarApertura({ abierto, motivoCierre }));
  });

  router.put('/capacidad', (req, res) => {
    const { capacidadMaxima } = req.body || {};
    return responderConfiguracion(res, () => configurar.cambiarCapacidad(capacidadMaxima));
  });

  return router;
}

module.exports = { crearAforoRouter, CEDULA_RE };
