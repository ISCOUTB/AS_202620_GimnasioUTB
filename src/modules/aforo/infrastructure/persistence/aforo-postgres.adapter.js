const { Pool } = require('pg');
const { AforoDomainError } = require('../../domain/aforo');
const {
  AforoRepositoryPort,
  AforoRepositoryError,
} = require('../../application/ports/aforo-repository.port');

function comoErrorDeRepositorio(error) {
  if (error instanceof AforoRepositoryError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AforoRepositoryError(message, error);
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
    let transactionStarted = false;
    let transitionFailed = false;
    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      transactionStarted = true;
      const { rows } = await client.query(
        'SELECT aforo_actual FROM aforo_estado WHERE id = 1 FOR UPDATE'
      );
      if (rows.length === 0) {
        throw new Error('Estado de aforo no inicializado; ejecute npm run db:init');
      }

      let nuevoAforo;
      try {
        nuevoAforo = transicionar(rows[0].aforo_actual);
      } catch (error) {
        transitionFailed = true;
        throw error;
      }
      const result = await client.query(
        'UPDATE aforo_estado SET aforo_actual = $1 WHERE id = 1 RETURNING aforo_actual',
        [nuevoAforo]
      );
      await client.query('COMMIT');
      transactionStarted = false;
      return result.rows[0].aforo_actual;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          if (error instanceof Error) error.rollbackError = rollbackError;
        }
      }
      if (transitionFailed || error instanceof AforoDomainError) throw error;
      throw comoErrorDeRepositorio(error);
    } finally {
      if (client) client.release();
    }
  }

  async cerrar() {
    await this.pool.end();
  }
}

module.exports = { AforoPostgresAdapter };