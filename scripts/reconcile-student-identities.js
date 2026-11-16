const { Pool } = require('pg');
const { crearOpcionesPoolPostgres } = require('../src/shared/postgres-pool');
const { cargarEntorno } = require('../src/shared/environment');
const { SupabaseAuthAdminAdapter } = require('../src/modules/identidad/infrastructure/auth/supabase-auth-admin.adapter');
const {
  validarEntornoReconciliacion,
  sanitizarMensajeAdministrativo,
} = require('./demo-environment');

function crearInformeReconciliacion(perfiles, usuariosAuth) {
  const perfilesPorAuthId = new Map();
  for (const perfil of perfiles) {
    if (!perfil.auth_user_id) continue;
    const vinculados = perfilesPorAuthId.get(perfil.auth_user_id) || [];
    vinculados.push(perfil);
    perfilesPorAuthId.set(perfil.auth_user_id, vinculados);
  }

  const perfilesSinAuth = perfiles.filter((perfil) => !perfil.auth_user_id);
  const authSinPerfil = [];
  const authConCandidato = [];
  const correosDesalineados = [];
  const authIdsDuplicados = [...perfilesPorAuthId.entries()]
    .filter(([, vinculados]) => vinculados.length > 1)
    .map(([authUserId, vinculados]) => ({
      authUserId,
      codigosEstudiante: vinculados.map((perfil) => perfil.codigo_estudiante),
    }));

  const usuariosPorId = new Map(usuariosAuth.map((usuario) => [usuario.id, usuario]));
  for (const usuario of usuariosAuth) {
    const vinculados = perfilesPorAuthId.get(usuario.id) || [];
    if (vinculados.length === 0) {
      const candidatos = perfilesSinAuth.filter(
        (perfil) => perfil.correo?.toLowerCase() === usuario.email.toLowerCase()
      );
      if (candidatos.length > 0) {
        authConCandidato.push({
          authUserId: usuario.id,
          correo: usuario.email,
          codigosEstudiante: candidatos.map((perfil) => perfil.codigo_estudiante),
        });
      } else {
        authSinPerfil.push({ authUserId: usuario.id, correo: usuario.email });
      }
      continue;
    }

    for (const perfil of vinculados) {
      if (perfil.correo && perfil.correo.toLowerCase() !== usuario.email.toLowerCase()) {
        correosDesalineados.push({
          authUserId: usuario.id,
          codigoEstudiante: perfil.codigo_estudiante,
          correoPerfil: perfil.correo,
          correoAuth: usuario.email,
        });
      }
    }
  }

  const perfilesConAuthInexistente = perfiles
    .filter((perfil) => perfil.auth_user_id && !usuariosPorId.has(perfil.auth_user_id))
    .map((perfil) => ({
      codigoEstudiante: perfil.codigo_estudiante,
      authUserId: perfil.auth_user_id,
      correo: perfil.correo,
    }));

  return {
    authSinPerfil,
    authConCandidato,
    perfilesSinAuth: perfilesSinAuth.map((perfil) => ({
      codigoEstudiante: perfil.codigo_estudiante,
      correo: perfil.correo,
      activa: perfil.activa,
    })),
    perfilesConAuthInexistente,
    correosDesalineados,
    authIdsDuplicados,
  };
}

async function reconciliarIdentidades({ pool, authAdmin }) {
  const [perfilResult, usuariosAuth] = await Promise.all([
    pool.query(
      `SELECT codigo_estudiante, auth_user_id, correo, activa
       FROM estudiantes
       ORDER BY codigo_estudiante`
    ),
    authAdmin.listarUsuarios(),
  ]);
  return crearInformeReconciliacion(perfilResult.rows, usuariosAuth);
}

async function reconcileStudentIdentities({
  env = process.env,
  PoolImpl = Pool,
  AuthAdminAdapter = SupabaseAuthAdminAdapter,
} = {}) {
  const entorno = validarEntornoReconciliacion(env);
  const authAdmin = new AuthAdminAdapter({
    url: entorno.supabaseUrl,
    serviceRoleKey: entorno.serviceRoleKey,
  });
  const pool = new PoolImpl(crearOpcionesPoolPostgres(entorno.databaseUrl));
  try {
    const informe = await reconciliarIdentidades({ pool, authAdmin });
    console.info(JSON.stringify(informe, null, 2));
    return informe;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  Promise.resolve().then(() => {
    cargarEntorno();
    return reconcileStudentIdentities();
  }).catch((error) => {
    console.error(sanitizarMensajeAdministrativo(error));
    process.exitCode = 1;
  });
}

module.exports = {
  crearInformeReconciliacion,
  reconciliarIdentidades,
  reconcileStudentIdentities,
};
