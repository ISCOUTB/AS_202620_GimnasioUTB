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
  #aforoActual = 0; // privado: solo se modifica vía actualizarAforo (corrige V1)

  constructor() {
    super();
  }

  async obtenerAforoActual() {
    return this.#aforoActual;
  }

  async actualizarAforo(transicionar) {
    const nuevoAforo = transicionar(this.#aforoActual);
    this.#aforoActual = nuevoAforo;
    return nuevoAforo;
  }
}

module.exports = { AforoMemoriaAdapter };
