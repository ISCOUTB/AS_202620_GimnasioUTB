const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { aplicarAcceso } = require('../../src/modules/aforo/domain/aforo');
const { AforoPostgresAdapter } = require('../../src/modules/aforo/infrastructure/persistence/aforo-postgres.adapter');

const databaseUrl = process.env.DATABASE_URL;

test('PostgreSQL: persistencia transaccional y concurrencia', { skip: !databaseUrl }, async (t) => {
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  assert.match(
    databaseName,
    /test/i,
    'DATABASE_URL debe apuntar a una base cuyo nombre incluya "test"'
  );

  const schema = `aforo_test_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  let adapter;
  let schemaCreated = false;

  try {
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    adapter = new AforoPostgresAdapter({ connectionString: databaseUrl, schema });
    const schemaSql = await fs.readFile(
      path.join(__dirname, '../../src/modules/aforo/infrastructure/persistence/schema.sql'),
      'utf8'
    );
    await adapter.pool.query(schemaSql);

    const registrar = (tipoAcceso) => adapter.actualizarAforo((aforoActual) =>
      aplicarAcceso(aforoActual, tipoAcceso)
    );

    await t.test('inicializa el estado en cero', async () => {
      assert.equal(await adapter.obtenerAforoActual(), 0);
    });

    await t.test('registra una entrada', async () => {
      assert.equal(await registrar('ENTRADA'), 1);
    });

    await t.test('registra una salida', async () => {
      assert.equal(await registrar('SALIDA'), 0);
    });

    await t.test('persiste el estado entre instancias del adapter', async () => {
      await registrar('ENTRADA');
      await adapter.cerrar();
      adapter = new AforoPostgresAdapter({ connectionString: databaseUrl, schema });
      assert.equal(await adapter.obtenerAforoActual(), 1);
    });

    await t.test('revierte una salida rechazada por la regla de dominio', async () => {
      await adapter.pool.query('UPDATE aforo_estado SET aforo_actual = 0 WHERE id = 1');
      await assert.rejects(registrar('SALIDA'), /aforo ya está en 0/i);
      assert.equal(await adapter.obtenerAforoActual(), 0);
    });

    await t.test('revierte el estado cuando PostgreSQL rechaza la actualización', async () => {
      await adapter.pool.query('UPDATE aforo_estado SET aforo_actual = 1 WHERE id = 1');
      await adapter.pool.query(`
        CREATE FUNCTION aforo_test_reject_value() RETURNS trigger AS $$
        BEGIN
          IF NEW.aforo_actual = 2 THEN
            RAISE EXCEPTION 'error controlado de prueba';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      await adapter.pool.query(`
        CREATE TRIGGER aforo_test_reject_update
        BEFORE UPDATE ON aforo_estado
        FOR EACH ROW EXECUTE FUNCTION aforo_test_reject_value()
      `);

      await assert.rejects(registrar('ENTRADA'), /error controlado de prueba/);
      assert.equal(await adapter.obtenerAforoActual(), 1);
    });

    await t.test('serializa 20 entradas concurrentes sin lost updates', async () => {
      await adapter.pool.query('DROP TRIGGER aforo_test_reject_update ON aforo_estado');
      await adapter.pool.query('DROP FUNCTION aforo_test_reject_value()');
      await adapter.pool.query('UPDATE aforo_estado SET aforo_actual = 0 WHERE id = 1');

      const resultados = await Promise.all(
        Array.from({ length: 20 }, () => registrar('ENTRADA'))
      );
      const valorFinal = await adapter.obtenerAforoActual();

      assert.equal(resultados.length, 20);
      assert.equal(valorFinal, 20);
      assert.ok(resultados.every((aforo) => aforo >= 1));
    });
  } finally {
    try {
      if (adapter) await adapter.cerrar();
    } finally {
      try {
        if (schemaCreated) await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await adminPool.end();
      }
    }
  }
});