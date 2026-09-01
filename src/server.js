const express = require('express');
const { crearAforoRouter } = require('./modules/aforo/infrastructure/http/aforo.router');
const { AforoMemoriaAdapter } = require('./modules/aforo/infrastructure/persistence/aforo-memoria.adapter');
const { crearRegistrarAccesoUseCase } = require('./modules/aforo/application/registrar-acceso.usecase');


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
