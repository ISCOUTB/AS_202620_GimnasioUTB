const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  cargarEntorno,
  cargarEntornoRuntime,
} = require('../src/shared/environment');

test('carga variables del archivo sin sobrescribir el entorno existente', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gimnasio-env-test-'));
  const envPath = path.join(directory, '.env');
  const targetEnv = {
    EXISTING_SETTING: 'injected-value',
    SUPABASE_PUBLISHABLE_KEY: 'injected-publishable-test-key',
  };
  const loggedMessages = [];
  const originalConsoleError = console.error;

  try {
    fs.writeFileSync(
      envPath,
      [
        'EXISTING_SETTING=file-value',
        'SUPABASE_URL=https://test-project.supabase.co',
        'DATABASE_URL=postgresql://test:test@localhost:5432/gym_test',
        'SUPABASE_PUBLISHABLE_KEY=file-publishable-test-key',
      ].join('\n')
    );

    console.error = (message) => loggedMessages.push(message);
    try {
      cargarEntorno({ envPath, targetEnv });
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(targetEnv.EXISTING_SETTING, 'injected-value');
    assert.equal(targetEnv.SUPABASE_URL, 'https://test-project.supabase.co');
    assert.equal(
      targetEnv.SUPABASE_PUBLISHABLE_KEY,
      'injected-publishable-test-key'
    );
    assert.equal(
      targetEnv.DATABASE_URL,
      'postgresql://test:test@localhost:5432/gym_test'
    );
    assert.deepEqual(loggedMessages, []);
  } finally {
    console.error = originalConsoleError;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('permite arrancar con variables inyectadas cuando no existe .env', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gimnasio-env-test-'));

  try {
    assert.doesNotThrow(() => cargarEntorno({
      envPath: path.join(directory, '.env'),
      targetEnv: {},
    }));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('reporta de forma genérica los errores de lectura de .env', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gimnasio-env-test-'));

  try {
    assert.throws(
      () => cargarEntorno({ envPath: directory, targetEnv: {} }),
      { message: 'No fue posible leer el archivo .env raíz del backend.' }
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('el entorno runtime elimina credenciales administrativas tras cargar configuración', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gimnasio-runtime-env-test-'));
  const envPath = path.join(directory, '.env');
  const targetEnv = {
    DATABASE_URL: 'postgresql://runtime:test@localhost:5432/gym_test',
    DB_MIGRATIONS_URL: 'postgresql://migrator:test@localhost:5432/gym_test',
    DB_PROVISIONING_URL: 'postgresql://provisioner:test@localhost:5432/gym_test',
    DB_RECONCILIATION_URL: 'postgresql://auditor:test@localhost:5432/gym_test',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-secret',
  };

  try {
    fs.writeFileSync(
      envPath,
      'SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_PUBLISHABLE_KEY=test-publishable-key\n'
    );
    cargarEntornoRuntime({ envPath, targetEnv });
    assert.equal(targetEnv.DATABASE_URL, 'postgresql://runtime:test@localhost:5432/gym_test');
    assert.equal(targetEnv.SUPABASE_URL, 'http://127.0.0.1:54321');
    assert.equal(targetEnv.SUPABASE_PUBLISHABLE_KEY, 'test-publishable-key');
    assert.equal('DB_MIGRATIONS_URL' in targetEnv, false);
    assert.equal('DB_PROVISIONING_URL' in targetEnv, false);
    assert.equal('DB_RECONCILIATION_URL' in targetEnv, false);
    assert.equal('SUPABASE_SERVICE_ROLE_KEY' in targetEnv, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
