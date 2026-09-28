const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Defina DATABASE_URL para inicializar el esquema');
  }

  const sql = await fs.readFile(
    path.join(__dirname, '..', 'src/modules/aforo/infrastructure/persistence/schema.sql'),
    'utf8'
  );
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});