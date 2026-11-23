const { Pool } = require('pg');
const { crearOpcionesPoolPostgres } = require('../../../../shared/postgres-pool');
const { validarPreferenciasAlerta } = require('../../domain/alerta-aforo');

function serializarPreferencias(row, capacidadMaxima) {
  if (!row) return null;
  const preferencias = {
    habilitada: row.habilitada,
    umbral: row.umbral,
    dias: row.dias,
    horaInicio: row.hora_inicio,
    horaFin: row.hora_fin,
  };
  return {
    ...preferencias,
    compatible: preferencias.umbral === null || preferencias.umbral <= capacidadMaxima,
  };
}

class NotificacionesPostgresAdapter {
  constructor({ pool, connectionString = process.env.DATABASE_URL } = {}) {
    if (!pool && !connectionString) {
      throw new Error('DATABASE_URL es requerida para utilizar PostgreSQL');
    }
    this.pool = pool || new Pool(crearOpcionesPoolPostgres(connectionString));
  }

  async obtenerPreferencias(codigoEstudiante) {
    const { rows } = await this.pool.query(
      `SELECT e.capacidad_maxima, p.habilitada, p.umbral, p.dias, p.hora_inicio, p.hora_fin
       FROM aforo_estado e
       LEFT JOIN preferencias_alerta_aforo p
         ON p.codigo_estudiante = $1
       WHERE e.id = 1`,
      [codigoEstudiante]
    );
    if (rows.length === 0) throw new Error('Estado del gimnasio no inicializado');
    return {
      preferencias: serializarPreferencias(
        rows[0].habilitada === null ? null : rows[0],
        rows[0].capacidad_maxima
      ),
      capacidadMaxima: rows[0].capacidad_maxima,
    };
  }

