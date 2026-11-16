const test = require('node:test');
const assert = require('node:assert/strict');
const { validarConfiguracionSeed } = require('../scripts/seed-demo-student');

function configuracion(overrides = {}) {
  return {
    NODE_ENV: 'test',
    DB_PROVISIONING_ENABLED: 'true',
    DB_RECONCILIATION_ENABLED: 'true',
    DB_PROVISIONING_URL: 'postgresql://provisioner:provisioner-test@localhost:5432/gym_test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/gym_test',
    DB_MIGRATIONS_URL: 'postgresql://migrator:migrator-test@localhost:5432/gym_test',
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
    () => validarConfiguracionSeed(configuracion({ DB_PROVISIONING_ENABLED: 'false' })),
    /DB_PROVISIONING_ENABLED=true/
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
    /no coinciden con DEMO_SUPABASE_PROJECT_REF/
  );
  assert.throws(
    () => validarConfiguracionSeed(configuracion({
      DEMO_DATABASE_HOST: 'otro-host',
    })),
    /no coincide/
  );
});

test('el seed exige DB_PROVISIONING_URL separada y nunca usa DATABASE_URL como fallback', () => {
  const config = validarConfiguracionSeed(configuracion());
  assert.equal(config.databaseUrl, configuracion().DB_PROVISIONING_URL);
  assert.throws(
    () => validarConfiguracionSeed(configuracion({ DB_PROVISIONING_URL: '' })),
    /DB_PROVISIONING_URL/
  );
  assert.throws(
    () => validarConfiguracionSeed(configuracion({
      DB_PROVISIONING_URL: 'postgresql://user:pass@localhost:5432/gym_test',
    })),
    /roles distintos/
  );
  assert.throws(
    () => validarConfiguracionSeed(configuracion({
      DB_MIGRATIONS_URL: 'postgresql://provisioner:other-password@localhost:5432/gym_test',
    })),
    /distinto de DB_MIGRATIONS_URL/
  );
});

test('el rol provisioning debe apuntar al proyecto Supabase confirmado', () => {
  const projectRef = 'abcdefghijklmnopqrst';
  const remoteConfig = configuracion({
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
    DEMO_SUPABASE_PROJECT_REF: projectRef,
    DEMO_DATABASE_HOST: `db.${projectRef}.supabase.co`,
    DB_PROVISIONING_URL:
      `postgresql://provisioner@db.${projectRef}.supabase.co:5432/gym_test`,
    DATABASE_URL:
      `postgresql://runtime@db.${projectRef}.supabase.co:5432/gym_test`,
    DB_MIGRATIONS_URL:
      `postgresql://migrator@db.${projectRef}.supabase.co:5432/gym_test`,
  });
  assert.equal(validarConfiguracionSeed(remoteConfig).databaseUrl, remoteConfig.DB_PROVISIONING_URL);
  assert.throws(
    () => validarConfiguracionSeed({
      ...remoteConfig,
      DB_PROVISIONING_URL:
        'postgresql://provisioner@db.otherprojectref00000000.supabase.co:5432/gym_test',
      DEMO_DATABASE_HOST: 'db.otherprojectref00000000.supabase.co',
    }),
    /no coinciden con DEMO_SUPABASE_PROJECT_REF/
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
