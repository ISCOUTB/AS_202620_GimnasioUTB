const { Pool } = require('pg');
const { crearOpcionesPoolPostgres } = require('../../../../shared/postgres-pool');
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

const SQL_ESTADO = `SELECT aforo_actual, capacidad_maxima, abierto, motivo_cierre
  FROM aforo_estado WHERE id = 1`;

function estadoDesdeFila(fila) {
  return {
    aforoActual: fila.aforo_actual,
    capacidadMaxima: fila.capacidad_maxima,
    abierto: fila.abierto,
    motivoCierre: fila.motivo_cierre,
  };
}

/** Lee y bloquea la fila única del aforo dentro de la transacción en curso. */
async function bloquearEstado(client) {
  const { rows } = await ejecutar(client, `${SQL_ESTADO} FOR UPDATE`);
  if (rows.length === 0) {
    throw new AforoRepositoryError('Estado de aforo no inicializado; ejecute npm run db:prepare');
  }
  return estadoDesdeFila(rows[0]);
}

/**
 * Cuerpo de la transacción ya iniciada: bloquea la fila, aplica la transición
 * del dominio y confirma. Los errores de la transición (p. ej. AforoDomainError)
 * se propagan sin envolver; los de PostgreSQL ya llegan como AforoRepositoryError.
 */
async function transicionarEnTransaccion(client, transicionar, despuesDeTransicionar) {
  const estado = await bloquearEstado(client);
  const nuevoAforo = await transicionar(estado.aforoActual, client, estado);
  const result = await ejecutar(
    client,
    'UPDATE aforo_estado SET aforo_actual = $1 WHERE id = 1 RETURNING aforo_actual',
    [nuevoAforo]
  );
  if (despuesDeTransicionar) {
    await despuesDeTransicionar(client, result.rows[0].aforo_actual, {
      ...estado,
      aforoActual: result.rows[0].aforo_actual,
    });
  }
  return result.rows[0].aforo_actual;
}

async function modificarEnTransaccion(client, transformar, despuesDeModificar) {
  const estado = await bloquearEstado(client);
  const nuevo = { ...estado, ...(await transformar(estado)) };
  const { rows } = await ejecutar(
    client,
    `UPDATE aforo_estado
     SET capacidad_maxima = $1, abierto = $2, motivo_cierre = $3
     WHERE id = 1
     RETURNING aforo_actual, capacidad_maxima, abierto, motivo_cierre`,
    [nuevo.capacidadMaxima, nuevo.abierto, nuevo.motivoCierre]
  );
  const estadoActualizado = estadoDesdeFila(rows[0]);
  if (despuesDeModificar) await despuesDeModificar(client, estadoActualizado);
  return estadoActualizado;
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

    this.pool = pool || new Pool(crearOpcionesPoolPostgres(
      connectionString,
      schema ? { options: `-c search_path=${schema}` } : {}
    ));
  }

  async obtenerAforoActual() {
    return (await this.obtenerEstado()).aforoActual;
  }

  async obtenerEstado() {
    try {
      const { rows } = await this.pool.query(SQL_ESTADO);
      if (rows.length === 0) {
        throw new Error('Estado de aforo no inicializado; ejecute npm run db:prepare');
      }
      return estadoDesdeFila(rows[0]);
    } catch (error) {
      throw comoErrorDeRepositorio(error);
    }
  }

  async actualizarAforo(transicionar, despuesDeTransicionar) {
    if (typeof transicionar !== 'function') {
      throw new TypeError('La transición del aforo debe ser una función');
    }
    return this.#enTransaccion((client) =>
      transicionarEnTransaccion(client, transicionar, despuesDeTransicionar)
    );
  }

  async modificarEstado(transformar, despuesDeModificar) {
    if (typeof transformar !== 'function') {
      throw new TypeError('El cambio de estado debe ser una función');
    }
    return this.#enTransaccion((client) =>
      modificarEnTransaccion(client, transformar, despuesDeModificar)
    );
  }

  /** BEGIN, cuerpo y COMMIT; ante cualquier error, ROLLBACK y se propaga. */
  async #enTransaccion(cuerpo) {
    let client;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw comoErrorDeRepositorio(error);
    }

    try {
      await ejecutar(client, 'BEGIN');
      const resultado = await cuerpo(client);
      await ejecutar(client, 'COMMIT');
      return resultado;
    } catch (error) {
      await deshacer(client, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async cerrar() {
    await this.pool.end();
  }
}

module.exports = { AforoPostgresAdapter };