const crypto = require('node:crypto');

/**
 * Middlewares HTTP transversales de seguridad (S13, ADR-0007).
 *
 * Viven en src/shared porque no conocen ningún módulo de dominio: solo
 * trabajan con cabeceras HTTP. El composition root (src/server.js) decide
 * a qué rutas se aplican.
 */

const LONGITUD_MINIMA_TOKEN = 32;

/**
 * Cabeceras defensivas para una API JSON que no sirve HTML (mitiga M5).
 */
function cabecerasSeguridad(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
}

/**
 * CORS con lista blanca de orígenes (mitiga M2 y habilita Flutter web).
 * Si el origen no está en la lista, no se envía ninguna cabecera CORS y el
 * navegador bloquea la respuesta. Las apps nativas (Android, Windows) no
 * envían Origin y no se ven afectadas.
 *
 * @param {{ origenesPermitidos: string[] }} opciones
 */
function crearCors({ origenesPermitidos = [] } = {}) {
  const permitidos = new Set(origenesPermitidos);

  return function cors(req, res, next) {
    const origen = req.headers.origin;
    if (origen) res.vary('Origin');

    if (origen && permitidos.has(origen)) {
      res.setHeader('Access-Control-Allow-Origin', origen);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '600');
    }

    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  };
}

/** Lee "a,b , c" desde una variable de entorno y devuelve ['a','b','c']. */
function parsearOrigenes(valor) {
  return String(valor || '')
    .split(',')
    .map((origen) => origen.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function hash(valor) {
  return crypto.createHash('sha256').update(String(valor)).digest();
}

/**
 * Exige `Authorization: Bearer <token>` en las rutas de escritura (mitiga M1).
 *
 * - Falla cerrado: si el token no está configurado o es corto, la escritura
 *   responde 503 en lugar de quedar abierta.
 * - Compara hashes SHA-256 con timingSafeEqual para no filtrar el token por
 *   diferencias de tiempo.
 * - Nunca registra el token ni la cabecera recibida.
 *
 * @param {{ token?: string, logger?: { warn: Function, error: Function } }} opciones
 */
function crearAutenticacionOperador({ token, logger } = {}) {
  const configurado = typeof token === 'string' && token.length >= LONGITUD_MINIMA_TOKEN;
  const hashEsperado = configurado ? hash(token) : null;

  if (!configurado) {
    try {
      logger?.error(
        'auth.operator_token_missing',
        `OPERADOR_TOKEN ausente o menor a ${LONGITUD_MINIMA_TOKEN} caracteres; el registro de accesos queda deshabilitado`
      );
    } catch {}
  }

  return function autenticarOperador(req, res, next) {
    if (!configurado) {
      return res.status(503).json({
        status: 'error',
        message: 'El registro de accesos no está habilitado en este entorno.',
      });
    }

    const cabecera = req.headers.authorization || '';
    const [esquema, recibido] = cabecera.split(' ');
    const valido = esquema === 'Bearer'
      && typeof recibido === 'string'
      && recibido.length > 0
      && crypto.timingSafeEqual(hash(recibido), hashEsperado);

    if (!valido) {
      try {
        logger?.warn('auth.operator_rejected', 'Write request without valid operator token');
      } catch {}
      res.setHeader('WWW-Authenticate', 'Bearer realm="gimnasio-utb"');
      return res.status(401).json({
        status: 'error',
        message: 'Se requiere un token de operador válido.',
      });
    }

    return next();
  };
}

module.exports = {
  cabecerasSeguridad,
  crearCors,
  parsearOrigenes,
  crearAutenticacionOperador,
  LONGITUD_MINIMA_TOKEN,
};
