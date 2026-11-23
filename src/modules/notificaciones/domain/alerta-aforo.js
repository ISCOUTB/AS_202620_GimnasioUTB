const ZONA_HORARIA = 'America/Bogota';

class PreferenciasAlertaInvalidasError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PreferenciasAlertaInvalidasError';
    this.code = 'PREFERENCIAS_ALERTA_INVALIDAS';
  }
}

function diaYMinutosEnBogota(fecha) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const valores = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  const dia = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[valores.weekday];
  return { dia, minutos: Number(valores.hour) * 60 + Number(valores.minute) };
}

function estaEnPeriodoPermitido(preferencias, fecha) {
  const { dia, minutos } = diaYMinutosEnBogota(fecha);
  const { dias, horaInicio, horaFin } = preferencias;

  if (horaInicio < horaFin) {
    return dias.includes(dia) && minutos >= horaInicio && minutos < horaFin;
  }
  if (minutos >= horaInicio) return dias.includes(dia);
  if (minutos < horaFin) return dias.includes(dia === 1 ? 7 : dia - 1);
  return false;
}

function validarPreferenciasAlerta(preferencias, capacidadMaxima) {
  if (!preferencias || typeof preferencias.habilitada !== 'boolean') {
    throw new PreferenciasAlertaInvalidasError('habilitada debe ser un booleano.');
  }
  const { umbral, dias, horaInicio, horaFin } = preferencias;
  if (umbral !== null && (!Number.isInteger(umbral) || umbral < 1)) {
    throw new PreferenciasAlertaInvalidasError('El umbral debe ser un entero positivo.');
  }
  if (preferencias.habilitada && (umbral === null || umbral > capacidadMaxima)) {
    throw new PreferenciasAlertaInvalidasError(
      'El umbral debe ser compatible con la capacidad máxima vigente.'
    );
  }
  if (
    !Array.isArray(dias)
    || dias.some((dia) => !Number.isInteger(dia) || dia < 1 || dia > 7)
    || new Set(dias).size !== dias.length
  ) {
    throw new PreferenciasAlertaInvalidasError('Los días deben ser únicos y estar entre 1 y 7.');
  }
  if (preferencias.habilitada && dias.length === 0) {
    throw new PreferenciasAlertaInvalidasError('Selecciona al menos un día para las alertas.');
  }
  if (
    !Number.isInteger(horaInicio) || horaInicio < 0 || horaInicio >= 1440
    || !Number.isInteger(horaFin) || horaFin < 0 || horaFin >= 1440
    || (preferencias.habilitada && horaInicio === horaFin)
  ) {
    throw new PreferenciasAlertaInvalidasError('El horario de la alerta no es válido.');
  }
}

module.exports = {
  PreferenciasAlertaInvalidasError,
  estaEnPeriodoPermitido,
  validarPreferenciasAlerta,
};
