class CredencialesInvalidasError extends Error {
  constructor() {
    super('Correo o contraseña inválidos.');
    this.name = 'CredencialesInvalidasError';
  }
}

class SesionEstudianteInvalidaError extends Error {
  constructor() {
    super('La sesión de estudiante no es válida o expiró.');
    this.name = 'SesionEstudianteInvalidaError';
  }
}

class EstudianteNoVinculadoError extends Error {
  constructor() {
    super('La sesión no corresponde a un estudiante registrado.');
    this.name = 'EstudianteNoVinculadoError';
  }
}

class IdentidadProveedorError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'IdentidadProveedorError';
    if (cause !== undefined) this.cause = cause;
  }
}

class CuentaEstudianteInactivaError extends Error {
  constructor() {
    super('La cuenta está inactiva y no puede registrar una entrada.');
    this.name = 'CuentaEstudianteInactivaError';
    this.code = 'STUDENT_INACTIVE';
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
  EstudianteNoVinculadoError,
  IdentidadProveedorError,
  CuentaEstudianteInactivaError,
  QrNoValidoError,
};
