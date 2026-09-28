/**
 * Puerto de persistencia del aforo.
 *
 * Define el contrato que el caso de uso necesita, sin saber qué tecnología
 * concreta lo implementa (PostgreSQL, memoria, etc.). Cualquier adaptador
 * de infraestructura debe extender esta clase e implementar sus métodos.
 */
class AforoRepositoryError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AforoRepositoryError';
    if (cause !== undefined) this.cause = cause;
  }
}

class AforoRepositoryPort {
  /** @returns {Promise<number>} el aforo actual */
  async obtenerAforoActual() {
    throw new Error('AforoRepositoryPort.obtenerAforoActual no implementado');
  }

  /**
   * Aplica una transición al estado actual de forma atómica.
   * @param {(aforoActual: number) => number} transicionar
   * @returns {Promise<number>} el nuevo aforo
   */
  async actualizarAforo(transicionar) {
    throw new Error('AforoRepositoryPort.actualizarAforo no implementado');
  }
}

module.exports = { AforoRepositoryPort, AforoRepositoryError };
