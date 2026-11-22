const ROL_ESQUEMA = 'gimnasio_migrator';
const ROL_RUNTIME = 'gimnasio_runtime';

function crearErrorConfiguracion(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function exigir(condicion, code, message) {
  if (!condicion) throw crearErrorConfiguracion(code, message);
}

function decodificar(valor, code, message) {
  try {
    return decodeURIComponent(valor);
  } catch {
    throw crearErrorConfiguracion(code, message);
  }
}

/** Parsea una URL PostgreSQL y exige protocolo postgres(ql) y puerto 5432. */
function leerUrlPostgres(value, variable) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw crearErrorConfiguracion(
      `${variable}_INVALID`,
      'La URL PostgreSQL configurada no es válida'
    );
  }
  exigir(
    ['postgres:', 'postgresql:'].includes(url.protocol),
    `${variable}_PROTOCOL_INVALID`,
    `${variable} debe usar el protocolo PostgreSQL`
  );
  exigir(
    !url.port || url.port === '5432',
    `${variable}_PORT_INVALID`,
    `${variable} debe usar el puerto PostgreSQL 5432`
  );
  return url;
}

/** Usuario y base de una URL ya parseada. */
function componentes(url, variable) {
  const mensaje = 'El usuario o nombre de base de una URL PostgreSQL no es válido';
  return {
    usuario: decodificar(url.username, `${variable}_COMPONENT_INVALID`, mensaje),
    base: decodificar(url.pathname.slice(1), `${variable}_COMPONENT_INVALID`, mensaje),
  };
}

/**
 * Antes de tocar el esquema se confirma el destino:
 * 1. DB_MIGRATIONS_URL coincide con el host y la base confirmados a mano
 *    (DB_MIGRATIONS_HOST, DB_MIGRATIONS_TARGET), para no migrar otra base.
 * 2. Cada URL usa su rol: gimnasio_migrator para el esquema y
 *    gimnasio_runtime para la API (mínimo privilegio, S13).
 * 3. Ambas apuntan al mismo host y base.
 */
function validarDestinoPostgres(env = process.env) {
  exigir(
    env.DB_MIGRATIONS_URL,
    'DB_MIGRATIONS_URL_MISSING',
    'Defina DB_MIGRATIONS_URL para operaciones de esquema'
  );
  exigir(
    env.DB_MIGRATIONS_HOST && env.DB_MIGRATIONS_TARGET,
    'DESTINATION_CONFIRMATION_MISSING',
    'Defina DB_MIGRATIONS_HOST y DB_MIGRATIONS_TARGET para confirmar la base destino'
  );

  const esquemaUrl = leerUrlPostgres(env.DB_MIGRATIONS_URL, 'DB_MIGRATIONS_URL');
  const esquema = componentes(esquemaUrl, 'DB_MIGRATIONS_URL');
  exigir(
    esquema.base && esquema.base === env.DB_MIGRATIONS_TARGET,
    'DB_MIGRATIONS_TARGET_MISMATCH',
    'La confirmación de host/base no coincide con DB_MIGRATIONS_URL'
  );
  exigir(
    esquemaUrl.hostname === env.DB_MIGRATIONS_HOST,
    'DB_MIGRATIONS_HOST_MISMATCH',
    'La confirmación de host/base no coincide con DB_MIGRATIONS_URL'
  );
  exigir(
    esquema.usuario === ROL_ESQUEMA,
    'DB_MIGRATIONS_URL_ROLE_MISMATCH',
    `DB_MIGRATIONS_URL debe usar el rol ${ROL_ESQUEMA}`
  );

  exigir(
    env.DATABASE_URL,
    'DATABASE_URL_MISSING',
    'Defina DATABASE_URL con el rol runtime separado del rol de esquema'
  );
  const runtimeUrl = leerUrlPostgres(env.DATABASE_URL, 'DATABASE_URL');
  const runtime = componentes(runtimeUrl, 'DATABASE_URL');
  exigir(
    runtime.usuario === ROL_RUNTIME,
    'DATABASE_URL_ROLE_MISMATCH',
    `DATABASE_URL debe usar el rol ${ROL_RUNTIME}`
  );
  exigir(
    runtimeUrl.hostname === esquemaUrl.hostname && runtime.base === esquema.base,
    'DATABASE_URL_DESTINATION_OR_ROLE_MISMATCH',
    'DATABASE_URL y DB_MIGRATIONS_URL deben identificar roles distintos del mismo destino'
  );

  return { databaseName: esquema.base, databaseHost: esquemaUrl.hostname };
}

async function validarRolEsquema(queryable) {
  const result = await queryable.query(`
    SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
    FROM pg_roles
    WHERE rolname = current_user
  `);
  const role = result.rows[0];
  if (
    !role
    || role.rolsuper
    || role.rolcreatedb
    || role.rolcreaterole
    || role.rolreplication
    || role.rolbypassrls
  ) {
    throw new Error(
      'El rol de esquema debe carecer de privilegios administrativos y BYPASSRLS'
    );
  }
}

module.exports = {
  validarDestinoPostgres,
  validarRolEsquema,
  leerUrlPostgres,
  ROL_ESQUEMA,
  ROL_RUNTIME,
};
