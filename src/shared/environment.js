const path = require('node:path');
const dotenv = require('dotenv');

const ROOT_ENV_PATH = path.resolve(__dirname, '..', '..', '.env');

function cargarEntorno({ envPath = ROOT_ENV_PATH, targetEnv = process.env } = {}) {
  const result = dotenv.config({
    path: envPath,
    processEnv: targetEnv,
    override: false,
    quiet: true,
  });

  if (result.error && result.error.code !== 'ENOENT') {
    throw new Error('No fue posible leer el archivo .env raíz del backend.', {
      cause: result.error,
    });
  }
}

module.exports = { cargarEntorno };
