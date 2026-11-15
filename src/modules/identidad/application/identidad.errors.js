class CredencialesInvalidasError extends Error {
  constructor() {
    super('Código de estudiante o contraseña inválidos.');
    this.name = 'CredencialesInvalidasError';
  }
}

class SesionEstudianteInvalidaError extends Error {
  constructor() {
    super('La sesión de estudiante no es válida o expiró.');
    this.name = 'SesionEstudianteInvalidaError';
  }
}

class QrNoValidoError extends Error {
  constructor() {
    super('El QR no es válido, expiró o ya fue utilizado.');
    this.name = 'QrNoValidoError';
    this.code = 'QR_NOT_VALID';
  }
}

module.exports = {
  CredencialesInvalidasError,
  SesionEstudianteInvalidaError,
  QrNoValidoError,
};
