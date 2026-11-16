const crypto = require('node:crypto');
const {
  SesionEstudianteInvalidaError,
  CuentaEstudianteInactivaError,
  QrNoValidoError,
} = require('../../application/identidad.errors');

const DURACION_QR_MS = 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

class IdentidadPostgresAdapter {
  constructor({ pool } = {}) {
    if (!pool || typeof pool.query !== 'function') {
      throw new TypeError('Se requiere un pool PostgreSQL para identidad');
    }
    this.pool = pool;
  }

  async obtenerEstudiantePorAuthId(authUserId) {
    const { rows } = await this.pool.query(
      `SELECT e.id, e.auth_user_id, e.codigo_estudiante, e.correo, e.nombre, e.activa,
              COALESCE(s.dentro, FALSE) AS dentro
       FROM estudiantes e
       LEFT JOIN estudiante_estado_acceso s USING (codigo_estudiante)
       WHERE e.auth_user_id = $1`,
      [authUserId]
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
    const estudiante = await client.query(
      `SELECT e.activa, COALESCE(s.dentro, FALSE) AS dentro
       FROM estudiantes e
       LEFT JOIN estudiante_estado_acceso s USING (codigo_estudiante)
       WHERE e.codigo_estudiante = $1
       FOR UPDATE OF e`,
      [codigoEstudiante]
    );
    if (estudiante.rows.length === 0) throw new QrNoValidoError();

    const dentro = estudiante.rows[0].dentro;
    const tipoAcceso = dentro ? 'SALIDA' : 'ENTRADA';
    if (!estudiante.rows[0].activa && tipoAcceso === 'ENTRADA') {
      throw new CuentaEstudianteInactivaError();
    }

    await client.query(
      'UPDATE qr_credenciales SET consumido_en = NOW() WHERE token_hash = $1',
      [hash]
    );
    await client.query(
      `INSERT INTO estudiante_estado_acceso (codigo_estudiante, dentro)
       VALUES ($1, $2)
       ON CONFLICT (codigo_estudiante)
       DO UPDATE SET dentro = EXCLUDED.dentro`,
      [codigoEstudiante, !dentro]
    );
    return tipoAcceso;
  }
}

module.exports = {
  IdentidadPostgresAdapter,
  SesionEstudianteInvalidaError,
  CuentaEstudianteInactivaError,
  QrNoValidoError,
};
