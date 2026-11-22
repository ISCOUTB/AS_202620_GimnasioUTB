const path = require('node:path');
const dotenv = require('dotenv');

const ROOT_ENV_PATH = path.resolve(__dirname, '..', '..', '.env');
// Credenciales administrativas que la API en ejecución nunca debe tener.
const ADMIN_SECRETS = [
  'DB_MIGRATIONS_URL',
  'DB_ADMIN_URL',
  'DEMO_STUDENTS',
];

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

function cargarEntornoRuntime(options = {}) {
  const targetEnv = options.targetEnv || process.env;
  cargarEntorno({ ...options, targetEnv });
  for (const name of ADMIN_SECRETS) delete targetEnv[name];
}

module.exports = { cargarEntorno, cargarEntornoRuntime };
