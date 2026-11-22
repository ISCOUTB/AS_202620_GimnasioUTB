/**
 * Puerto de persistencia del aforo.
 *
 * Define el contrato que el caso de uso necesita, sin saber qué tecnología
 * concreta lo implementa (PostgreSQL, memoria, etc.). Cualquier adaptador
 * de infraestructura debe extender esta clase e implementar sus métodos.
 *
 * Estado del gimnasio (ADR-0012):
 * {aforoActual: number, capacidadMaxima: number, abierto: boolean, motivoCierre: string|null}
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

  /** @returns {Promise<{aforoActual: number, capacidadMaxima: number, abierto: boolean, motivoCierre: string|null}>} */
  async obtenerEstado() {
    throw new Error('AforoRepositoryPort.obtenerEstado no implementado');
  }

  /**
   * Aplica una transición al aforo de forma atómica. La transición recibe
   * el aforo, la transacción en curso (si la hay) y el estado completo
   * bloqueado en esa misma transacción.
   * @param {(aforoActual: number, transaccion?: object, estado?: object) => number | Promise<number>} transicionar
   * @returns {Promise<number>} el nuevo aforo
   */
  async actualizarAforo(transicionar) {
    throw new Error('AforoRepositoryPort.actualizarAforo no implementado');
  }

  /**
   * Cambia la configuración del gimnasio (apertura, motivo, capacidad) de
   * forma atómica. La función recibe el estado actual y devuelve solo los
   * campos que cambian.
   * @param {(estado: object) => {abierto?: boolean, motivoCierre?: string|null, capacidadMaxima?: number}} transformar
   * @returns {Promise<object>} el estado resultante
   */
  async modificarEstado(transformar) {
    throw new Error('AforoRepositoryPort.modificarEstado no implementado');
  }
}

module.exports = { AforoRepositoryPort, AforoRepositoryError };
