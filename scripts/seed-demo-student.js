const { Pool } = require('pg');
const { crearOpcionesPoolPostgres } = require('../src/shared/postgres-pool');
const { cargarEntorno } = require('../src/shared/environment');
const { SupabaseAuthAdminAdapter } = require('../src/modules/identidad/infrastructure/auth/supabase-auth-admin.adapter');
const {
  validarEntornoProvisionamiento,
  sanitizarMensajeAdministrativo,
} = require('./demo-environment');

const EMAIL_RE = /^[a-z0-9._%+-]+@utb\.edu\.co$/i;

function validarConfiguracionSeed(env = process.env) {
  const entorno = validarEntornoProvisionamiento(env);
  const requeridas = [
    'DEMO_STUDENT_ID',
    'DEMO_STUDENT_EMAIL',
    'DEMO_STUDENT_NAME',
    'DEMO_STUDENT_CEDULA',
    'DEMO_STUDENT_PASSWORD',
  ];
  const faltantes = requeridas.filter((nombre) => !env[nombre]?.trim());
  if (faltantes.length > 0) {
    throw new Error(`Faltan variables para cargar el estudiante sintético: ${faltantes.join(', ')}`);
  }

  const correo = env.DEMO_STUDENT_EMAIL.trim().toLowerCase();
  const codigo = env.DEMO_STUDENT_ID.trim();
  const nombre = env.DEMO_STUDENT_NAME.trim();
  const cedula = env.DEMO_STUDENT_CEDULA.trim();
  const contrasena = env.DEMO_STUDENT_PASSWORD;
  if (!EMAIL_RE.test(correo)) {
    throw new Error('DEMO_STUDENT_EMAIL debe usar el dominio sintético @utb.edu.co');
  }
  if (codigo.length < 1 || codigo.length > 64 || nombre.length < 1 || nombre.length > 160) {
    throw new Error('El código o nombre del estudiante sintético no es válido');
  }
  if (!/^\d{8,12}$/.test(cedula)) {
    throw new Error('DEMO_STUDENT_CEDULA debe ser un identificador numérico sintético de 8 a 12 dígitos');
  }
  if (contrasena.length < 12 || contrasena.length > 256) {
    throw new Error('DEMO_STUDENT_PASSWORD debe tener entre 12 y 256 caracteres');
  }

  return {
    ...entorno,
    correo,
    codigo,
    nombre,
    cedula,
    contrasena,
  };
}

function buscarUnico(usuarios, predicado, descripcion) {
  const coincidencias = usuarios.filter(predicado);
  if (coincidencias.length > 1) {
    throw new Error(`Hay más de una identidad Auth que coincide con ${descripcion}; requiere revisión manual`);
  }
  return coincidencias[0] || null;
}

async function buscarPerfilPorCodigo(pool, codigo) {
  const { rows } = await pool.query(
    `SELECT auth_user_id, codigo_estudiante, correo, cedula_sintetica, nombre, activa
     FROM estudiantes
     WHERE codigo_estudiante = $1`,
    [codigo]
  );
  if (rows.length > 1) {
    throw new Error(`El código ${codigo} corresponde a más de un perfil; requiere revisión manual`);
  }
  return rows[0] || null;
}

