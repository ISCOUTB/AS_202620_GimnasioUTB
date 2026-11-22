const { aplicarAccesoConEstado } = require('../domain/aforo');

/**
 * Estado que se usa cuando un adaptador solo entrega el aforo: sin cierre
 * ni límite de capacidad, como antes de ADR-0012.
 */
function estadoDeTransicion(aforoActual, estado) {
  return estado
    ? { ...estado, aforoActual }
    : { aforoActual, abierto: true, capacidadMaxima: null, motivoCierre: null };
}

/**
 * Crea el caso de uso "registrar acceso", inyectándole el repositorio
 * (puerto) que va a usar. No sabe si ese repositorio guarda en memoria,
 * en PostgreSQL, o en cualquier otro sitio — solo conoce el contrato
 * definido en AforoRepositoryPort.
 *
 * @param {import('../application/ports/aforo-repository.port').AforoRepositoryPort} aforoRepository
 */
function crearRegistrarAccesoUseCase(aforoRepository) {
  return async function registrarAcceso(tipoAcceso, opciones = {}) {
    return aforoRepository.actualizarAforo((aforoActual, _transaccion, estado) =>
      aplicarAccesoConEstado(estadoDeTransicion(aforoActual, estado), tipoAcceso, opciones)
    );
  };
}

module.exports = { crearRegistrarAccesoUseCase, estadoDeTransicion };
