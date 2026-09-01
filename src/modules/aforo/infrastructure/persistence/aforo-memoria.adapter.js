const { AforoRepositoryPort } = require('../../application/ports/aforo-repository.port');

/**
 * Adaptador de persistencia EN MEMORIA para el aforo.
 *
 * IMPORTANTE — estado real de esta entrega: este adaptador guarda el aforo
 * en una variable en RAM mientras el proceso está corriendo (se reinicia en
 * cada arranque del servidor, y no sirve para múltiples instancias).
 *
 * El adaptador de PostgreSQL (driver `pg`, con bloqueo por fila para
 * concurrencia — ver docs/aspectos.md, fila S1) es TRABAJO PENDIENTE, no
 * implementado todavía. Este adaptador existe para que el corte vertical
 * sea ejecutable de punta a punta sin depender de tener PostgreSQL
 * levantado, respetando el puerto (AforoRepositoryPort) que también usará
 * el adaptador de PostgreSQL más adelante — cambiar de uno a otro no debería
 * requerir tocar el dominio ni el caso de uso.
 */
class AforoMemoriaAdapter extends AforoRepositoryPort {
  constructor() {
    super();
    this.aforoActual = 0;
  }

  async obtenerAforoActual() {
    return this.aforoActual;
  }

  async guardarAforo(nuevoAforo) {
    this.aforoActual = nuevoAforo;
  }
}

module.exports = { AforoMemoriaAdapter };
