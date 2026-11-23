const {
  cambiarApertura,
  cambiarCapacidad,
  calcularPorcentajeOcupacion,
} = require('../domain/aforo');

function conPorcentaje(estado) {
  return {
    ...estado,
    porcentajeOcupacion: calcularPorcentajeOcupacion(estado.aforoActual, estado.capacidadMaxima),
  };
}

/**
 * Casos de uso del encargado sobre la configuración del gimnasio (ADR-0012).
 * Las reglas (motivo opcional, límites de capacidad) están en el dominio;
 * aquí solo se aplican de forma atómica a través del puerto.
 *
 * @param {import('./ports/aforo-repository.port').AforoRepositoryPort} aforoRepository
 */
function crearConfigurarGimnasioUseCases(aforoRepository, despuesDeCambiarEstado) {
  return {
    async cambiarApertura(solicitud) {
      const cambios = cambiarApertura(solicitud);
      return conPorcentaje(await aforoRepository.modificarEstado(
        () => cambios,
        despuesDeCambiarEstado
      ));
    },
    async cambiarCapacidad(capacidadMaxima) {
      const cambios = cambiarCapacidad(capacidadMaxima);
      return conPorcentaje(await aforoRepository.modificarEstado(
        () => cambios,
        despuesDeCambiarEstado
      ));
    },
  };
}

module.exports = { crearConfigurarGimnasioUseCases };
