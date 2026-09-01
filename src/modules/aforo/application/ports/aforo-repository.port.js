/**
 * Puerto de persistencia del aforo.
 *
 * Define el contrato que el caso de uso necesita, sin saber qué tecnología
 * concreta lo implementa (PostgreSQL, memoria, etc.). Cualquier adaptador
 * de infraestructura debe extender esta clase e implementar sus métodos.
 */
class AforoRepositoryPort {
  /** @returns {Promise<number>} el aforo actual */
  async obtenerAforoActual() {
    throw new Error('AforoRepositoryPort.obtenerAforoActual no implementado');
  }

  /** @param {number} nuevoAforo */
  async guardarAforo(nuevoAforo) {
    throw new Error('AforoRepositoryPort.guardarAforo no implementado');
  }
}

module.exports = { AforoRepositoryPort };
