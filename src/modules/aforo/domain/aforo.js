/**
 * Dominio del módulo aforo — Gimnasio UTB.
 *
 * Reglas de negocio puras. Este archivo NO debe importar Express, el driver
 * de PostgreSQL, ni ninguna otra dependencia de infraestructura. Es la
 * garantía de que estas reglas se puedan probar sin levantar servidor ni
 * base de datos (ver docs/adr/0001-arquitectura-hexagonal.md).
 */

const TIPOS_ACCESO_VALIDOS = ['ENTRADA', 'SALIDA'];
const CAPACIDAD_MINIMA = 1;
const CAPACIDAD_MAXIMA_PERMITIDA = 10000;
const LONGITUD_MAXIMA_MOTIVO = 200;

class AforoDomainError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AforoDomainError';
  }
}

/** Ingreso rechazado porque el encargado cerró el gimnasio (ADR-0012). */
class GimnasioCerradoError extends AforoDomainError {
  constructor(motivoCierre) {
    super(
      motivoCierre
        ? `El gimnasio está cerrado (${motivoCierre}). Solo se pueden registrar salidas.`
        : 'El gimnasio está cerrado. Solo se pueden registrar salidas.'
    );
    this.name = 'GimnasioCerradoError';
    this.code = 'GIMNASIO_CERRADO';
  }
}

/**
 * El ingreso superaría la capacidad máxima y el encargado todavía no lo
 * confirmó. No es un bloqueo: repetir la solicitud con la confirmación
 * registra el ingreso (ADR-0012).
 */
class CapacidadSuperadaError extends AforoDomainError {
  constructor(aforoActual, capacidadMaxima) {
    super(
      `El gimnasio ya tiene ${aforoActual} de ${capacidadMaxima} personas. `
      + 'Confirma para registrar el ingreso de todas formas.'
    );
    this.name = 'CapacidadSuperadaError';
    this.code = 'CAPACIDAD_SUPERADA';
    this.aforoActual = aforoActual;
    this.capacidadMaxima = capacidadMaxima;
  }
}

/**
 * Calcula el nuevo aforo tras aplicar un evento de entrada o salida.
 *
 * @param {number} aforoActual - aforo antes del evento (siempre >= 0)
 * @param {'ENTRADA'|'SALIDA'} tipoAcceso
 * @returns {number} nuevo aforo tras aplicar el evento
 * @throws {Error} si el tipo de acceso es inválido o si una SALIDA dejaría el aforo negativo
 */
function aplicarAcceso(aforoActual, tipoAcceso) {
  if (!TIPOS_ACCESO_VALIDOS.includes(tipoAcceso)) {
    throw new AforoDomainError(`tipoAcceso inválido: "${tipoAcceso}". Debe ser ENTRADA o SALIDA.`);
  }

  if (tipoAcceso === 'ENTRADA') {
    return aforoActual + 1;
  }

  // SALIDA
  if (aforoActual <= 0) {
    throw new AforoDomainError('No se puede registrar una salida: el aforo ya está en 0.');
  }
  return aforoActual - 1;
}

/**
 * Igual que aplicarAcceso, pero respeta el estado del gimnasio:
 * - cerrado: se rechazan las entradas; las salidas siempre se permiten,
 *   porque quien ya está dentro sigue registrado hasta que sale;
 * - una entrada que supera la capacidad exige confirmación del encargado.
 *
 * @param {{aforoActual: number, abierto?: boolean, capacidadMaxima?: number|null,
 *          motivoCierre?: string|null}} estado
 * @param {'ENTRADA'|'SALIDA'} tipoAcceso
 * @param {{confirmarExcesoCapacidad?: boolean}} [opciones]
 * @returns {number} nuevo aforo
 */
function aplicarAccesoConEstado(estado, tipoAcceso, { confirmarExcesoCapacidad = false } = {}) {
  if (tipoAcceso === 'ENTRADA') {
    if (estado.abierto === false) {
      throw new GimnasioCerradoError(estado.motivoCierre);
    }
    const capacidad = estado.capacidadMaxima;
    if (Number.isInteger(capacidad) && estado.aforoActual + 1 > capacidad && !confirmarExcesoCapacidad) {
      throw new CapacidadSuperadaError(estado.aforoActual, capacidad);
    }
  }
  return aplicarAcceso(estado.aforoActual, tipoAcceso);
}

/**
 * Porcentaje entero de ocupación. Puede pasar de 100 cuando el encargado
 * confirmó ingresos por encima de la capacidad.
 */
function calcularPorcentajeOcupacion(aforoActual, capacidadMaxima) {
  if (!Number.isInteger(capacidadMaxima) || capacidadMaxima <= 0) return null;
  return Math.round((aforoActual * 100) / capacidadMaxima);
}

/**
 * Abre o cierra el gimnasio. El motivo es opcional al cerrar y se borra al
 * abrir. Cerrar no saca a nadie: el aforo no cambia.
 *
 * @returns {{abierto: boolean, motivoCierre: string|null}}
 */
function cambiarApertura({ abierto, motivoCierre } = {}) {
  if (typeof abierto !== 'boolean') {
    throw new AforoDomainError('Indica si el gimnasio queda abierto (true) o cerrado (false).');
  }
  if (abierto) return { abierto: true, motivoCierre: null };

  if (motivoCierre !== undefined && motivoCierre !== null && typeof motivoCierre !== 'string') {
    throw new AforoDomainError('El motivo del cierre debe ser un texto.');
  }
  const motivo = (motivoCierre || '').trim();
  if (motivo.length > LONGITUD_MAXIMA_MOTIVO) {
    throw new AforoDomainError(
      `El motivo del cierre admite como máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`
    );
  }
  return { abierto: false, motivoCierre: motivo || null };
}

/**
 * Valida la nueva capacidad máxima. Puede quedar por debajo del aforo
 * actual: nadie sale por eso, y la app muestra la capacidad superada.
 */
function cambiarCapacidad(capacidadMaxima) {
  if (
    !Number.isInteger(capacidadMaxima)
    || capacidadMaxima < CAPACIDAD_MINIMA
    || capacidadMaxima > CAPACIDAD_MAXIMA_PERMITIDA
  ) {
    throw new AforoDomainError(
      `La capacidad máxima debe ser un número entero entre ${CAPACIDAD_MINIMA} y ${CAPACIDAD_MAXIMA_PERMITIDA}.`
    );
  }
  return { capacidadMaxima };
}

module.exports = {
  aplicarAcceso,
  aplicarAccesoConEstado,
  calcularPorcentajeOcupacion,
  cambiarApertura,
  cambiarCapacidad,
  TIPOS_ACCESO_VALIDOS,
  CAPACIDAD_MINIMA,
  CAPACIDAD_MAXIMA_PERMITIDA,
  LONGITUD_MAXIMA_MOTIVO,
  AforoDomainError,
  GimnasioCerradoError,
  CapacidadSuperadaError,
};
