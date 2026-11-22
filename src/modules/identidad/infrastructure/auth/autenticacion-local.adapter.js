const crypto = require('node:crypto');
const { AutenticacionEstudiantePort } = require('../../application/ports/autenticacion-estudiante.port');
const { CredencialesInvalidasError } = require('../../application/identidad.errors');
const { verificarContrasena } = require('./contrasena');

const DURACION_SESION_MS = 8 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Autenticación propia (ADR-0011): la contraseña se guarda como hash scrypt
 * en estudiantes.password_hash y la sesión como hash SHA-256 de un token
 * aleatorio en sesiones_estudiantes. El token en claro solo lo tiene la app.
 */
class AutenticacionLocalAdapter extends AutenticacionEstudiantePort {
  constructor({ pool, duracionSesionMs = DURACION_SESION_MS } = {}) {
    super();
    if (!pool || typeof pool.query !== 'function') {
      throw new TypeError('Se requiere un pool PostgreSQL para la autenticación');
    }
    this.pool = pool;
    this.duracionSesionMs = duracionSesionMs;
  }

  async iniciarSesion(correo, contrasena) {
    const { rows } = await this.pool.query(
      `SELECT codigo_estudiante, password_hash
       FROM estudiantes
       WHERE LOWER(correo) = LOWER($1) AND activa`,
      [correo]
    );
    const estudiante = rows[0];
    // Se verifica siempre, exista o no el estudiante, para que el tiempo de
    // respuesta no revele qué correos están registrados.
    const valida = await verificarContrasena(contrasena, estudiante?.password_hash);
    if (!estudiante || !valida) throw new CredencialesInvalidasError();

    const token = crypto.randomBytes(32).toString('base64url');
    const expira = new Date(Date.now() + this.duracionSesionMs);
    await this.pool.query(
      `INSERT INTO sesiones_estudiantes (token_hash, codigo_estudiante, expires_at)
       VALUES ($1, $2, $3)`,
      [hashToken(token), estudiante.codigo_estudiante, expira]
    );
    return {
      token,
      expiresAt: expira.toISOString(),
      usuario: { id: estudiante.codigo_estudiante },
    };
  }

  async obtenerUsuario(token) {
    if (typeof token !== 'string' || token.length === 0) return null;
    const { rows } = await this.pool.query(
      `SELECT codigo_estudiante
       FROM sesiones_estudiantes
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [hashToken(token)]
    );
    return rows[0] ? { id: rows[0].codigo_estudiante } : null;
  }
}

module.exports = { AutenticacionLocalAdapter };
