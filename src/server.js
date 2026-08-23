const express = require('express');

/**
 * Composition root del backend de Gimnasio UTB.
 *
 * Esta función NO contiene lógica de negocio. Su único propósito, en esta
 * entrega, es exponer un servidor Express funcional para que el esqueleto
 * arquitectónico sea ejecutable y verificable con una prueba automatizada.
 *
 * La lógica de negocio vivirá en src/modules/<modulo>/domain, sin depender
 * de Express ni de PostgreSQL (ver docs/adr/0001-arquitectura-hexagonal.md).
 */
function createApp() {
  const app = express();

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'gimnasio-utb-backend' });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Gimnasio UTB backend escuchando en el puerto ${port}`);
  });
}

module.exports = { createApp };
