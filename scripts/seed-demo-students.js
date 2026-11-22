const { crearPoolPostgres } = require('../src/shared/postgres-pool');
const { cargarEntorno } = require('../src/shared/environment');
const { crearHashContrasena } = require('../src/modules/identidad/infrastructure/auth/contrasena');
const { validarDestinoPostgres, validarRolEsquema } = require('./postgres-destination');
const { sanitizarMensajeAdministrativo } = require('./admin-messages');

const MAX_ESTUDIANTES = 50;
const CODIGO_RE = /^[A-Za-z0-9-]{3,20}$/;
const CORREO_SINTETICO_RE = /^[a-z0-9._%+-]+@utb\.edu\.co$/;
const LONGITUD_MINIMA_CONTRASENA = 12;

/**
 * DEMO_STUDENTS = "codigo|correo|nombre|contraseña;codigo|correo|nombre|contraseña"
 * Un estudiante por bloque separado con ';' y sus 4 campos separados con '|'.
 * Los errores nunca repiten la contraseña.
 */
function parsearEstudiantes(valor) {
  const entradas = String(valor || '')
    .split(';')
    .map((entrada) => entrada.trim())
    .filter(Boolean);
  if (entradas.length > MAX_ESTUDIANTES) {
    throw new Error(`DEMO_STUDENTS admite como máximo ${MAX_ESTUDIANTES} estudiantes`);
  }

  const estudiantes = entradas.map((entrada, indice) => {
    const posicion = `DEMO_STUDENTS, estudiante ${indice + 1}`;
    const campos = entrada.split('|').map((campo) => campo.trim());
    if (campos.length !== 4) {
      throw new Error(`${posicion}: se esperan 4 campos codigo|correo|nombre|contraseña`);
    }
    const [codigo, correoOriginal, nombre, contrasena] = campos;
    const correo = correoOriginal.toLowerCase();
    if (!CODIGO_RE.test(codigo)) {
      throw new Error(`${posicion}: el código debe tener de 3 a 20 letras, números o guiones`);
    }
    if (!CORREO_SINTETICO_RE.test(correo)) {
      throw new Error(`${posicion}: el correo debe terminar en @utb.edu.co`);
    }
    if (nombre.length < 1 || nombre.length > 100) {
      throw new Error(`${posicion}: el nombre debe tener entre 1 y 100 caracteres`);
    }
    if (contrasena.length < LONGITUD_MINIMA_CONTRASENA || contrasena.length > 256) {
      throw new Error(`${posicion}: la contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`);
    }
    return { codigo, correo, nombre, contrasena };
  });

  for (const campo of ['codigo', 'correo']) {
    const valores = estudiantes.map((estudiante) => estudiante[campo].toLowerCase());
    const repetido = valores.find((v, i) => valores.indexOf(v) !== i);
    if (repetido) throw new Error(`DEMO_STUDENTS repite el ${campo} ${repetido}`);
  }
  return estudiantes;
}

function validarConfiguracionSeed(env = process.env) {
  if (env.DB_SEED_ENABLED !== 'true') {
    throw new Error('Defina DB_SEED_ENABLED=true para autorizar la carga de estudiantes de prueba');
  }
  validarDestinoPostgres(env);
  return parsearEstudiantes(env.DEMO_STUDENTS);
}

/**
 * Crea o actualiza los estudiantes en una sola sentencia (todo o nada).
 * Si un correo ya pertenece a otro código, PostgreSQL rechaza la sentencia
 * por el índice único estudiantes_correo_ci_uidx.
 */
async function cargarEstudiantes(pool, estudiantes) {
  if (estudiantes.length === 0) return { creados: 0, actualizados: 0 };
  const hashes = await Promise.all(
    estudiantes.map((estudiante) => crearHashContrasena(estudiante.contrasena))
  );
  const parametros = [];
  const filas = estudiantes.map((estudiante, i) => {
    parametros.push(estudiante.codigo, estudiante.correo, estudiante.nombre, hashes.at(i));
    const base = i * 4;
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, TRUE)`;
  });
  let resultado;
  try {
    resultado = await pool.query(
      `INSERT INTO estudiantes (codigo_estudiante, correo, nombre, password_hash, activa)
       VALUES ${filas.join(', ')}
       ON CONFLICT (codigo_estudiante) DO UPDATE
       SET correo = EXCLUDED.correo,
           nombre = EXCLUDED.nombre,
           password_hash = EXCLUDED.password_hash,
           activa = TRUE
       RETURNING (xmax = 0) AS creado`,
      parametros
    );
  } catch (error) {
    if (error?.code === '23505') {
      throw new Error('Un correo de DEMO_STUDENTS ya pertenece a otro código estudiantil', { cause: error });
    }
    throw error;
  }
  const creados = resultado.rows.filter((fila) => fila.creado).length;
  return { creados, actualizados: resultado.rows.length - creados };
}

async function main(env = process.env, poolFactory = crearPoolPostgres) {
  const estudiantes = validarConfiguracionSeed(env);
  if (estudiantes.length === 0) {
    return { creados: 0, actualizados: 0, omitido: true };
  }
  const pool = poolFactory(env.DB_MIGRATIONS_URL);
  try {
    await validarRolEsquema(pool);
    return await cargarEstudiantes(pool, estudiantes);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  Promise.resolve().then(() => {
    cargarEntorno();
    return main();
  }).then((resultado) => {
    if (resultado.omitido) {
      console.info('DEMO_STUDENTS está vacío: no se cargaron estudiantes de prueba.');
      return;
    }
    console.info(
      `Estudiantes de prueba: ${resultado.creados} creados, ${resultado.actualizados} actualizados.`
    );
  }).catch((error) => {
    console.error(sanitizarMensajeAdministrativo(error));
    process.exitCode = 1;
  });
}

module.exports = { parsearEstudiantes, validarConfiguracionSeed, cargarEstudiantes, main };
