const { Pool } = require('pg');
const { crearOpcionesPoolPostgres } = require('../src/shared/postgres-pool');
const { cargarEntorno } = require('../src/shared/environment');
const { SupabaseAuthAdminAdapter } = require('../src/modules/identidad/infrastructure/auth/supabase-auth-admin.adapter');
const {
  validarEntornoProvisionamiento,
  sanitizarMensajeAdministrativo,
} = require('./demo-environment');

const EMAIL_RE = /^[a-z0-9._%+-]+@utb\.edu\.co$/i;

function validarArgumentos(args) {
  const opciones = {};
  for (let index = 0; index < args.length; index += 2) {
    const nombre = args[index];
    const valor = args[index + 1];
    if (!['--student-code', '--email'].includes(nombre) || !valor || valor.startsWith('--')) {
      throw new Error('Uso: npm run db:link-student-auth -- --student-code CODIGO --email XXXX@utb.edu.co');
    }
    if (opciones[nombre]) throw new Error(`Opción duplicada: ${nombre}`);
    opciones[nombre] = valor;
  }
  const codigo = opciones['--student-code']?.trim();
  const correo = opciones['--email']?.trim().toLowerCase();
  if (!codigo || codigo.length > 64 || !correo || !EMAIL_RE.test(correo)) {
    throw new Error('Indique un código de estudiante y un correo sintético @utb.edu.co válidos');
  }
  return { codigo, correo };
}

/** Exige exactamente una cuenta Supabase Auth con ese correo. */
async function buscarUsuarioAuthUnico(authAdmin, correo) {
  const usuarios = await authAdmin.listarUsuarios();
  const coincidencias = usuarios.filter(
    (usuario) => usuario.email.toLowerCase() === correo
  );
  if (coincidencias.length === 0) {
    throw new Error(`No existe una cuenta Supabase Auth con ${correo}; no se modificó PostgreSQL`);
  }
  if (coincidencias.length > 1) {
    throw new Error(`Hay identidades Auth duplicadas para ${correo}; requiere revisión manual`);
  }
  return coincidencias[0];
}

/** Bloquea el perfil (FOR UPDATE) y comprueba que se puede vincular a esa identidad. */
async function obtenerPerfilVinculable(client, codigo, correo, usuarioAuth) {
  const perfilResult = await client.query(
    `SELECT auth_user_id, codigo_estudiante, correo, nombre, cedula_sintetica, activa
     FROM estudiantes
     WHERE codigo_estudiante = $1
     FOR UPDATE`,
    [codigo]
  );
  if (perfilResult.rows.length !== 1) {
    throw new Error(`No existe exactamente un perfil con código ${codigo}`);
  }
  const perfil = perfilResult.rows[0];
  if (perfil.correo && perfil.correo.toLowerCase() !== correo) {
    throw new Error(`El perfil ${codigo} ya tiene otro correo; no se modificó`);
  }

  const otroPerfil = await client.query(
    `SELECT codigo_estudiante
     FROM estudiantes
     WHERE auth_user_id = $1 AND codigo_estudiante <> $2`,
    [usuarioAuth.id, codigo]
  );
  if (otroPerfil.rows.length > 0) {
    throw new Error(
      `La identidad Auth ya está vinculada al código ${otroPerfil.rows[0].codigo_estudiante}; no se modificó`
    );
  }
  return perfil;
}

/** Perfil ya vinculado: solo completa el correo si estaba vacío. */
async function confirmarVinculoExistente(client, perfil, codigo, correo, usuarioAuth) {
  if (perfil.auth_user_id !== usuarioAuth.id) {
    throw new Error(`El perfil ${codigo} ya tiene otra identidad vinculada; no se sobrescribió`);
  }
  if (!perfil.correo) {
    await client.query(
      `UPDATE estudiantes
       SET correo = $2
       WHERE codigo_estudiante = $1 AND auth_user_id = $3 AND correo IS NULL`,
      [codigo, correo, usuarioAuth.id]
    );
  }
  return { status: 'already-linked', codigo, authUserId: usuarioAuth.id };
}

async function vincularPerfilNuevo(client, codigo, correo, usuarioAuth) {
  const actualizado = await client.query(
    `UPDATE estudiantes
     SET auth_user_id = $2, correo = COALESCE(correo, $3)
     WHERE codigo_estudiante = $1
       AND auth_user_id IS NULL
       AND (correo IS NULL OR LOWER(correo) = LOWER($3))
     RETURNING codigo_estudiante`,
    [codigo, usuarioAuth.id, correo]
  );
  if (actualizado.rowCount !== 1) {
    throw new Error(`No se pudo vincular el perfil ${codigo}; no se sobrescribieron sus datos`);
  }
  return { status: 'linked-existing-profile', codigo, authUserId: usuarioAuth.id };
}

/** Ejecuta trabajo(client) en una transacción; si falla, intenta ROLLBACK. */
async function enTransaccion(pool, trabajo) {
  const client = await pool.connect();
  let transaccionIniciada = false;
  try {
    await client.query('BEGIN');
    transaccionIniciada = true;
    const resultado = await trabajo(client);
    await client.query('COMMIT');
    transaccionIniciada = false;
    return resultado;
  } catch (error) {
    if (transaccionIniciada) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        if (error instanceof Error) error.rollbackError = rollbackError;
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

async function vincularPerfilExistente({ pool, authAdmin, codigo, correo }) {
  const usuarioAuth = await buscarUsuarioAuthUnico(authAdmin, correo);
  return enTransaccion(pool, async (client) => {
    const perfil = await obtenerPerfilVinculable(client, codigo, correo, usuarioAuth);
    if (perfil.auth_user_id) {
      return confirmarVinculoExistente(client, perfil, codigo, correo, usuarioAuth);
    }
    return vincularPerfilNuevo(client, codigo, correo, usuarioAuth);
  });
}

async function linkStudentAuth({
  env = process.env,
  args = process.argv.slice(2),
  PoolImpl = Pool,
  AuthAdminAdapter = SupabaseAuthAdminAdapter,
} = {}) {
  const entorno = validarEntornoProvisionamiento(env);
  const { codigo, correo } = validarArgumentos(args);
  const authAdmin = new AuthAdminAdapter({
    url: entorno.supabaseUrl,
    serviceRoleKey: entorno.serviceRoleKey,
  });
  const pool = new PoolImpl(crearOpcionesPoolPostgres(entorno.databaseUrl));
  try {
    const resultado = await vincularPerfilExistente({
      pool,
      authAdmin,
      codigo,
      correo,
    });
    console.info(`Vinculación ${resultado.status}: ${codigo} (${resultado.authUserId})`);
    return resultado;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  Promise.resolve().then(() => {
    cargarEntorno();
    return linkStudentAuth();
  }).catch((error) => {
    console.error(sanitizarMensajeAdministrativo(error));
    process.exitCode = 1;
  });
}

module.exports = {
  validarArgumentos,
  vincularPerfilExistente,
  linkStudentAuth,
};