async function provisionarEstudiante({ pool, authAdmin, config }) {
  const coincidenciasLocales = await pool.query(
    `SELECT auth_user_id, codigo_estudiante, correo, cedula_sintetica, nombre, activa
     FROM estudiantes
     WHERE codigo_estudiante = $1
        OR LOWER(correo) = LOWER($2)
        OR cedula_sintetica = $3`,
    [config.codigo, config.correo, config.cedula]
  );
  const perfil = buscarUnico(
    coincidenciasLocales.rows,
    (row) => row.codigo_estudiante === config.codigo,
    `código estudiantil ${config.codigo}`
  );
  const conflictoLocal = coincidenciasLocales.rows.find((row) =>
    row.codigo_estudiante !== config.codigo
  );
  if (conflictoLocal) {
    throw new Error(
      `El correo o la cédula ya pertenece al código ${conflictoLocal.codigo_estudiante}; no se modificaron datos`
    );
  }
  if (perfil?.correo && perfil.correo.toLowerCase() !== config.correo) {
    throw new Error(
      `El perfil ${config.codigo} tiene otro correo; no se sobrescribió su información`
    );
  }

  let usuarios = await authAdmin.listarUsuarios();
  let usuarioAuth = buscarUnico(
    usuarios,
    (usuario) => usuario.email?.toLowerCase() === config.correo,
    `el correo ${config.correo}`
  );

  if (perfil?.auth_user_id) {
    const usuarioVinculado = buscarUnico(
      usuarios,
      (usuario) => usuario.id === perfil.auth_user_id,
      `el UUID Auth vinculado al código ${config.codigo}`
    );
    if (!usuarioVinculado) {
      throw new Error(
        `El perfil ${config.codigo} referencia un usuario Auth inexistente; reconcilie antes de volver a provisionar`
      );
    }
    if (
      usuarioVinculado.email?.toLowerCase() !== config.correo
      || (usuarioAuth && usuarioAuth.id !== usuarioVinculado.id)
    ) {
      throw new Error(
        `El perfil ${config.codigo} ya está vinculado a otra identidad o correo; no se modificó`
      );
    }
    usuarioAuth = usuarioVinculado;
  }

  if (!usuarioAuth) {
    try {
      usuarioAuth = await authAdmin.crearUsuario({
        correo: config.correo,
        contrasena: config.contrasena,
      });
    } catch (createError) {
      try {
        usuarios = await authAdmin.listarUsuarios();
      } catch (recoveryError) {
        const error = new Error(
          `No se pudo confirmar el resultado de creación Auth para ${config.correo}; revise Auth antes de reintentar`,
          { cause: new AggregateError([createError, recoveryError]) }
        );
        throw error;
      }
      usuarioAuth = buscarUnico(
        usuarios,
        (usuario) => usuario.email?.toLowerCase() === config.correo,
        `el correo ${config.correo}`
      );
      if (!usuarioAuth) throw createError;
    }
  }

  const perfilPorAuth = await pool.query(
    `SELECT codigo_estudiante
     FROM estudiantes
     WHERE auth_user_id = $1`,
    [usuarioAuth.id]
  );
  if (
    perfilPorAuth.rows.some((row) => row.codigo_estudiante !== config.codigo)
  ) {
    throw new Error(
      `La identidad Auth ${usuarioAuth.id} ya está vinculada a otro código; no se modificaron perfiles`
    );
  }

  if (perfil) {
    if (perfil.auth_user_id === usuarioAuth.id) {
      return { status: 'already-linked', codigo: config.codigo, authUserId: usuarioAuth.id };
    }
    const actualizado = await pool.query(
      `UPDATE estudiantes
       SET auth_user_id = $2, correo = COALESCE(correo, $3)
       WHERE codigo_estudiante = $1
         AND auth_user_id IS NULL
         AND (correo IS NULL OR LOWER(correo) = LOWER($3))
       RETURNING codigo_estudiante`,
      [config.codigo, usuarioAuth.id, config.correo]
    );
    if (actualizado.rowCount !== 1) {
      const estadoActual = await buscarPerfilPorCodigo(pool, config.codigo);
      if (
        estadoActual?.auth_user_id === usuarioAuth.id
        && estadoActual.correo?.toLowerCase() === config.correo
      ) {
        return { status: 'already-linked', codigo: config.codigo, authUserId: usuarioAuth.id };
      }
      throw new Error(
        `La cuenta Auth ${usuarioAuth.id} existe, pero el perfil ${config.codigo} cambió durante la vinculación; reconcilie manualmente`
      );
    }
    return { status: 'linked-existing-profile', codigo: config.codigo, authUserId: usuarioAuth.id };
  }

  const insertado = await pool.query(
    `INSERT INTO estudiantes (
       auth_user_id, codigo_estudiante, correo, cedula_sintetica, nombre, activa
     )
     VALUES ($1, $2, $3, $4, $5, TRUE)
     ON CONFLICT DO NOTHING
     RETURNING codigo_estudiante`,
    [usuarioAuth.id, config.codigo, config.correo, config.cedula, config.nombre]
  );
  if (insertado.rowCount === 1) {
    return { status: 'created-profile', codigo: config.codigo, authUserId: usuarioAuth.id };
  }

  const estadoActual = await buscarPerfilPorCodigo(pool, config.codigo);
  if (
    estadoActual?.auth_user_id === usuarioAuth.id
    && estadoActual.correo?.toLowerCase() === config.correo
  ) {
    return { status: 'already-linked', codigo: config.codigo, authUserId: usuarioAuth.id };
  }
  throw new Error(
    `La identidad Auth ${usuarioAuth.id} está disponible, pero no se creó/vinculó el perfil ${config.codigo}; ejecute la reconciliación`
  );
}

async function seedDemoStudent({
  env = process.env,
  PoolImpl = Pool,
  AuthAdminAdapter = SupabaseAuthAdminAdapter,
} = {}) {
  const config = validarConfiguracionSeed(env);
  const authAdmin = new AuthAdminAdapter({
    url: config.supabaseUrl,
    serviceRoleKey: config.serviceRoleKey,
  });
  const pool = new PoolImpl(crearOpcionesPoolPostgres(config.databaseUrl));
  try {
    const resultado = await provisionarEstudiante({ pool, authAdmin, config });
    console.info(
      `Provisionamiento ${resultado.status}: ${resultado.codigo} (${resultado.authUserId})`
    );
    return resultado;
  } catch (error) {
    throw new Error(
      `${sanitizarMensajeAdministrativo(error, env)}. No se eliminaron cuentas ni perfiles automáticamente; ejecute la reconciliación antes de corregir manualmente.`,
      { cause: error }
    );
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  Promise.resolve().then(() => {
    cargarEntorno();
    return seedDemoStudent();
  }).catch((error) => {
    console.error(sanitizarMensajeAdministrativo(error));
    process.exitCode = 1;
  });
}

module.exports = {
  validarConfiguracionSeed,
  provisionarEstudiante,
  seedDemoStudent,
};
