/**
 * Puerto de autenticación de estudiantes. El router HTTP solo conoce este
 * contrato; el adaptador concreto (hoy, contraseñas y sesiones en PostgreSQL)
 * se elige en el composition root (server.js).
 *
 * iniciarSesion(correo, contrasena) -> { token, expiresAt, usuario: { id } }
 *   Lanza CredencialesInvalidasError si el correo o la contraseña no coinciden.
 * obtenerUsuario(token) -> { id } | null
 *   null si la sesión no existe o ya venció.
 *
 * `usuario.id` es el código estudiantil.
 */
class AutenticacionEstudiantePort {
  async iniciarSesion(correo, contrasena) {
    throw new Error('AutenticacionEstudiantePort.iniciarSesion no implementado');
  }

  async obtenerUsuario(token) {
    throw new Error('AutenticacionEstudiantePort.obtenerUsuario no implementado');
  }
}

module.exports = { AutenticacionEstudiantePort };
