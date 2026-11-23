const { aplicarAccesoConEstado } = require('../domain/aforo');
const { estadoDeTransicion } = require('./registrar-acceso.usecase');

/**
 * Registra el acceso de un estudiante identificado (por QR o por cédula).
 *
 * `resolverAcceso(transaccion, credencial)` vive en el módulo de identidad:
 * identifica al estudiante, decide ENTRADA o SALIDA según si estaba dentro y
 * deja su estado individual actualizado. Todo ocurre en la transacción del
 * aforo, así que si el dominio rechaza el ingreso (gimnasio cerrado o
 * capacidad sin confirmar) se revierte también el cambio de identidad y el
 * QR no se gasta (ADR-0008, ADR-0012).
 *
 * @param {import('./ports/aforo-repository.port').AforoRepositoryPort} aforoRepository
 * @param {(transaccion: object, credencial: string) => Promise<{tipoAcceso: string, estudiante?: object}>} resolverAcceso
 */
function crearRegistrarAccesoEstudianteUseCase(
  aforoRepository,
  resolverAcceso,
  despuesDeCambiarAforo
) {
  if (typeof resolverAcceso !== 'function') {
    throw new TypeError('Se requiere una función que identifique al estudiante');
  }

  return async (credencial, opciones = {}) => {
    let resultado;
    const aforoActual = await aforoRepository.actualizarAforo(
      async (aforoAnterior, transaccion, estado) => {
        resultado = await resolverAcceso(transaccion, credencial);
        return aplicarAccesoConEstado(
          estadoDeTransicion(aforoAnterior, estado),
          resultado.tipoAcceso,
          opciones
        );
      },
      despuesDeCambiarAforo
    );
    return { ...resultado, aforoActual };
  };
}

module.exports = { crearRegistrarAccesoEstudianteUseCase };
