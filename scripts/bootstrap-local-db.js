const { escapeIdentifier, escapeLiteral } = require('pg');
const { crearPoolPostgres } = require('../src/shared/postgres-pool');
const { cargarEntorno } = require('../src/shared/environment');
const {
  validarDestinoPostgres,
  leerUrlPostgres,
  ROL_ESQUEMA,
  ROL_RUNTIME,
} = require('./postgres-destination');
const { sanitizarMensajeAdministrativo } = require('./admin-messages');

// Solo el PostgreSQL del propio Compose: este script usa el superusuario.
const HOSTS_PERMITIDOS = new Set(['postgres', 'localhost', '127.0.0.1']);
// Sin caracteres que haya que codificar dentro de una URL.
const CONTRASENA_RE = /^[A-Za-z0-9_-]{16,128}$/;

const ATRIBUTOS_ROL = 'LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
const TABLAS_APLICACION = [
  'aforo_estado',
  'estudiantes',
  'sesiones_estudiantes',
  'qr_credenciales',
  'estudiante_estado_acceso',
  'schema_migrations',
];

function contrasenaDe(url, variable) {
  let contrasena;
  try {
    contrasena = decodeURIComponent(url.password);
  } catch {
    contrasena = '';
  }
  if (!CONTRASENA_RE.test(contrasena)) {
    throw new Error(
      `La contraseña de ${variable} debe tener de 16 a 128 letras, números, guiones o guiones bajos`
    );
  }
  return contrasena;
}

/**
 * Valida todo antes de conectarse: habilitación explícita, el destino de
 * siempre (validarDestinoPostgres) y que el superusuario apunte al mismo
 * PostgreSQL local del Compose y no sea uno de los roles de la aplicación.
 */
function validarConfiguracionBootstrap(env = process.env) {
  if (env.DB_BOOTSTRAP_ENABLED !== 'true') {
    throw new Error('Defina DB_BOOTSTRAP_ENABLED=true para autorizar la creación de roles');
  }
  const destino = validarDestinoPostgres(env);
  if (!env.DB_ADMIN_URL) throw new Error('Defina DB_ADMIN_URL con el superusuario del PostgreSQL local');

  const adminUrl = leerUrlPostgres(env.DB_ADMIN_URL, 'DB_ADMIN_URL');
  if (!HOSTS_PERMITIDOS.has(adminUrl.hostname)) {
    throw new Error('DB_ADMIN_URL solo puede apuntar al PostgreSQL local del Compose');
  }
  if (adminUrl.hostname !== destino.databaseHost || adminUrl.pathname.slice(1) !== destino.databaseName) {
    throw new Error('DB_ADMIN_URL debe apuntar al mismo host y base que DB_MIGRATIONS_URL');
  }
  if ([ROL_ESQUEMA, ROL_RUNTIME].includes(decodeURIComponent(adminUrl.username))) {
    throw new Error('DB_ADMIN_URL debe usar el superusuario, no un rol de la aplicación');
  }
  return {
    baseDatos: destino.databaseName,
    contrasenaEsquema: contrasenaDe(new URL(env.DB_MIGRATIONS_URL), 'DB_MIGRATIONS_URL'),
    contrasenaRuntime: contrasenaDe(new URL(env.DATABASE_URL), 'DATABASE_URL'),
  };
}

/** Crea el rol si no existe; si existe, le reaplica atributos y contraseña. */
async function asegurarRol(pool, rol, contrasena) {
  const { rows } = await pool.query('SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1', [rol]);
  const verbo = rows.length > 0 ? 'ALTER' : 'CREATE';
  await pool.query(
    `${verbo} ROLE ${escapeIdentifier(rol)} WITH ${ATRIBUTOS_ROL} PASSWORD ${escapeLiteral(contrasena)}`
  );
  return verbo === 'CREATE' ? 'creado' : 'actualizado';
}

/**
 * Conexión y esquema: solo los dos roles pueden conectarse; solo el
 * migrador crea objetos en public. Luego, si el volumen viene de una versión
 * anterior (S8: tablas creadas por el superusuario), las tablas pasan a ser
 * del migrador para que db:prepare y db:grant-runtime puedan modificarlas.
 */
async function configurarPrivilegios(pool, baseDatos) {
  const db = escapeIdentifier(baseDatos);
  const esquema = escapeIdentifier(ROL_ESQUEMA);
  const runtime = escapeIdentifier(ROL_RUNTIME);
  await pool.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
  await pool.query(`GRANT CONNECT ON DATABASE ${db} TO ${esquema}, ${runtime}`);
  await pool.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${runtime}`);
  await pool.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${esquema}`);
  const { rows } = await pool.query(
    `SELECT tablename FROM pg_catalog.pg_tables
     WHERE schemaname = 'public' AND tablename = ANY($1::text[]) AND tableowner <> $2`,
    [TABLAS_APLICACION, ROL_ESQUEMA]
  );
  await Promise.all(rows.map(({ tablename }) => pool.query(
    `ALTER TABLE public.${escapeIdentifier(tablename)} OWNER TO ${esquema}`
  )));
  return rows.map(({ tablename }) => tablename);
}

async function main(env = process.env, poolFactory = crearPoolPostgres) {
  const config = validarConfiguracionBootstrap(env);
  const pool = poolFactory(env.DB_ADMIN_URL);
  try {
    const esquema = await asegurarRol(pool, ROL_ESQUEMA, config.contrasenaEsquema);
    const runtime = await asegurarRol(pool, ROL_RUNTIME, config.contrasenaRuntime);
    const transferidas = await configurarPrivilegios(pool, config.baseDatos);
    return { esquema, runtime, transferidas };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  Promise.resolve().then(() => {
    cargarEntorno();
    return main();
  }).then(({ esquema, runtime, transferidas }) => {
    console.info(`Roles listos: ${ROL_ESQUEMA} ${esquema}, ${ROL_RUNTIME} ${runtime}.`);
    if (transferidas.length > 0) {
      console.info(`Tablas anteriores transferidas a ${ROL_ESQUEMA}: ${transferidas.join(', ')}.`);
    }
  }).catch((error) => {
    console.error(sanitizarMensajeAdministrativo(error));
    process.exitCode = 1;
  });
}

module.exports = { validarConfiguracionBootstrap, asegurarRol, configurarPrivilegios, main };
