function normalizarSupabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new TypeError('SUPABASE_URL debe ser una URL válida', { cause: error });
  }

  const hostLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && hostLocal))
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new TypeError(
      'SUPABASE_URL debe usar HTTPS y apuntar a la raíz del proyecto (HTTP solo en localhost)'
    );
  }
  return url.origin;
}

module.exports = { normalizarSupabaseUrl };
