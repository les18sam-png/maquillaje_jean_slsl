// db/api.js
// Cliente HTTP para la API de Python
// Reemplaza la conexión directa a Supabase

const API_URL = process.env.API_URL || 'http://localhost:8000';

/**
 * Hace una petición a la API con el token JWT de la sesión
 * @param {string} endpoint  - Ej: '/productos'
 * @param {object} opciones  - fetch options (method, body, etc.)
 * @param {string} token     - JWT guardado en req.session.token
 */
async function api(endpoint, opciones = {}, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...opciones.headers,
  };

  const resp = await fetch(`${API_URL}${endpoint}`, {
    ...opciones,
    headers,
  });

  // Si el token expiró o no es válido
  if (resp.status === 401) {
    const err = new Error('Sesión expirada');
    err.status = 401;
    throw err;
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    const err  = new Error(body.detail || `Error ${resp.status}`);
    err.status = resp.status;
    throw err;
  }

  // 204 No Content no tiene body
  if (resp.status === 204) return null;

  return resp.json();
}

module.exports = { api, API_URL };