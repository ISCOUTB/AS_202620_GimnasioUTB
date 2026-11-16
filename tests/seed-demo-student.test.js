const test = require('node:test');
const assert = require('node:assert/strict');
const { validarConfiguracionSeed } = require('../scripts/seed-demo-student');

function configuracion(overrides = {}) {
  return {
    NODE_ENV: 'test',
    DEMO_SEED_ENABLED: 'true',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/gym_test',
    DEMO_DATABASE_HOST: 'localhost',
    DEMO_DATABASE_NAME: 'gym_test',
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    DEMO_SUPABASE_PROJECT_REF: 'demo-project-ref',
    DEMO_STUDENT_ID: 'demo-001',
    DEMO_STUDENT_EMAIL: 'demo-001@utb.edu.co',
    DEMO_STUDENT_NAME: 'Estudiante de prueba',
    DEMO_STUDENT_CEDULA: '1000000001',
    DEMO_STUDENT_PASSWORD: 'clave-sintetica-segura',
    ...overrides,
  };
}

test('el seed exige autorización explícita y nunca corre en producción', () => {
  assert.throws(
    () => validarConfiguracionSeed(configuracion({ NODE_ENV: 'production' })),
    /deshabilitada en producción/
  );
  assert.throws(
    () => validarConfiguracionSeed(configuracion({ DEMO_SEED_ENABLED: 'false' })),
    /DEMO_SEED_ENABLED=true/
  );
});

test('el seed valida exactamente la base y el proyecto Supabase de demostración', () => {
  assert.throws(
    () => validarConfiguracionSeed(configuracion({ DEMO_DATABASE_NAME: 'other_test' })),
    /no coincide/
  );
  assert.throws(
    () => validarConfiguracionSeed(configuracion({
      SUPABASE_URL: 'https://otro-proyecto.supabase.co',
    })),
    /no coincide con DEMO_SUPABASE_PROJECT_REF/
  );
  assert.throws(
    () => validarConfiguracionSeed(configuracion({
      DEMO_DATABASE_HOST: 'otro-host',
    })),
    /no coincide/
  );
});

test('el seed acepta solo datos sintéticos con correo UTB de demostración', () => {
  const valid = validarConfiguracionSeed(configuracion());
  assert.equal(valid.correo, 'demo-001@utb.edu.co');
  assert.equal(valid.codigo, 'demo-001');
  assert.throws(
    () => validarConfiguracionSeed(configuracion({
      DEMO_STUDENT_EMAIL: 'cuenta@correo-real.example',
    })),
    /dominio sintético/
  );
  assert.throws(
    () => validarConfiguracionSeed(configuracion({
      DEMO_STUDENT_CEDULA: '12345',
    })),
    /identificador numérico sintético/
  );
});
