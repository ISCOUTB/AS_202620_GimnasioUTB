const { AforoRepositoryPort } = require('../../application/ports/aforo-repository.port');

/**
 * Adaptador de persistencia EN MEMORIA para el aforo.
 *
 * IMPORTANTE — estado real de esta entrega: este adaptador guarda el aforo
 * en una variable en RAM mientras el proceso está corriendo (se reinicia en
 * cada arranque del servidor, y no sirve para múltiples instancias).
 *
 * Este adaptador conserva el mismo contrato atómico que el adapter PostgreSQL
 * para que los tests locales no necesiten una base de datos.
 */
class AforoMemoriaAdapter extends AforoRepositoryPort {
  // privado: solo se modifica vía actualizarAforo y modificarEstado (corrige V1)
  #estado;

  constructor({ capacidadMaxima = 30 } = {}) {
    super();
    this.#estado = { aforoActual: 0, capacidadMaxima, abierto: true, motivoCierre: null };
  }

  async obtenerAforoActual() {
    return this.#estado.aforoActual;
  }

  async obtenerEstado() {
    return { ...this.#estado };
  }

  async actualizarAforo(transicionar, despuesDeTransicionar) {
    const nuevoAforo = await transicionar(this.#estado.aforoActual, undefined, { ...this.#estado });
    this.#estado = { ...this.#estado, aforoActual: nuevoAforo };
    if (despuesDeTransicionar) {
      await despuesDeTransicionar(undefined, nuevoAforo, { ...this.#estado });
    }
    return nuevoAforo;
  }

  async modificarEstado(transformar, despuesDeModificar) {
    const cambios = await transformar({ ...this.#estado });
    this.#estado = { ...this.#estado, ...cambios };
    if (despuesDeModificar) await despuesDeModificar(undefined, { ...this.#estado });
    return { ...this.#estado };
  }
}

module.exports = { AforoMemoriaAdapter };
