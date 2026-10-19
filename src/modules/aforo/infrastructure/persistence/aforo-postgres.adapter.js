const { Pool } = require('pg');
const {
  AforoRepositoryPort,
  AforoRepositoryError,
} = require('../../application/ports/aforo-repository.port');

function comoErrorDeRepositorio(error) {
  if (error instanceof AforoRepositoryError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AforoRepositoryError(message, error);
}

/**
 * Ejecuta una consulta y traduce cualquier fallo de PostgreSQL a
 * AforoRepositoryError, para que el router responda 503.
 */
async function ejecutar(client, sql, params) {
  try {
    return await client.query(sql, params);
  } catch (error) {
    throw comoErrorDeRepositorio(error);
  }
}

/** Intenta ROLLBACK sin ocultar el error original que causó el fallo. */
async function deshacer(client, error) {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    if (error instanceof Error) error.rollbackError = rollbackError;
  }
}

/**
 * Cuerpo de la transacción ya iniciada: bloquea la fila, aplica la transición
 * del dominio y confirma. Los errores de la transición (p. ej. AforoDomainError)
 * se propagan sin envolver; los de PostgreSQL ya llegan como AforoRepositoryError.
 */
async function transicionarEnTransaccion(client, transicionar) {
  try {
    const { rows } = await ejecutar(
      client,
      'SELECT aforo_actual FROM aforo_estado WHERE id = 1 FOR UPDATE'
    );
    if (rows.length === 0) {
      throw new AforoRepositoryError('Estado de aforo no inicializado; ejecute npm run db:init');
    }

    const nuevoAforo = transicionar(rows[0].aforo_actual);
    const result = await ejecutar(
      client,
      'UPDATE aforo_estado SET aforo_actual = $1 WHERE id = 1 RETURNING aforo_actual',
      [nuevoAforo]
    );
    await ejecutar(client, 'COMMIT');
    return result.rows[0].aforo_actual;
  } catch (error) {
    await deshacer(client, error);
    throw error;
  }
}

class AforoPostgresAdapter extends AforoRepositoryPort {
  constructor({ connectionString = process.env.DATABASE_URL, pool, schema } = {}) {
    super();
    if (!connectionString && !pool) {
      throw new Error('DATABASE_URL es requerida para utilizar PostgreSQL');
    }
    if (schema && !/^[a-z_][a-z0-9_]*$/i.test(schema)) {
      throw new Error('Nombre de esquema PostgreSQL inválido');
    }

    this.pool = pool || new Pool({
      connectionString,
      ...(schema ? { options: `-c search_path=${schema}` } : {}),
    });
  }

  async obtenerAforoActual() {
    try {
      const { rows } = await this.pool.query(
        'SELECT aforo_actual FROM aforo_estado WHERE id = 1'
      );
      if (rows.length === 0) {
        throw new Error('Estado de aforo no inicializado; ejecute npm run db:init');
      }
      return rows[0].aforo_actual;
    } catch (error) {
      throw comoErrorDeRepositorio(error);
    }
  }

  async actualizarAforo(transicionar) {
    if (typeof transicionar !== 'function') {
      throw new TypeError('La transición del aforo debe ser una función');
    }

    let client;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw comoErrorDeRepositorio(error);
    }

    try {
      await ejecutar(client, 'BEGIN');
      return await transicionarEnTransaccion(client, transicionar);
    } finally {
      client.release();
    }
  }

  async cerrar() {
    await this.pool.end();
  }
}

module.exports = { AforoPostgresAdapter };