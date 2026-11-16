const { IdentidadProveedorError } = require('../../application/identidad.errors');
const { normalizarSupabaseUrl } = require('./supabase-url');

const TIMEOUT_MS = 8000;

class SupabaseAuthAdminAdapter {
  constructor({
    url = process.env.SUPABASE_URL,
    serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetchImpl = globalThis.fetch,
  } = {}) {
    if (typeof url !== 'string' || !url.trim()) {
      throw new TypeError('SUPABASE_URL es requerida para provisionar estudiantes');
    }
    if (typeof serviceRoleKey !== 'string' || !serviceRoleKey.trim()) {
      throw new TypeError('SUPABASE_SERVICE_ROLE_KEY es requerida para provisionar estudiantes');
    }
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('Se requiere una implementación de fetch');
    }
    this.baseUrl = normalizarSupabaseUrl(url);
    this.serviceRoleKey = serviceRoleKey;
    this.fetchImpl = fetchImpl;
  }

  async crearUsuario({ correo, contrasena }) {
    const response = await this.request('/auth/v1/admin/users', {
      method: 'POST',
      body: {
        email: correo,
        password: contrasena,
        email_confirm: true,
      },
    });
    if (!response.ok) {
      throw new IdentidadProveedorError('Supabase Auth no pudo crear la cuenta sintética.');
    }
    if (typeof response.body?.id !== 'string') {
      throw new IdentidadProveedorError('Supabase Auth devolvió una cuenta inválida.');
    }
    return { id: response.body.id };
  }

  async listarUsuarios() {
    const usuarios = [];
    const porPagina = 100;
    for (let pagina = 1; ; pagina += 1) {
      const response = await this.request(
        `/auth/v1/admin/users?page=${pagina}&per_page=${porPagina}`,
        { method: 'GET' }
      );
      if (!response.ok || !Array.isArray(response.body?.users)) {
        throw new IdentidadProveedorError('Supabase Auth no pudo listar las cuentas para reconciliación.');
      }

      for (const usuario of response.body.users) {
        if (typeof usuario.id !== 'string' || typeof usuario.email !== 'string') {
          throw new IdentidadProveedorError('Supabase Auth devolvió una cuenta incompleta al listar usuarios.');
        }
        usuarios.push({ id: usuario.id, email: usuario.email });
      }

      if (response.body.users.length < porPagina) return usuarios;
    }
  }

  async request(path, { method, body } = {}) {
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${this.serviceRoleKey}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new IdentidadProveedorError('No fue posible conectar con Supabase Auth Admin.', error);
    }

    if (response.status === 204) return { ok: response.ok, body: null };
    let responseBody;
    try {
      responseBody = await response.json();
    } catch (error) {
      if (response.ok) {
        throw new IdentidadProveedorError('Supabase Auth Admin devolvió una respuesta inválida.', error);
      }
      responseBody = null;
    }
    return { ok: response.ok, body: responseBody };
  }
}

module.exports = { SupabaseAuthAdminAdapter };
