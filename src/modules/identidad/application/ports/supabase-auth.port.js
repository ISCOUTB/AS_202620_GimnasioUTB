class SupabaseAuthPort {
  async iniciarSesion(correo, contrasena) {
    throw new Error('SupabaseAuthPort.iniciarSesion no implementado');
  }

  async obtenerUsuario(tokenAcceso) {
    throw new Error('SupabaseAuthPort.obtenerUsuario no implementado');
  }
}

module.exports = { SupabaseAuthPort };
