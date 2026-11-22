/**
 * Los scripts administrativos imprimen sus errores en consola y en los logs
 * de Dokploy. Antes de imprimirlos se reemplaza cualquier secreto conocido
 * (URLs con contraseña, contraseñas de roles y de estudiantes de prueba).
 */
const SECRET_ENVIRONMENT_VARIABLES = [
  'DATABASE_URL',
  'DB_MIGRATIONS_URL',
  'DB_ADMIN_URL',
  'DEMO_STUDENTS',
];

/** Agrega el usuario y la contraseña de una URL (codificados y decodificados). */
function agregarCredencialesDeUrl(value, secrets) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return; // Valor inválido: ya se redacta completo.
  }
  for (const credential of [url.password].filter(Boolean)) {
    secrets.add(credential);
    try {
      secrets.add(decodeURIComponent(credential));
    } catch {
      // Se conserva solo la credencial codificada en el conjunto de redacción.
    }
  }
}

/** Cada contraseña de DEMO_STUDENTS (cuarto campo de cada estudiante). */
function agregarContrasenasDemo(value, secrets) {
  for (const entrada of value.split(';')) {
    const contrasena = entrada.split('|')[3]?.trim();
    if (contrasena) secrets.add(contrasena);
  }
}

function recolectarSecretos(env) {
  const secrets = new Set();
  for (const name of SECRET_ENVIRONMENT_VARIABLES) {
    const value = env[name];
    if (!value) continue;
    secrets.add(value);
    if (name.endsWith('_URL')) agregarCredencialesDeUrl(value, secrets);
    if (name === 'DEMO_STUDENTS') agregarContrasenasDemo(value, secrets);
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

module.exports = { sanitizarMensajeAdministrativo, SECRET_ENVIRONMENT_VARIABLES };
