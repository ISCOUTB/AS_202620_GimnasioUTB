const express = require('express');
const { crearAforoRouter } = require('./modules/aforo/infrastructure/http/aforo.router');
const { AforoMemoriaAdapter } = require('./modules/aforo/infrastructure/persistence/aforo-memoria.adapter');
const { crearRegistrarAccesoUseCase } = require('./modules/aforo/application/registrar-acceso.usecase');

/**
 * Composition root del backend de Gimnasio UTB.
 *
 * Este es el ÚNICO lugar del proyecto donde se decide qué adaptador
 * concreto usar. El dominio y el caso de uso no saben que existe
 * Express ni que el adaptador de persistencia hoy es en memoria — ver
 * docs/adr/0001-arquitectura-hexagonal.md.
 *
 * Estado de esta entrega: corte vertical ejecutable con persistencia EN
 * MEMORIA. El adaptador de PostgreSQL queda como trabajo pendiente
 * (ver docs/aspectos.md, fila S1).
 */
function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'gimnasio-utb-backend' });
  });

  // --- Composición del módulo aforo (corte vertical) ---
  const aforoRepository = new AforoMemoriaAdapter();
  const registrarAcceso = crearRegistrarAccesoUseCase(aforoRepository);
  const obtenerAforoActual = () => aforoRepository.obtenerAforoActual();

  app.use('/api/v1/aforo', crearAforoRouter(registrarAcceso, obtenerAforoActual));

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
