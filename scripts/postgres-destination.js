const LOCAL_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  'postgres',
]);

function crearErrorConfiguracion(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parsearUrl(value, variable) {
  try {
    return new URL(value);
  } catch {
    throw crearErrorConfiguracion(
      `${variable}_INVALID`,
      'La URL PostgreSQL/Supabase configurada no es válida'
    );
  }
}

function obtenerReferenciaSupabase(value) {
  const supabaseUrl = parsearUrl(value, 'SUPABASE_URL');
  const match = /^([a-z0-9]{20})\.supabase\.co$/i.exec(supabaseUrl.hostname);
  return match ? match[1] : null;
}

function usuarioPerteneceAlProyecto(databaseUrl, projectRef, variable) {
  const directHost = databaseUrl.hostname === `db.${projectRef}.supabase.co`;
  if (directHost) return true;
  if (!databaseUrl.hostname.endsWith('.pooler.supabase.com')) return false;

  let username = '';
  try {
    username = decodeURIComponent(databaseUrl.username);
  } catch {
    throw crearErrorConfiguracion(
      `${variable}_USERNAME_INVALID`,
      'El usuario de la URL PostgreSQL no es válido'
    );
  }
  return username.endsWith(`.${projectRef}`);
}

function validarDestinoPostgres(env = process.env) {
  if (!env.DB_MIGRATIONS_URL) {
    throw crearErrorConfiguracion(
      'DB_MIGRATIONS_URL_MISSING',
      'Defina DB_MIGRATIONS_URL para operaciones de esquema'
    );
  }
  if (!env.DB_MIGRATIONS_HOST || !env.DB_MIGRATIONS_TARGET) {
    throw crearErrorConfiguracion(
      'DESTINATION_CONFIRMATION_MISSING',
      'Defina DB_MIGRATIONS_HOST y DB_MIGRATIONS_TARGET para confirmar la base destino'
    );
  }

  const databaseUrl = parsearUrl(env.DB_MIGRATIONS_URL, 'DB_MIGRATIONS_URL');
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw crearErrorConfiguracion(
      'DB_MIGRATIONS_URL_PROTOCOL_INVALID',
      'DB_MIGRATIONS_URL debe usar el protocolo PostgreSQL'
    );
  }
  if (databaseUrl.port && databaseUrl.port !== '5432') {
    throw crearErrorConfiguracion(
      'DB_MIGRATIONS_URL_PORT_INVALID',
      'DB_MIGRATIONS_URL debe usar el puerto PostgreSQL 5432'
    );
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  } catch {
    throw crearErrorConfiguracion(
      'DB_MIGRATIONS_URL_DATABASE_INVALID',
      'El nombre de base de la URL PostgreSQL no es válido'
    );
  }
  const databaseHost = databaseUrl.hostname;
  if (!databaseName || databaseName !== env.DB_MIGRATIONS_TARGET) {
    throw crearErrorConfiguracion(
      'DB_MIGRATIONS_TARGET_MISMATCH',
      'La confirmación de host/base no coincide con DB_MIGRATIONS_URL'
    );
  }
  if (databaseHost !== env.DB_MIGRATIONS_HOST) {
    throw crearErrorConfiguracion(
      'DB_MIGRATIONS_HOST_MISMATCH',
      'La confirmación de host/base no coincide con DB_MIGRATIONS_URL'
    );
  }

  let projectRef = null;
  const isLocalDatabase = LOCAL_DATABASE_HOSTS.has(databaseHost);
  if (!isLocalDatabase) {
    projectRef = obtenerReferenciaSupabase(env.SUPABASE_URL || '');
    const confirmedRef = env.DB_MIGRATIONS_PROJECT_REF;
    if (!projectRef || confirmedRef !== projectRef) {
      throw crearErrorConfiguracion(
        'DB_MIGRATIONS_PROJECT_REF_MISMATCH',
        'Confirme el proyecto Supabase destino con DB_MIGRATIONS_PROJECT_REF'
      );
    }

    if (!usuarioPerteneceAlProyecto(databaseUrl, projectRef, 'DB_MIGRATIONS_URL')) {
      throw crearErrorConfiguracion(
        'DB_MIGRATIONS_URL_PROJECT_MISMATCH',
        'DB_MIGRATIONS_URL no identifica el proyecto Supabase confirmado'
      );
    }

  }

  if (!env.DATABASE_URL) {
    throw crearErrorConfiguracion(
      'DATABASE_URL_MISSING',
      'Defina DATABASE_URL con el rol runtime separado del rol de esquema'
    );
  }
  const runtimeUrl = parsearUrl(env.DATABASE_URL || '', 'DATABASE_URL');
  if (!['postgres:', 'postgresql:'].includes(runtimeUrl.protocol)) {
    throw crearErrorConfiguracion(
      'DATABASE_URL_PROTOCOL_INVALID',
      'DATABASE_URL debe usar el protocolo PostgreSQL'
    );
  }
  if (runtimeUrl.port && runtimeUrl.port !== '5432') {
    throw crearErrorConfiguracion(
      'DATABASE_URL_PORT_INVALID',
      'DATABASE_URL debe usar el puerto PostgreSQL 5432'
    );
  }
  let runtimeName;
  let runtimeUser;
  let migrationUser;
  try {
    runtimeName = decodeURIComponent(runtimeUrl.pathname.slice(1));
    runtimeUser = decodeURIComponent(runtimeUrl.username);
    migrationUser = decodeURIComponent(databaseUrl.username);
  } catch {
    throw crearErrorConfiguracion(
      'DATABASE_URL_COMPONENT_INVALID',
      'El usuario o nombre de base de una URL PostgreSQL no es válido'
    );
  }
  if (!isLocalDatabase) {
    const expectedMigrationUser = databaseUrl.hostname.endsWith('.pooler.supabase.com')
      ? `gimnasio_migrator.${projectRef}`
      : 'gimnasio_migrator';
    if (migrationUser !== expectedMigrationUser) {
      throw crearErrorConfiguracion(
        'DB_MIGRATIONS_URL_ROLE_MISMATCH',
        'DB_MIGRATIONS_URL debe usar el rol gimnasio_migrator'
      );
    }

    const expectedRuntimeUser = runtimeUrl.hostname.endsWith('.pooler.supabase.com')
      ? `gimnasio_runtime.${projectRef}`
      : 'gimnasio_runtime';
    if (runtimeUser !== expectedRuntimeUser) {
      throw crearErrorConfiguracion(
        'DATABASE_URL_ROLE_MISMATCH',
        'DATABASE_URL debe usar el rol gimnasio_runtime'
      );
    }
  }
  const runtimeDestinationMatches = isLocalDatabase
    ? runtimeUrl.hostname === databaseHost
    : usuarioPerteneceAlProyecto(runtimeUrl, projectRef, 'DATABASE_URL');
  if (
    runtimeName !== databaseName
    || !runtimeDestinationMatches
    || !runtimeUser
    || !migrationUser
    || runtimeUser === migrationUser
  ) {
    throw crearErrorConfiguracion(
      'DATABASE_URL_DESTINATION_OR_ROLE_MISMATCH',
      'DATABASE_URL y DB_MIGRATIONS_URL deben identificar roles distintos del mismo destino'
    );
  }

  return { databaseName, databaseHost, projectRef };
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

module.exports = { validarDestinoPostgres, validarRolEsquema };
