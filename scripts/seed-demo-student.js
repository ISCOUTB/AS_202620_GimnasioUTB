const { Pool } = require('pg');
const { crearHashContrasena } = require('../src/modules/identidad/infrastructure/persistence/identidad-postgres.adapter');

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('La carga de estudiantes sintéticos está deshabilitada en producción');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('Defina DATABASE_URL para cargar el estudiante sintético');
  }
  const databaseName = decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
  if (!/test/i.test(databaseName)) {
    throw new Error('La base de datos de prueba debe tener "test" en su nombre');
  }
  const codigo = process.env.DEMO_STUDENT_ID;
  const nombre = process.env.DEMO_STUDENT_NAME;
  const contrasena = process.env.DEMO_STUDENT_PASSWORD;
  if (
    !codigo?.trim()
    || !nombre?.trim()
    || !contrasena
    || contrasena.length < 12
  ) {
    throw new Error(
      'Defina DEMO_STUDENT_ID, DEMO_STUDENT_NAME y DEMO_STUDENT_PASSWORD (mínimo 12 caracteres)'
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const passwordHash = await crearHashContrasena(contrasena);
    await pool.query(
      `INSERT INTO estudiantes (codigo_estudiante, nombre, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (codigo_estudiante)
       DO UPDATE SET nombre = EXCLUDED.nombre, password_hash = EXCLUDED.password_hash`,
      [codigo.trim(), nombre.trim(), passwordHash]
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
