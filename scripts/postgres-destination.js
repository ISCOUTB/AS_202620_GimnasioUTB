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

function exigir(condicion, code, message) {
  if (!condicion) throw crearErrorConfiguracion(code, message);
}

/** Parsea una URL PostgreSQL y exige protocolo postgres(ql) y puerto 5432. */
function leerUrlPostgres(value, variable) {
  const url = parsearUrl(value, variable);
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

function decodificar(valor, code, message) {
  try {
    return decodeURIComponent(valor);
  } catch {
    throw crearErrorConfiguracion(code, message);
  }
}

/** Paso 1: la URL de esquema existe y coincide con el host/base confirmados. */
function validarUrlEsquema(env) {
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

  const databaseUrl = leerUrlPostgres(env.DB_MIGRATIONS_URL, 'DB_MIGRATIONS_URL');
  const databaseName = decodificar(
    databaseUrl.pathname.slice(1),
    'DB_MIGRATIONS_URL_DATABASE_INVALID',
    'El nombre de base de la URL PostgreSQL no es válido'
  );
  const databaseHost = databaseUrl.hostname;
  exigir(
    databaseName && databaseName === env.DB_MIGRATIONS_TARGET,
    'DB_MIGRATIONS_TARGET_MISMATCH',
    'La confirmación de host/base no coincide con DB_MIGRATIONS_URL'
  );
  exigir(
    databaseHost === env.DB_MIGRATIONS_HOST,
    'DB_MIGRATIONS_HOST_MISMATCH',
    'La confirmación de host/base no coincide con DB_MIGRATIONS_URL'
  );
  return { databaseUrl, databaseName, databaseHost };
}

/** Paso 2 (solo Supabase): el proyecto confirmado es el de SUPABASE_URL y el de la URL. */
function validarProyectoSupabase(env, databaseUrl) {
  const projectRef = obtenerReferenciaSupabase(env.SUPABASE_URL || '');
  exigir(
    projectRef && env.DB_MIGRATIONS_PROJECT_REF === projectRef,
    'DB_MIGRATIONS_PROJECT_REF_MISMATCH',
    'Confirme el proyecto Supabase destino con DB_MIGRATIONS_PROJECT_REF'
  );
  exigir(
    usuarioPerteneceAlProyecto(databaseUrl, projectRef, 'DB_MIGRATIONS_URL'),
    'DB_MIGRATIONS_URL_PROJECT_MISMATCH',
    'DB_MIGRATIONS_URL no identifica el proyecto Supabase confirmado'
  );
  return projectRef;
}

/** En el pooler el usuario lleva el sufijo .<project-ref>; en conexión directa no. */
function usuarioEsperado(url, rol, projectRef) {
  return url.hostname.endsWith('.pooler.supabase.com') ? `${rol}.${projectRef}` : rol;
}

/** Paso 4 (solo Supabase): cada URL usa el rol que le corresponde. */
function validarRolesSupabase(databaseUrl, runtimeUrl, usuarios, projectRef) {
  exigir(
    usuarios.migrationUser === usuarioEsperado(databaseUrl, 'gimnasio_migrator', projectRef),
    'DB_MIGRATIONS_URL_ROLE_MISMATCH',
    'DB_MIGRATIONS_URL debe usar el rol gimnasio_migrator'
  );
  exigir(
    usuarios.runtimeUser === usuarioEsperado(runtimeUrl, 'gimnasio_runtime', projectRef),
    'DATABASE_URL_ROLE_MISMATCH',
    'DATABASE_URL debe usar el rol gimnasio_runtime'
  );
}

function validarDestinoPostgres(env = process.env) {
  const { databaseUrl, databaseName, databaseHost } = validarUrlEsquema(env);

  const isLocalDatabase = LOCAL_DATABASE_HOSTS.has(databaseHost);
  const projectRef = isLocalDatabase ? null : validarProyectoSupabase(env, databaseUrl);

  // Paso 3: la URL runtime existe y es PostgreSQL.
  exigir(
    env.DATABASE_URL,
    'DATABASE_URL_MISSING',
    'Defina DATABASE_URL con el rol runtime separado del rol de esquema'
  );
  const runtimeUrl = leerUrlPostgres(env.DATABASE_URL, 'DATABASE_URL');
  const mensajeComponente = 'El usuario o nombre de base de una URL PostgreSQL no es válido';
  const runtimeName = decodificar(runtimeUrl.pathname.slice(1), 'DATABASE_URL_COMPONENT_INVALID', mensajeComponente);
  const usuarios = {
    runtimeUser: decodificar(runtimeUrl.username, 'DATABASE_URL_COMPONENT_INVALID', mensajeComponente),
    migrationUser: decodificar(databaseUrl.username, 'DATABASE_URL_COMPONENT_INVALID', mensajeComponente),
  };

  if (!isLocalDatabase) {
    validarRolesSupabase(databaseUrl, runtimeUrl, usuarios, projectRef);
  }

  // Paso 5: ambas URLs apuntan al mismo destino con roles distintos.
  const runtimeDestinationMatches = isLocalDatabase
    ? runtimeUrl.hostname === databaseHost
    : usuarioPerteneceAlProyecto(runtimeUrl, projectRef, 'DATABASE_URL');
  exigir(
    runtimeName === databaseName
      && runtimeDestinationMatches
      && usuarios.runtimeUser
      && usuarios.migrationUser
      && usuarios.runtimeUser !== usuarios.migrationUser,
    'DATABASE_URL_DESTINATION_OR_ROLE_MISMATCH',
    'DATABASE_URL y DB_MIGRATIONS_URL deben identificar roles distintos del mismo destino'
  );

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