  async guardarPreferencias(codigoEstudiante, preferencias, despuesDeGuardar) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT aforo_actual, capacidad_maxima, abierto, motivo_cierre
         FROM aforo_estado WHERE id = 1 FOR SHARE`
      );
      if (rows.length === 0) throw new Error('Estado del gimnasio no inicializado');
      validarPreferenciasAlerta(preferencias, rows[0].capacidad_maxima);
      await client.query(
        `INSERT INTO preferencias_alerta_aforo
           (codigo_estudiante, habilitada, umbral, dias, hora_inicio, hora_fin)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (codigo_estudiante) DO UPDATE SET
           habilitada = EXCLUDED.habilitada,
           umbral = EXCLUDED.umbral,
           dias = EXCLUDED.dias,
           hora_inicio = EXCLUDED.hora_inicio,
           hora_fin = EXCLUDED.hora_fin,
           actualizado_en = NOW()`,
        [
          codigoEstudiante,
          preferencias.habilitada,
          preferencias.umbral,
          preferencias.dias,
          preferencias.horaInicio,
          preferencias.horaFin,
        ]
      );
      if (despuesDeGuardar) await despuesDeGuardar(client, rows[0]);
      await client.query('COMMIT');
      return {
        preferencias: {
          ...preferencias,
          compatible: preferencias.umbral === null
            || preferencias.umbral <= rows[0].capacidad_maxima,
        },
        capacidadMaxima: rows[0].capacidad_maxima,
      };
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

  async listarNotificaciones(codigoEstudiante) {
    const { rows } = await this.pool.query(
      `SELECT id, tipo, mensaje, creada_en, leida_en
       FROM notificaciones
       WHERE codigo_estudiante = $1
       ORDER BY creada_en DESC, id DESC
       LIMIT 50`,
      [codigoEstudiante]
    );
    return rows.map((row) => ({
      id: Number(row.id),
      tipo: row.tipo,
      mensaje: row.mensaje,
      creadaEn: row.creada_en.toISOString(),
      leidaEn: row.leida_en ? row.leida_en.toISOString() : null,
    }));
  }

  async evaluarAhora({ fecha, estaEnPeriodoPermitido }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT aforo_actual, capacidad_maxima
         FROM aforo_estado WHERE id = 1 FOR UPDATE`
      );
      if (rows.length === 0) throw new Error('Estado del gimnasio no inicializado');
      await this.evaluarEnTransaccion(client, {
        aforoActual: rows[0].aforo_actual,
        capacidadMaxima: rows[0].capacidad_maxima,
        fecha,
        estaEnPeriodoPermitido,
      });
      await client.query('COMMIT');
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

  async evaluarEnTransaccion(client, { aforoActual, capacidadMaxima, fecha, estaEnPeriodoPermitido }) {
    const { rows: preferencias } = await client.query(
      `SELECT p.codigo_estudiante, p.habilitada, p.umbral, p.dias,
              p.hora_inicio, p.hora_fin,
              COALESCE(s.en_periodo_bajo, FALSE) AS en_periodo_bajo,
              COALESCE(s.notificado, FALSE) AS notificado,
              COALESCE(s.episodio, 1) AS episodio
       FROM preferencias_alerta_aforo p
       LEFT JOIN estado_alerta_aforo s USING (codigo_estudiante)
       ORDER BY p.codigo_estudiante
       FOR UPDATE OF p`
    );

    const estados = [];
    const avisos = [];
    for (const row of preferencias) {
      const umbral = row.umbral;
      const estaBajo = umbral !== null && aforoActual < umbral;
      let episodio = BigInt(row.episodio);
      let notificado = row.notificado;

      if (!estaBajo) {
        if (row.en_periodo_bajo) episodio += 1n;
        notificado = false;
      } else if (row.habilitada && umbral <= capacidadMaxima && !notificado) {
        const permitido = estaEnPeriodoPermitido({
          dias: row.dias,
          horaInicio: row.hora_inicio,
          horaFin: row.hora_fin,
        }, fecha);
        if (permitido) {
          avisos.push([
            row.codigo_estudiante,
            `El gimnasio tiene ${aforoActual} personas, por debajo de tu umbral de ${umbral}.`,
            episodio.toString(),
          ]);
          notificado = true;
        }
      }

      estados.push([
        row.codigo_estudiante,
        estaBajo,
        notificado,
        episodio.toString(),
      ]);
    }

    if (avisos.length > 0) {
      await client.query(
        `INSERT INTO notificaciones (codigo_estudiante, tipo, mensaje, episodio)
         SELECT aviso.codigo_estudiante, 'AFORO_BAJO', aviso.mensaje, aviso.episodio
         FROM UNNEST($1::TEXT[], $2::TEXT[], $3::BIGINT[])
           AS aviso(codigo_estudiante, mensaje, episodio)
         ON CONFLICT (codigo_estudiante, tipo, episodio)
         WHERE tipo = 'AFORO_BAJO' DO NOTHING`,
        [
          avisos.map(([codigo]) => codigo),
          avisos.map(([, mensaje]) => mensaje),
          avisos.map(([, , episodio]) => episodio),
        ]
      );
    }

    if (estados.length > 0) {
      await client.query(
        `INSERT INTO estado_alerta_aforo
           (codigo_estudiante, en_periodo_bajo, notificado, episodio, actualizado_en)
         SELECT estado.codigo_estudiante, estado.en_periodo_bajo,
                estado.notificado, estado.episodio, NOW()
         FROM UNNEST($1::TEXT[], $2::BOOLEAN[], $3::BOOLEAN[], $4::BIGINT[])
           AS estado(codigo_estudiante, en_periodo_bajo, notificado, episodio)
         ON CONFLICT (codigo_estudiante) DO UPDATE SET
           en_periodo_bajo = EXCLUDED.en_periodo_bajo,
           notificado = EXCLUDED.notificado,
           episodio = EXCLUDED.episodio,
           actualizado_en = NOW()`,
        [
          estados.map(([codigo]) => codigo),
          estados.map(([, estaBajo]) => estaBajo),
          estados.map(([, , notificado]) => notificado),
          estados.map(([, , , episodio]) => episodio),
        ]
      );
    }
  }

  async cerrar() {
    await this.pool.end();
  }
}

module.exports = { NotificacionesPostgresAdapter };
