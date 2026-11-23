const { estaEnPeriodoPermitido } = require('../domain/alerta-aforo');

function crearEvaluadorAlertasAforo({ repository, now = () => new Date() }) {
  if (!repository || typeof repository.evaluarEnTransaccion !== 'function') {
    throw new TypeError('Se requiere un repositorio de notificaciones');
  }

  return {
    async alCambiarAforo(transaccion, aforoActual, estado) {
      return repository.evaluarEnTransaccion(transaccion, {
        aforoActual,
        capacidadMaxima: estado.capacidadMaxima,
        fecha: now(),
        estaEnPeriodoPermitido,
      });
    },

    async evaluarAhora() {
      return repository.evaluarAhora({ fecha: now(), estaEnPeriodoPermitido });
    },
  };
}

module.exports = { crearEvaluadorAlertasAforo };
