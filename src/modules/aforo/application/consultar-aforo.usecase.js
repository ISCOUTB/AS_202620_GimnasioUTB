const { calcularPorcentajeOcupacion } = require('../domain/aforo');

/**
 * Caso de uso "consultar aforo actual".
 *
 * Deja un único punto de entrada al módulo para las lecturas (corrige V2 de
 * docs/contextos-delimitados.md). Desde ADR-0012 devuelve el estado completo
 * del gimnasio, con el porcentaje de ocupación calculado por el dominio.
 *
 * @param {import('./ports/aforo-repository.port').AforoRepositoryPort} aforoRepository
 */
function crearConsultarAforoUseCase(aforoRepository) {
  return async function consultarAforoActual() {
    const estado = await aforoRepository.obtenerEstado();
    return {
      ...estado,
      porcentajeOcupacion: calcularPorcentajeOcupacion(estado.aforoActual, estado.capacidadMaxima),
    };
  };
}

module.exports = { crearConsultarAforoUseCase };
