const { aplicarAcceso } = require('../domain/aforo');

/**
 * Crea el caso de uso "registrar acceso", inyectándole el repositorio
 * (puerto) que va a usar. No sabe si ese repositorio guarda en memoria,
 * en PostgreSQL, o en cualquier otro sitio — solo conoce el contrato
 * definido en AforoRepositoryPort.
 *
 * @param {import('../application/ports/aforo-repository.port').AforoRepositoryPort} aforoRepository
 */
function crearRegistrarAccesoUseCase(aforoRepository) {
  return async function registrarAcceso(tipoAcceso) {
    const aforoActual = await aforoRepository.obtenerAforoActual();
    const nuevoAforo = aplicarAcceso(aforoActual, tipoAcceso);
    await aforoRepository.guardarAforo(nuevoAforo);
    return nuevoAforo;
  };
}

module.exports = { crearRegistrarAccesoUseCase };
