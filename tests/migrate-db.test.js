const test = require('node:test');
const assert = require('node:assert/strict');
const { validarConfiguracion } = require('../scripts/migrate-db');

function env(overrides = {}) {
  return {
    DATABASE_URL: 'postgresql://user:pass@db.example.test:5432/gym_test',
    DB_MIGRATIONS_ENABLED: 'true',
    DB_MIGRATIONS_HOST: 'db.example.test',
    DB_MIGRATIONS_TARGET: 'gym_test',
    ...overrides,
  };
}

test('el runner de migraciones requiere habilitación y destino explícitos', () => {
  assert.throws(
    () => validarConfiguracion(env({ DB_MIGRATIONS_ENABLED: 'false' })),
    /DB_MIGRATIONS_ENABLED=true/
  );
  assert.throws(
    () => validarConfiguracion(env({ DB_MIGRATIONS_TARGET: 'production' })),
    /no coinciden/
  );
  assert.throws(
    () => validarConfiguracion(env({ DB_MIGRATIONS_HOST: 'other.example.test' })),
    /no coinciden/
  );
  assert.deepEqual(validarConfiguracion(env()), {
    databaseName: 'gym_test',
    databaseHost: 'db.example.test',
  });
});
