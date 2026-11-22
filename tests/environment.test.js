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
    OPERADOR_TOKEN: 'injected-operator-test-token',
  };
  const loggedMessages = [];
  const originalConsoleError = console.error;

  try {
    fs.writeFileSync(
      envPath,
      [
        'EXISTING_SETTING=file-value',
        'CORS_ORIGINS=http://localhost:8080',
        'DATABASE_URL=postgresql://test:test@localhost:5432/gym_test',
        'OPERADOR_TOKEN=file-operator-test-token',
      ].join('\n')
    );

    console.error = (message) => loggedMessages.push(message);
    try {
      cargarEntorno({ envPath, targetEnv });
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(targetEnv.EXISTING_SETTING, 'injected-value');
    assert.equal(targetEnv.CORS_ORIGINS, 'http://localhost:8080');
    assert.equal(
      targetEnv.OPERADOR_TOKEN,
      'injected-operator-test-token'
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
    DB_ADMIN_URL: 'postgresql://admin:test@localhost:5432/gym_test',
  };

  try {
    fs.writeFileSync(envPath, 'OPERADOR_TOKEN=token-de-prueba\nDEMO_STUDENTS=T1|a@utb.edu.co|A|clave-larga-123\n');
    cargarEntornoRuntime({ envPath, targetEnv });
    assert.equal(targetEnv.DATABASE_URL, 'postgresql://runtime:test@localhost:5432/gym_test');
    assert.equal(targetEnv.OPERADOR_TOKEN, 'token-de-prueba');
    for (const secreto of ['DB_MIGRATIONS_URL', 'DB_ADMIN_URL', 'DEMO_STUDENTS']) {
      assert.equal(secreto in targetEnv, false, `${secreto} no debe llegar a la API`);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
