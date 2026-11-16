const { SupabaseAuthPort } = require('../../application/ports/supabase-auth.port');
const {
  CredencialesInvalidasError,
  IdentidadProveedorError,
} = require('../../application/identidad.errors');
const { normalizarSupabaseUrl } = require('./supabase-url');

const TIMEOUT_MS = 8000;

function esUuid(valor) {
  return typeof valor === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor);
}

class SupabaseAuthAdapter extends SupabaseAuthPort {
  constructor({
    url = process.env.SUPABASE_URL,
    apiKey,
    anonKey,
    env = process.env,
    fetchImpl = globalThis.fetch,
  } = {}) {
    super();
    const resolvedApiKey = apiKey
      || anonKey
      || env.SUPABASE_PUBLISHABLE_KEY
      || env.SUPABASE_ANON_KEY;
    if (typeof url !== 'string' || !url.trim()) {
      throw new TypeError('SUPABASE_URL es requerida para autenticar estudiantes');
    }
    if (typeof resolvedApiKey !== 'string' || !resolvedApiKey.trim()) {
      throw new TypeError(
        'SUPABASE_PUBLISHABLE_KEY o SUPABASE_ANON_KEY es requerida para autenticar estudiantes'
      );
    }
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('Se requiere una implementación de fetch');
    }

    this.baseUrl = normalizarSupabaseUrl(url);
    this.apiKey = resolvedApiKey;
    this.fetchImpl = fetchImpl;
  }

  async iniciarSesion(correo, contrasena) {
    const respuesta = await this.solicitar('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: correo, password: contrasena },
    });

    if (respuesta.status === 400 || respuesta.status === 401) {
      throw new CredencialesInvalidasError();
    }
    if (!respuesta.ok) {
      throw new IdentidadProveedorError('Supabase Auth no pudo iniciar la sesión.');
    }

    const { access_token: token, expires_at: expiresAt, expires_in: expiresIn, user } = respuesta.body || {};
    if (
      typeof token !== 'string'
      || !esUuid(user?.id)
      || typeof user.email !== 'string'
    ) {
      throw new IdentidadProveedorError('Supabase Auth devolvió una respuesta de sesión inválida.');
    }

    const expiresAtMs = Number.isFinite(expiresAt)
      ? expiresAt * 1000
      : Date.now() + (Number.isFinite(expiresIn) ? expiresIn * 1000 : 0);
    if (expiresAtMs <= Date.now()) {
      throw new IdentidadProveedorError('Supabase Auth devolvió una sesión vencida.');
    }

    return {
      token,
      expiresAt: new Date(expiresAtMs).toISOString(),
      usuario: { id: user.id, correo: user.email },
    };
  }

  async obtenerUsuario(tokenAcceso) {
    const respuesta = await this.solicitar('/auth/v1/user', {
      method: 'GET',
      tokenAcceso,
    });
    if (respuesta.status === 401 || respuesta.status === 403) return null;
    if (!respuesta.ok) {
      throw new IdentidadProveedorError('Supabase Auth no pudo validar la sesión.');
    }

    const { id, email } = respuesta.body || {};
    if (!esUuid(id) || typeof email !== 'string') {
      throw new IdentidadProveedorError('Supabase Auth devolvió una identidad inválida.');
    }
    return { id, correo: email };
  }

  async solicitar(path, { method, body, tokenAcceso } = {}) {
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          apikey: this.apiKey,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(tokenAcceso ? { Authorization: `Bearer ${tokenAcceso}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new IdentidadProveedorError('No fue posible conectar con Supabase Auth.', error);
    }

    let responseBody;
    try {
      responseBody = await response.json();
    } catch (error) {
      if (response.ok) {
        throw new IdentidadProveedorError('Supabase Auth devolvió una respuesta inválida.', error);
      }
      responseBody = null;
    }

    return { ok: response.ok, status: response.status, body: responseBody };
  }
}

module.exports = { SupabaseAuthAdapter };
