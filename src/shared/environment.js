const path = require('node:path');
const dotenv = require('dotenv');

const ROOT_ENV_PATH = path.resolve(__dirname, '..', '..', '.env');
const ADMIN_SECRETS = [
  'DB_MIGRATIONS_URL',
  'DB_PROVISIONING_URL',
  'DB_RECONCILIATION_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
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
