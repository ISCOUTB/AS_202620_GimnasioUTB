function validarEntornoDemo(env = process.env) {
  if (env.NODE_ENV === 'production') {
    throw new Error('La operación de demostración está deshabilitada en producción');
  }
  if (env.DEMO_SEED_ENABLED !== 'true') {
    throw new Error('Defina DEMO_SEED_ENABLED=true para autorizar la operación de demostración');
  }

  const requeridas = [
    'DATABASE_URL',
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

  const databaseUrl = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL debe apuntar a PostgreSQL');
  }
  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (
    databaseName !== env.DEMO_DATABASE_NAME
    || databaseUrl.hostname !== env.DEMO_DATABASE_HOST
  ) {
    throw new Error('La base destino no coincide con DEMO_DATABASE_NAME y DEMO_DATABASE_HOST');
  }

  const supabaseUrl = new URL(env.SUPABASE_URL);
  const hostEsperado = `${env.DEMO_SUPABASE_PROJECT_REF}.supabase.co`;
  const esSupabaseLocal = ['localhost', '127.0.0.1', '[::1]'].includes(supabaseUrl.hostname);
  if (esSupabaseLocal) {
    if (env.NODE_ENV !== 'test') {
      throw new Error('Supabase local solo se permite con NODE_ENV=test');
    }
  } else if (supabaseUrl.protocol !== 'https:' || supabaseUrl.hostname !== hostEsperado) {
    throw new Error('SUPABASE_URL no coincide con DEMO_SUPABASE_PROJECT_REF');
  }

  return {
    databaseUrl: env.DATABASE_URL,
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

module.exports = { validarEntornoDemo };
