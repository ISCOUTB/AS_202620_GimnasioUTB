const LOCAL_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  'postgres',
]);

const SECRET_ENVIRONMENT_VARIABLES = [
  'DATABASE_URL',
  'DB_MIGRATIONS_URL',
  'DB_PROVISIONING_URL',
  'DB_RECONCILIATION_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DEMO_STUDENT_PASSWORD',
];

function parsearUrlPostgres(value, variableName) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} debe ser una URL válida`);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${variableName} debe apuntar a PostgreSQL`);
  }
  return url;
}

function obtenerNombreBase(url) {
  try {
    return decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error('El nombre de la base configurado no es válido');
  }
}

function obtenerUsuario(url) {
  try {
    return decodeURIComponent(url.username);
  } catch {
    throw new Error('El usuario PostgreSQL configurado no es válido');
  }
}

function urlPostgresPerteneceAlProyecto(url, projectRef) {
  if (url.hostname === `db.${projectRef}.supabase.co`) return true;
  if (!url.hostname.endsWith('.pooler.supabase.com')) return false;
  return obtenerUsuario(url).endsWith(`.${projectRef}`);
}

function validarEntornoDemo(env = process.env, { databaseVariable = 'DATABASE_URL' } = {}) {
  if (env.NODE_ENV === 'production') {
    throw new Error('La operación de demostración está deshabilitada en producción');
  }

  const requeridas = [
    databaseVariable,
    'DEMO_DATABASE_HOST',
    'DEMO_DATABASE_NAME',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DEMO_SUPABASE_PROJECT_REF',
  ];
  const faltantes = requeridas.filter((nombre) => !env[nombre]?.trim());
  if (faltantes.length > 0) {
    throw new Error(`Faltan variables para la operación de demostración: ${faltantes.join(', ')}`);
  }

  const databaseUrl = parsearUrlPostgres(env[databaseVariable], databaseVariable);
  const databaseName = obtenerNombreBase(databaseUrl);
  if (
    databaseName !== env.DEMO_DATABASE_NAME
    || databaseUrl.hostname !== env.DEMO_DATABASE_HOST
  ) {
    throw new Error(
      `${databaseVariable} no coincide con DEMO_DATABASE_NAME y DEMO_DATABASE_HOST`
    );
  }

  let supabaseUrl;
  try {
    supabaseUrl = new URL(env.SUPABASE_URL);
  } catch {
    throw new Error('SUPABASE_URL debe ser válida');
  }
  const projectRef = env.DEMO_SUPABASE_PROJECT_REF;
  const hostEsperado = `${projectRef}.supabase.co`;
  const esSupabaseLocal = LOCAL_DATABASE_HOSTS.has(supabaseUrl.hostname);
  if (esSupabaseLocal) {
    if (env.NODE_ENV !== 'test' || !LOCAL_DATABASE_HOSTS.has(databaseUrl.hostname)) {
      throw new Error('Supabase y PostgreSQL locales solo se permiten con NODE_ENV=test');
    }
  } else if (
    supabaseUrl.protocol !== 'https:'
    || supabaseUrl.hostname !== hostEsperado
    || !urlPostgresPerteneceAlProyecto(databaseUrl, projectRef)
  ) {
    throw new Error('Las URLs Auth y PostgreSQL no coinciden con DEMO_SUPABASE_PROJECT_REF');
  }

  return {
    databaseUrl: env[databaseVariable],
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    databaseName,
    projectRef,
  };
}

