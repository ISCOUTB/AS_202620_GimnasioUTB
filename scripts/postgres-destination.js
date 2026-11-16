const LOCAL_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  'postgres',
]);

function parsearUrl(value) {
  try {
    return new URL(value);
  } catch {
    throw new Error('La URL PostgreSQL/Supabase configurada no es válida');
  }
}

function obtenerReferenciaSupabase(value) {
  const supabaseUrl = parsearUrl(value);
  const match = /^([a-z0-9]{20})\.supabase\.co$/i.exec(supabaseUrl.hostname);
  return match ? match[1] : null;
}

function usuarioPerteneceAlProyecto(databaseUrl, projectRef) {
  const directHost = databaseUrl.hostname === `db.${projectRef}.supabase.co`;
  if (directHost) return true;
  if (!databaseUrl.hostname.endsWith('.pooler.supabase.com')) return false;

  let username = '';
  try {
    username = decodeURIComponent(databaseUrl.username);
  } catch {
    throw new Error('El usuario de la URL PostgreSQL no es válido');
  }
  return username.endsWith(`.${projectRef}`);
}

function validarDestinoPostgres(env = process.env) {
  if (!env.DB_MIGRATIONS_URL) {
    throw new Error('Defina DB_MIGRATIONS_URL para operaciones de esquema');
  }
  if (!env.DB_MIGRATIONS_HOST || !env.DB_MIGRATIONS_TARGET) {
    throw new Error(
      'Defina DB_MIGRATIONS_HOST y DB_MIGRATIONS_TARGET para confirmar la base destino'
    );
  }

  const databaseUrl = parsearUrl(env.DB_MIGRATIONS_URL);
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DB_MIGRATIONS_URL debe usar el protocolo PostgreSQL');
  }

  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  const databaseHost = databaseUrl.hostname;
  if (
    !databaseName
    || databaseName !== env.DB_MIGRATIONS_TARGET
    || databaseHost !== env.DB_MIGRATIONS_HOST
  ) {
    throw new Error('La confirmación de host/base no coincide con DB_MIGRATIONS_URL');
  }

  let projectRef = null;
  const isLocalDatabase = LOCAL_DATABASE_HOSTS.has(databaseHost);
  if (!isLocalDatabase) {
    projectRef = obtenerReferenciaSupabase(env.SUPABASE_URL || '');
    const confirmedRef = env.DB_MIGRATIONS_PROJECT_REF;
    if (!projectRef || confirmedRef !== projectRef) {
      throw new Error('Confirme el proyecto Supabase destino con DB_MIGRATIONS_PROJECT_REF');
    }

    if (!usuarioPerteneceAlProyecto(databaseUrl, projectRef)) {
      throw new Error('DB_MIGRATIONS_URL no identifica el proyecto Supabase confirmado');
    }

  }

  if (!env.DATABASE_URL) {
    throw new Error('Defina DATABASE_URL con el rol runtime separado del rol de esquema');
  }
  const runtimeUrl = parsearUrl(env.DATABASE_URL || '');
  if (!['postgres:', 'postgresql:'].includes(runtimeUrl.protocol)) {
    throw new Error('DATABASE_URL debe usar el protocolo PostgreSQL');
  }
  let runtimeName;
  let runtimeUser;
  let migrationUser;
  try {
    runtimeName = decodeURIComponent(runtimeUrl.pathname.slice(1));
    runtimeUser = decodeURIComponent(runtimeUrl.username);
    migrationUser = decodeURIComponent(databaseUrl.username);
  } catch {
    throw new Error('El usuario o nombre de base de una URL PostgreSQL no es válido');
  }
  const runtimeDestinationMatches = isLocalDatabase
    ? runtimeUrl.hostname === databaseHost
    : usuarioPerteneceAlProyecto(runtimeUrl, projectRef);
  if (
    runtimeName !== databaseName
    || !runtimeDestinationMatches
    || !runtimeUser
    || !migrationUser
    || runtimeUser === migrationUser
  ) {
    throw new Error('DATABASE_URL y DB_MIGRATIONS_URL deben identificar roles distintos del mismo destino');
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
