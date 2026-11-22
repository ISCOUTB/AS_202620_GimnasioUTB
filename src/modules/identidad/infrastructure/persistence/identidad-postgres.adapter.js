const crypto = require('node:crypto');
const {
  SesionEstudianteInvalidaError,
  CuentaEstudianteInactivaError,
  QrNoValidoError,
  EstudianteNoEncontradoError,
} = require('../../application/identidad.errors');

const DURACION_QR_MS = 60 * 1000;

const SQL_BLOQUEAR_POR_CODIGO = `SELECT e.codigo_estudiante, e.nombre, e.activa,
       COALESCE(s.dentro, FALSE) AS dentro
  FROM estudiantes e
  LEFT JOIN estudiante_estado_acceso s USING (codigo_estudiante)
  WHERE e.codigo_estudiante = $1
  FOR UPDATE OF e`;

const SQL_BLOQUEAR_POR_CEDULA = `SELECT e.codigo_estudiante, e.nombre, e.activa,
       COALESCE(s.dentro, FALSE) AS dentro
  FROM estudiantes e
  LEFT JOIN estudiante_estado_acceso s USING (codigo_estudiante)
  WHERE e.cedula_sintetica = $1
  FOR UPDATE OF e`;

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

  async obtenerEstudiantePorCodigo(codigoEstudiante) {
    const { rows } = await this.pool.query(
      `SELECT e.id, e.codigo_estudiante, e.correo, e.nombre, e.activa,
              COALESCE(s.dentro, FALSE) AS dentro
       FROM estudiantes e
       LEFT JOIN estudiante_estado_acceso s USING (codigo_estudiante)
       WHERE e.codigo_estudiante = $1`,
      [codigoEstudiante]
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
    exigirTransaccion(client);
    const hash = hashToken(token);
    const credencial = await client.query(
      `SELECT codigo_estudiante
       FROM qr_credenciales
       WHERE token_hash = $1 AND consumido_en IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [hash]
    );
    if (credencial.rows.length === 0) throw new QrNoValidoError();

    const resultado = await alternarAcceso(
      client,
      SQL_BLOQUEAR_POR_CODIGO,
      credencial.rows[0].codigo_estudiante,
      QrNoValidoError
    );
    await client.query(
      'UPDATE qr_credenciales SET consumido_en = NOW() WHERE token_hash = $1',
      [hash]
    );
    return resultado;
  }

  /**
   * Registro por cédula, para quien no tiene el celular (ADR-0012). Igual
   * que el QR: decide ENTRADA o SALIDA según si el estudiante está dentro.
   */
  async registrarPorCedula(client, cedula) {
    exigirTransaccion(client);
    return alternarAcceso(client, SQL_BLOQUEAR_POR_CEDULA, cedula, EstudianteNoEncontradoError);
  }

  /** Búsqueda del encargado antes de registrar: nombre, código y si está dentro. */
  async buscarPorCedula(cedula) {
    const { rows } = await this.pool.query(
      `SELECT e.codigo_estudiante, e.nombre, e.activa, COALESCE(s.dentro, FALSE) AS dentro
       FROM estudiantes e
       LEFT JOIN estudiante_estado_acceso s USING (codigo_estudiante)
       WHERE e.cedula_sintetica = $1`,
      [cedula]
    );
    if (rows.length === 0) return null;
    return {
      codigoEstudiante: rows[0].codigo_estudiante,
      nombre: rows[0].nombre,
      activa: rows[0].activa,
      dentro: rows[0].dentro,
    };
  }
}

function exigirTransaccion(client) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('El registro de acceso requiere la transacción de aforo');
  }
}

/**
 * Bloquea al estudiante, invierte su estado (dentro/fuera) y devuelve el
 * tipo de acceso con sus datos visibles. Una cuenta inactiva puede salir,
 * pero no entrar.
 */
async function alternarAcceso(client, sqlBloquear, valor, ErrorNoEncontrado) {
  const estudiante = await client.query(sqlBloquear, [valor]);
  if (estudiante.rows.length === 0) throw new ErrorNoEncontrado();

  const { codigo_estudiante: codigoEstudiante, nombre, activa, dentro } = estudiante.rows[0];
  const tipoAcceso = dentro ? 'SALIDA' : 'ENTRADA';
  if (!activa && tipoAcceso === 'ENTRADA') {
    throw new CuentaEstudianteInactivaError();
  }

  await client.query(
    `INSERT INTO estudiante_estado_acceso (codigo_estudiante, dentro)
     VALUES ($1, $2)
     ON CONFLICT (codigo_estudiante)
     DO UPDATE SET dentro = EXCLUDED.dentro`,
    [codigoEstudiante, !dentro]
  );
  return { tipoAcceso, estudiante: { codigoEstudiante, nombre } };
}

module.exports = {
  IdentidadPostgresAdapter,
  SesionEstudianteInvalidaError,
  CuentaEstudianteInactivaError,
  QrNoValidoError,
  EstudianteNoEncontradoError,
};
