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
