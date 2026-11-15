const { aplicarAcceso } = require('../domain/aforo');

function crearRegistrarAccesoQrUseCase(aforoRepository, consumirQr) {
  if (typeof consumirQr !== 'function') {
    throw new TypeError('Se requiere una función para validar y consumir el QR');
  }

  return async (qr) => {
    let tipoAcceso;
    const aforoActual = await aforoRepository.actualizarAforo(
      async (aforoAnterior, transaccion) => {
        tipoAcceso = await consumirQr(transaccion, qr);
        return aplicarAcceso(aforoAnterior, tipoAcceso);
      }
    );
    return { tipoAcceso, aforoActual };
  };
}

module.exports = { crearRegistrarAccesoQrUseCase };
