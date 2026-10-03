/**
 * Caso de uso "consultar aforo actual".
 *
 * Hoy es un passthrough al puerto, pero deja un único punto de entrada al
 * módulo para las lecturas (corrige V2 de docs/contextos-delimitados.md):
 * si mañana consultar necesita una regla (p. ej. gimnasio cerrado), vive aquí
 * y no dispersa en server.js.
 *
 * @param {import('./ports/aforo-repository.port').AforoRepositoryPort} aforoRepository
 */
function crearConsultarAforoUseCase(aforoRepository) {
  return async function consultarAforoActual() {
    return aforoRepository.obtenerAforoActual();
  };
}

module.exports = { crearConsultarAforoUseCase };
