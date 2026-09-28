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
const { AforoPostgresAdapter } = require('../src/modules/aforo/infrastructure/persistence/aforo-postgres.adapter');

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

async function withServer(fn, aforoRepository) {
  const app = createApp({ aforoRepository });
  const server = app.listen(0);
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

// Cada caso representa una combinación método/ruta/status documentada.
const casos = [
  { nombre: 'GET /health -> 200', metodo: 'get', ruta: '/health', status: 200 },
  { nombre: 'GET /ready -> 200', metodo: 'get', ruta: '/ready', status: 200 },
  {
    nombre: 'GET /ready -> 503', metodo: 'get', ruta: '/ready', status: 503,
    aforoRepository: {
      obtenerAforoActual: async () => {
        throw new Error('base de datos no disponible');
      },
      actualizarAforo: async () => 0,
    },
  },
  { nombre: 'GET /metrics -> 200', metodo: 'get', ruta: '/metrics', status: 200 },
  { nombre: 'GET /api/v1/aforo -> 200', metodo: 'get', ruta: '/api/v1/aforo', status: 200 },
  {
    nombre: 'GET /api/v1/aforo -> 503', metodo: 'get', ruta: '/api/v1/aforo', status: 503,
    aforoRepository: {
      obtenerAforoActual: async () => {
        throw new Error('detalle interno no expuesto');
      },
      actualizarAforo: async () => 0,
    },
  },
  {
    nombre: 'POST /api/v1/aforo/acceso (ENTRADA) -> 201',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 201,
    body: { tipoAcceso: 'ENTRADA' }, cumpleSolicitud: true,
  },
  {
    nombre: 'POST /api/v1/aforo/acceso (rechazado) -> 400',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 400,
    solicitudes: [
      { body: { tipoAcceso: 'SALIDA' }, cumpleSolicitud: true },
      { body: { tipoAcceso: 'VISITA' }, cumpleSolicitud: false },
      {
        rawBody: '{"tipoAcceso":',
        respuestaEsperada: {
          status: 'error',
          message: 'El cuerpo de la solicitud no contiene un JSON válido.',
        },
      },
    ],
  },
  {
    nombre: 'POST /api/v1/aforo/acceso (repositorio no disponible) -> 503',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 503,
    body: { tipoAcceso: 'ENTRADA' }, cumpleSolicitud: true,
    aforoRepository: new AforoPostgresAdapter({
      pool: {
        connect: async () => {
          throw new Error('detalle interno de PostgreSQL');
        },
      },
    }),
    respuestaEsperada: {
      status: 'error',
      message: 'No fue posible registrar el acceso.',
    },
  },
  {
    nombre: 'POST /api/v1/aforo/acceso (error inesperado) -> 500',
    metodo: 'post', ruta: '/api/v1/aforo/acceso', status: 500,
    body: { tipoAcceso: 'ENTRADA' }, cumpleSolicitud: true,
    aforoRepository: {
      obtenerAforoActual: async () => 0,
      actualizarAforo: async () => {
        throw new Error('detalle interno inesperado');
      },
    },
    respuestaEsperada: {
      status: 'error',
      message: 'Error interno al registrar el acceso.',
    },
  },
];

const cubiertos = new Set();

for (const caso of casos) {
  test(`contrato: ${caso.nombre}`, async () => {
    const solicitudes = caso.solicitudes || [{
      body: caso.body,
      cumpleSolicitud: caso.cumpleSolicitud,
    }];

    await withServer(async (baseUrl) => {
      for (const solicitud of solicitudes) {
        if (solicitud.body !== undefined) {
          const validaSolicitud = validadorSolicitud(caso.ruta, caso.metodo);
          assert.equal(
            validaSolicitud(solicitud.body), solicitud.cumpleSolicitud,
            'la solicitud de la prueba no coincide con el esquema de solicitud del contrato'
          );
        }

        const res = await fetch(`${baseUrl}${caso.ruta}`, {
          method: caso.metodo.toUpperCase(),
          headers: { 'Content-Type': solicitud.contentType || 'application/json' },
          body: solicitud.rawBody ?? (solicitud.body !== undefined
            ? JSON.stringify(solicitud.body)
            : undefined),
        });
        const cuerpo = await res.json();

        // 1) el código HTTP debe estar documentado y ser el esperado
        assert.equal(res.status, caso.status);
        if (res.status >= 400) {
          assert.match(res.headers.get('content-type'), /^application\/json\b/);
        }

        const respuestaEsperada = solicitud.respuestaEsperada || caso.respuestaEsperada;
        if (respuestaEsperada) assert.deepStrictEqual(cuerpo, respuestaEsperada);

        if (caso.ruta === '/api/v1/aforo' && caso.status === 503) {
          assert.match(res.headers.get('content-type'), /^application\/json\b/);
          assert.deepStrictEqual(cuerpo, {
            status: 'error',
            message: 'No fue posible consultar el aforo.',
          });
        }

        if (caso.ruta === '/metrics') {
          const metricas = cuerpo.access_operations_total;
          assert.ok(metricas, 'la respuesta debe incluir access_operations_total');
          for (const nombre of ['entrada', 'salida', 'total']) {
            assert.ok(Number.isInteger(metricas[nombre]), `${nombre} debe ser entero`);
            assert.ok(metricas[nombre] >= 0, `${nombre} no debe ser negativo`);
          }
          assert.equal(metricas.total, metricas.entrada + metricas.salida);
        }

        // 2) el cuerpo debe cumplir el esquema documentado para ese código
        const valida = validadorRespuesta(caso.ruta, caso.metodo, res.status);
        assert.ok(
          valida(cuerpo),
          `Incumple el contrato: ${JSON.stringify(valida.errors)} | cuerpo recibido: ${JSON.stringify(cuerpo)}`
        );
      }

      cubiertos.add(`${caso.metodo.toUpperCase()} ${caso.ruta} ${caso.status}`);
    }, caso.aforoRepository);
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
