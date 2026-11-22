const test = require('node:test');
const assert = require('node:assert/strict');
const { aplicarAcceso } = require('../../src/modules/aforo/domain/aforo');

test('una ENTRADA incrementa el aforo en 1', () => {
  assert.strictEqual(aplicarAcceso(0, 'ENTRADA'), 1);
  assert.strictEqual(aplicarAcceso(5, 'ENTRADA'), 6);
});

test('una SALIDA decrementa el aforo en 1', () => {
  assert.strictEqual(aplicarAcceso(3, 'SALIDA'), 2);
});

test('una SALIDA con aforo en 0 lanza error (no puede quedar negativo)', () => {
  assert.throws(() => aplicarAcceso(0, 'SALIDA'), /no puede ser negativo|aforo ya está en 0/i);
});

test('un tipoAcceso inválido lanza error', () => {
  assert.throws(() => aplicarAcceso(0, 'CUALQUIER_COSA'), /inválido/i);
});

// --- Estado del gimnasio y capacidad (ADR-0012) ---
const {
  aplicarAccesoConEstado,
  calcularPorcentajeOcupacion,
  cambiarApertura,
  cambiarCapacidad,
  GimnasioCerradoError,
  CapacidadSuperadaError,
} = require('../../src/modules/aforo/domain/aforo');

const abierto = (aforoActual, capacidadMaxima = 30) => ({
  aforoActual, capacidadMaxima, abierto: true, motivoCierre: null,
});

test('cerrado: rechaza entradas con el motivo, pero permite salidas de quien sigue dentro', () => {
  const cerrado = { aforoActual: 4, capacidadMaxima: 30, abierto: false, motivoCierre: 'Mantenimiento' };
  assert.throws(() => aplicarAccesoConEstado(cerrado, 'ENTRADA'), (error) => {
    assert.ok(error instanceof GimnasioCerradoError);
    assert.equal(error.code, 'GIMNASIO_CERRADO');
    assert.match(error.message, /Mantenimiento/);
    return true;
  });
  assert.equal(aplicarAccesoConEstado(cerrado, 'SALIDA'), 3);
});

test('capacidad: la entrada que la supera exige confirmación y con ella se registra', () => {
  assert.equal(aplicarAccesoConEstado(abierto(29), 'ENTRADA'), 30);
  assert.throws(() => aplicarAccesoConEstado(abierto(30), 'ENTRADA'), (error) => {
    assert.ok(error instanceof CapacidadSuperadaError);
    assert.equal(error.aforoActual, 30);
    assert.equal(error.capacidadMaxima, 30);
    return true;
  });
  assert.equal(aplicarAccesoConEstado(abierto(30), 'ENTRADA', { confirmarExcesoCapacidad: true }), 31);
  assert.equal(aplicarAccesoConEstado(abierto(31), 'SALIDA'), 30);
});

test('sin capacidad conocida no se exige confirmación', () => {
  assert.equal(aplicarAccesoConEstado({ aforoActual: 500, abierto: true }, 'ENTRADA'), 501);
});

test('porcentaje de ocupación entero, que puede pasar de 100', () => {
  assert.equal(calcularPorcentajeOcupacion(0, 30), 0);
  assert.equal(calcularPorcentajeOcupacion(10, 30), 33);
  assert.equal(calcularPorcentajeOcupacion(31, 30), 103);
  assert.equal(calcularPorcentajeOcupacion(5, null), null);
});

test('apertura: el motivo es opcional al cerrar, se recorta y se borra al abrir', () => {
  assert.deepEqual(cambiarApertura({ abierto: false, motivoCierre: '  Fumigación  ' }), {
    abierto: false, motivoCierre: 'Fumigación',
  });
  assert.deepEqual(cambiarApertura({ abierto: false }), { abierto: false, motivoCierre: null });
  assert.deepEqual(cambiarApertura({ abierto: true, motivoCierre: 'ignorado' }), {
    abierto: true, motivoCierre: null,
  });
  assert.throws(() => cambiarApertura({ abierto: 'no' }), /abierto/);
  assert.throws(() => cambiarApertura({ abierto: false, motivoCierre: 'x'.repeat(201) }), /200/);
  assert.throws(() => cambiarApertura({ abierto: false, motivoCierre: 7 }), /texto/);
});

test('capacidad: entero entre 1 y 10000', () => {
  assert.deepEqual(cambiarCapacidad(45), { capacidadMaxima: 45 });
  for (const invalida of [0, -3, 2.5, '30', 10001, null]) {
    assert.throws(() => cambiarCapacidad(invalida), /entre 1 y 10000/);
  }
});