function validarEntornoProvisionamiento(env = process.env) {
  if (env.DB_PROVISIONING_ENABLED !== 'true') {
    throw new Error('Defina DB_PROVISIONING_ENABLED=true para autorizar el provisionamiento');
  }
  const config = validarEntornoDemo(env, { databaseVariable: 'DB_PROVISIONING_URL' });
  if (!env.DATABASE_URL?.trim()) {
    throw new Error('Defina DATABASE_URL para comprobar la separación del rol runtime');
  }

  const runtimeUrl = parsearUrlPostgres(env.DATABASE_URL, 'DATABASE_URL');
  const provisioningUrl = parsearUrlPostgres(config.databaseUrl, 'DB_PROVISIONING_URL');
  const runtimeTargetMatches = LOCAL_DATABASE_HOSTS.has(runtimeUrl.hostname)
    ? runtimeUrl.hostname === provisioningUrl.hostname
    : urlPostgresPerteneceAlProyecto(runtimeUrl, config.projectRef);
  if (
    obtenerNombreBase(runtimeUrl) !== config.databaseName
    || obtenerUsuario(runtimeUrl) === obtenerUsuario(provisioningUrl)
    || !runtimeTargetMatches
  ) {
    throw new Error(
      'DB_PROVISIONING_URL y DATABASE_URL deben identificar roles distintos del mismo destino'
    );
  }

  for (const otherVariable of ['DB_MIGRATIONS_URL', 'DB_RECONCILIATION_URL']) {
    if (!env[otherVariable]?.trim()) continue;
    const otherUrl = parsearUrlPostgres(env[otherVariable], otherVariable);
    if (obtenerUsuario(otherUrl) === obtenerUsuario(provisioningUrl)) {
      throw new Error(`El rol de provisionamiento debe ser distinto de ${otherVariable}`);
    }
  }
  return config;
}

function validarRolSoloLecturaSeparado(config, env, roleUrlVariable) {
  const readonlyUrl = parsearUrlPostgres(config.databaseUrl, roleUrlVariable);
  if (!env.DATABASE_URL?.trim()) {
    throw new Error('Defina DATABASE_URL para comprobar la separación del rol runtime');
  }
  const runtimeUrl = parsearUrlPostgres(env.DATABASE_URL, 'DATABASE_URL');
  const runtimeTargetMatches = LOCAL_DATABASE_HOSTS.has(runtimeUrl.hostname)
    ? runtimeUrl.hostname === readonlyUrl.hostname
    : urlPostgresPerteneceAlProyecto(runtimeUrl, config.projectRef);
  if (
    obtenerNombreBase(runtimeUrl) !== config.databaseName
    || obtenerUsuario(runtimeUrl) === obtenerUsuario(readonlyUrl)
    || !runtimeTargetMatches
  ) {
    throw new Error(
      `${roleUrlVariable} debe usar un rol distinto de runtime en el mismo destino`
    );
  }

  for (const otherVariable of ['DB_MIGRATIONS_URL', 'DB_PROVISIONING_URL']) {
    if (!env[otherVariable]?.trim()) continue;
    const otherUrl = parsearUrlPostgres(env[otherVariable], otherVariable);
    if (obtenerUsuario(otherUrl) === obtenerUsuario(readonlyUrl)) {
      throw new Error(`${roleUrlVariable} debe usar un rol de solo lectura distinto`);
    }
  }
  return config;
}

function validarEntornoReconciliacion(env = process.env) {
  if (env.DB_RECONCILIATION_ENABLED !== 'true') {
    throw new Error(
      'Defina DB_RECONCILIATION_ENABLED=true para autorizar la reconciliación de solo lectura'
    );
  }
  const config = validarEntornoDemo(env, { databaseVariable: 'DB_RECONCILIATION_URL' });
  return validarRolSoloLecturaSeparado(config, env, 'DB_RECONCILIATION_URL');
}

/** Agrega el usuario y la contraseña de una URL (codificados y decodificados). */
function agregarCredencialesDeUrl(value, secrets) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return; // Valor inválido: ya se redacta completo.
  }
  for (const credential of [url.username, url.password].filter(Boolean)) {
    secrets.add(credential);
    try {
      secrets.add(decodeURIComponent(credential));
    } catch {
      // Se conserva solo la credencial codificada en el conjunto de redacción.
    }
  }
}

function recolectarSecretos(env) {
  const secrets = new Set();
  for (const name of SECRET_ENVIRONMENT_VARIABLES) {
    const value = env[name];
    if (!value) continue;
    secrets.add(value);
    if (name.endsWith('_URL')) agregarCredencialesDeUrl(value, secrets);
  }
  return secrets;
}

function sanitizarMensajeAdministrativo(error, env = process.env) {
  let message = error instanceof Error ? error.message : 'Error administrativo no especificado';
  for (const secret of recolectarSecretos(env)) {
    message = message.split(secret).join('[redactado]');
  }
  return message;
}

module.exports = {
  validarEntornoDemo,
  validarEntornoProvisionamiento,
  validarEntornoReconciliacion,
  validarRolSoloLecturaSeparado,
  sanitizarMensajeAdministrativo,
};
