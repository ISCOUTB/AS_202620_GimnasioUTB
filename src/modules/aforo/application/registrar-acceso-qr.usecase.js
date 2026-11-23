const { crearRegistrarAccesoEstudianteUseCase } = require('./registrar-acceso-estudiante.usecase');

/**
 * Registro por QR: `consumirQr` valida y gasta el QR dentro de la
 * transacción del aforo y devuelve el tipo de acceso, o un objeto con
 * `tipoAcceso` y los datos visibles del estudiante.
 */
function crearRegistrarAccesoQrUseCase(aforoRepository, consumirQr, despuesDeCambiarAforo) {
  if (typeof consumirQr !== 'function') {
    throw new TypeError('Se requiere una función para validar y consumir el QR');
  }
  return crearRegistrarAccesoEstudianteUseCase(aforoRepository, async (transaccion, qr) => {
    const resultado = await consumirQr(transaccion, qr);
    return typeof resultado === 'string' ? { tipoAcceso: resultado } : resultado;
  }, despuesDeCambiarAforo);
}

module.exports = { crearRegistrarAccesoQrUseCase };
