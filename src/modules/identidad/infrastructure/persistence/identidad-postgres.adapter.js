const crypto = require('node:crypto');
const { promisify } = require('node:util');
const {
  CredencialesInvalidasError,
  SesionEstudianteInvalidaError,
  QrNoValidoError,
} = require('../../application/identidad.errors');

const scrypt = promisify(crypto.scrypt);
const DURACION_SESION_MS = 8 * 60 * 60 * 1000;
const DURACION_QR_MS = 60 * 1000;
const LONGITUD_CLAVE = 64;
const SALT_SIMULADO = Buffer.alloc(16, 0x5a);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function crearHashContrasena(contrasena) {
  const salt = crypto.randomBytes(16);
  const clave = await scrypt(contrasena, salt, LONGITUD_CLAVE);
  return `scrypt$${salt.toString('hex')}$${clave.toString('hex')}`;
}

async function verificarContrasena(contrasena, hashAlmacenado) {
  const [algoritmo, saltHex, claveHex, extra] = String(hashAlmacenado || '').split('$');
  if (
    algoritmo !== 'scrypt'
    || extra !== undefined
    || !/^[0-9a-f]{32}$/i.test(saltHex || '')
    || !/^[0-9a-f]{128}$/i.test(claveHex || '')
  ) {
    await scrypt(contrasena, SALT_SIMULADO, LONGITUD_CLAVE);
    return false;
  }

  const clave = await scrypt(contrasena, Buffer.from(saltHex, 'hex'), LONGITUD_CLAVE);
  return crypto.timingSafeEqual(clave, Buffer.from(claveHex, 'hex'));
}

class IdentidadPostgresAdapter {
  constructor({ pool } = {}) {
    if (!pool || typeof pool.query !== 'function') {
      throw new TypeError('Se requiere un pool PostgreSQL para identidad');
    }
    this.pool = pool;
  }

  async iniciarSesion(codigoEstudiante, contrasena) {
    const { rows } = await this.pool.query(
      `SELECT codigo_estudiante, nombre, password_hash
       FROM estudiantes
       WHERE codigo_estudiante = $1`,
      [codigoEstudiante]
    );
    const estudiante = rows[0];
    const valida = await verificarContrasena(
      contrasena,
      estudiante?.password_hash
    );
    if (!estudiante || !valida) throw new CredencialesInvalidasError();

    const token = crypto.randomBytes(32).toString('base64url');
    const expira = new Date(Date.now() + DURACION_SESION_MS);
    await this.pool.query(
      `INSERT INTO sesiones_estudiantes (token_hash, codigo_estudiante, expires_at)
       VALUES ($1, $2, $3)`,
      [hashToken(token), estudiante.codigo_estudiante, expira]
    );
    return {
      token,
      expiresAt: expira.toISOString(),
      estudiante: {
        codigoEstudiante: estudiante.codigo_estudiante,
        nombre: estudiante.nombre,
      },
    };
  }

  async obtenerEstudianteDeSesion(token) {
    const { rows } = await this.pool.query(
      `SELECT e.codigo_estudiante, e.nombre
       FROM sesiones_estudiantes s
       JOIN estudiantes e USING (codigo_estudiante)
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [hashToken(token)]
    );
    return rows[0] || null;
  }

  async emitirQr(codigoEstudiante) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expira = new Date(Date.now() + DURACION_QR_MS);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT codigo_estudiante FROM estudiantes WHERE codigo_estudiante = $1 FOR UPDATE',
        [codigoEstudiante]
      );
      if (rows.length === 0) throw new SesionEstudianteInvalidaError();
      await client.query(
        `UPDATE qr_credenciales
         SET consumido_en = NOW()
         WHERE codigo_estudiante = $1 AND consumido_en IS NULL`,
        [codigoEstudiante]
      );
      await client.query(
        `INSERT INTO qr_credenciales (token_hash, codigo_estudiante, expires_at)
         VALUES ($1, $2, $3)`,
        [hashToken(token), codigoEstudiante, expira]
      );
      await client.query('COMMIT');
      return { token, expiresAt: expira.toISOString() };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        if (error instanceof Error) error.rollbackError = rollbackError;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async consumirQr(client, token) {
    if (!client || typeof client.query !== 'function') {
      throw new TypeError('El consumo del QR requiere la transacción de aforo');
    }
    const hash = hashToken(token);
    const credencial = await client.query(
      `SELECT codigo_estudiante
       FROM qr_credenciales
       WHERE token_hash = $1 AND consumido_en IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [hash]
    );
    if (credencial.rows.length === 0) throw new QrNoValidoError();

    const codigoEstudiante = credencial.rows[0].codigo_estudiante;
    await client.query(
      'UPDATE qr_credenciales SET consumido_en = NOW() WHERE token_hash = $1',
      [hash]
    );
    const estado = await client.query(
      `INSERT INTO estudiante_estado_acceso (codigo_estudiante, dentro)
       VALUES ($1, TRUE)
       ON CONFLICT (codigo_estudiante)
       DO UPDATE SET dentro = NOT estudiante_estado_acceso.dentro
       RETURNING dentro`,
      [codigoEstudiante]
    );
    return estado.rows[0].dentro ? 'ENTRADA' : 'SALIDA';
  }
}

module.exports = {
  IdentidadPostgresAdapter,
  CredencialesInvalidasError,
  SesionEstudianteInvalidaError,
  QrNoValidoError,
  crearHashContrasena,
};
