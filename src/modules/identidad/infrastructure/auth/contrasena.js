const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const LONGITUD_CLAVE = 64;
const LONGITUD_SALT = 16;
// Salt fijo solo para gastar el mismo tiempo cuando el hash guardado no
// existe o es inválido; nunca se compara contra él.
const SALT_SIMULADO = Buffer.alloc(LONGITUD_SALT, 0x5a);
const FORMATO_HASH = /^scrypt\$([0-9a-f]{32})\$([0-9a-f]{128})$/i;

/**
 * Hash de contraseña con scrypt (incluido en Node, sin dependencias).
 * Formato: scrypt$<salt hex>$<clave derivada hex>.
 */
async function crearHashContrasena(contrasena) {
  const salt = crypto.randomBytes(LONGITUD_SALT);
  const clave = await scrypt(contrasena, salt, LONGITUD_CLAVE);
  return `scrypt$${salt.toString('hex')}$${clave.toString('hex')}`;
}

/**
 * Compara en tiempo constante. Si el hash no existe o no tiene el formato,
 * igual ejecuta scrypt para no revelar por el tiempo de respuesta si el
 * correo está registrado.
 */
async function verificarContrasena(contrasena, hashAlmacenado) {
  const partes = FORMATO_HASH.exec(String(hashAlmacenado || ''));
  if (!partes) {
    await scrypt(contrasena, SALT_SIMULADO, LONGITUD_CLAVE);
    return false;
  }
  const clave = await scrypt(contrasena, Buffer.from(partes[1], 'hex'), LONGITUD_CLAVE);
  return crypto.timingSafeEqual(clave, Buffer.from(partes[2], 'hex'));
}

module.exports = { crearHashContrasena, verificarContrasena };
