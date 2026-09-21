/**
 * Prueba de contrato (lado proveedor): el API Backend real debe cumplir
 * lo que promete docs/openapi.yaml. Si alguien renombra un campo, cambia un
 * código HTTP o agrega un campo sin actualizar el contrato, esta prueba falla.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const Ajv2020 = require('ajv/dist/2020');
const { createApp } = require('../src/server');

const SPEC_ID = 'https://gimnasio-utb.local/openapi.json';
const spec = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8'));

const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ ...spec, $id: SPEC_ID });

// Puntero JSON al esquema de una operación dentro del contrato
const escapar = (s) => s.replace(/~/g, '~0').replace(/\//g, '~1');
function validadorRespuesta(ruta, metodo, status) {
  const respuesta = spec.paths[ruta]?.[metodo]?.responses?.[String(status)];
  assert.ok(respuesta, `El contrato no documenta ${metodo.toUpperCase()} ${ruta} -> ${status}`);
  const ptr = `/paths/${escapar(ruta)}/${metodo}/responses/${status}/content/application~1json/schema`;
  return ajv.getSchema(`${SPEC_ID}#${ptr}`);
}
function validadorSolicitud(ruta, metodo) {
  const ptr = `/paths/${escapar(ruta)}/${metodo}/requestBody/content/application~1json/schema`;
  return ajv.getSchema(`${SPEC_ID}#${ptr}`);
}

async function withServer(fn) {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

// Cada caso ejercita una operación del contrato con un servidor limpio (aforo = 0)
const casos = [
  { nombre: 'GET /health -> 200', metodo: 'get', ruta: '/health', status: 200 },
  { nombre: 'GET /api/v1/aforo -> 200', metodo: 'get', ruta: '/api/v1/aforo', status: 200 },
  {
    nombre: 'POST /api/v1/aforo/acceso (ENTRADA) -> 201',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 201,
    body: { tipoAcceso: 'ENTRADA' }, cumpleSolicitud: true,
  },
  {
    nombre: 'POST /api/v1/aforo/acceso (SALIDA con aforo 0) -> 400',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 400,
    body: { tipoAcceso: 'SALIDA' }, cumpleSolicitud: true,
  },
  {
    nombre: 'POST /api/v1/aforo/acceso (tipoAcceso inválido) -> 400',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 400,
    body: { tipoAcceso: 'VISITA' }, cumpleSolicitud: false,
  },
];

const cubiertos = new Set();

for (const caso of casos) {
  test(`contrato: ${caso.nombre}`, async () => {
    await withServer(async (baseUrl) => {
      if (caso.body) {
        const validaSolicitud = validadorSolicitud(caso.ruta, caso.metodo);
        assert.equal(
          validaSolicitud(caso.body), caso.cumpleSolicitud,
          'la solicitud de la prueba no coincide con el esquema de solicitud del contrato'
        );
      }

      const res = await fetch(`${baseUrl}${caso.ruta}`, {
        method: caso.metodo.toUpperCase(),
        headers: { 'Content-Type': 'application/json' },
        body: caso.body ? JSON.stringify(caso.body) : undefined,
      });
      const cuerpo = await res.json();

      // 1) el código HTTP debe estar documentado y ser el esperado
      assert.equal(res.status, caso.status);
      // 2) el cuerpo debe cumplir el esquema documentado para ese código
      const valida = validadorRespuesta(caso.ruta, caso.metodo, res.status);
      assert.ok(
        valida(cuerpo),
        `Incumple el contrato: ${JSON.stringify(valida.errors)} | cuerpo recibido: ${JSON.stringify(cuerpo)}`
      );

      cubiertos.add(`${caso.metodo.toUpperCase()} ${caso.ruta} ${caso.status}`);
    });
  });
}

test('contrato: toda respuesta documentada en openapi.yaml está verificada por una prueba', () => {
  const documentados = new Set();
  for (const [ruta, ops] of Object.entries(spec.paths)) {
    for (const [metodo, op] of Object.entries(ops)) {
      for (const status of Object.keys(op.responses)) {
        documentados.add(`${metodo.toUpperCase()} ${ruta} ${status}`);
      }
    }
  }
  assert.deepEqual([...documentados].sort(), [...cubiertos].sort());
});
