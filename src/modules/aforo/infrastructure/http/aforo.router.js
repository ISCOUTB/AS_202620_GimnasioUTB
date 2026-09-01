const express = require('express');

/**
 * Adaptador HTTP del módulo aforo. Traduce peticiones Express hacia el
 * caso de uso — no contiene ninguna regla de negocio, solo parseo de
 * la petición y formato de la respuesta.
 *
 * @param {(tipoAcceso: string) => Promise<number>} registrarAcceso
 * @param {() => Promise<number>} obtenerAforoActual
 */
function crearAforoRouter(registrarAcceso, obtenerAforoActual) {
  const router = express.Router();

  router.post('/acceso', async (req, res) => {
    try {
      const { tipoAcceso } = req.body || {};
      const aforoActual = await registrarAcceso(tipoAcceso);
      res.status(201).json({ status: 'success', data: { aforoActual } });
    } catch (error) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  });

  router.get('/', async (req, res) => {
    const aforoActual = await obtenerAforoActual();
    res.status(200).json({ status: 'success', data: { aforoActual } });
  });

  return router;
}

module.exports = { crearAforoRouter };
