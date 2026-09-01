/**
 * Dominio del módulo aforo — Gimnasio UTB.
 *
 * Reglas de negocio puras. Este archivo NO debe importar Express, el driver
 * de PostgreSQL, ni ninguna otra dependencia de infraestructura. Es la
 * garantía de que estas reglas se puedan probar sin levantar servidor ni
 * base de datos (ver docs/adr/0001-arquitectura-hexagonal.md).
 */

const TIPOS_ACCESO_VALIDOS = ['ENTRADA', 'SALIDA'];

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
    throw new Error(`tipoAcceso inválido: "${tipoAcceso}". Debe ser ENTRADA o SALIDA.`);
  }

  if (tipoAcceso === 'ENTRADA') {
    return aforoActual + 1;
  }

  // SALIDA
  if (aforoActual <= 0) {
    throw new Error('No se puede registrar una salida: el aforo ya está en 0.');
  }
  return aforoActual - 1;
}

module.exports = { aplicarAcceso, TIPOS_ACCESO_VALIDOS };
