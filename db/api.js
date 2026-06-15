// db/api.js
// Cliente HTTP para la API de Python (FastAPI)
// Reemplaza la conexión directa a Supabase

const API_URL = process.env.API_URL || 'http://localhost:8000';

/**
 * Hace una petición a la API con el token JWT de la sesión
 * 
 * @param {string} endpoint - Ej: '/productos/'
 * @param {object} opciones - fetch options (method, body, headers)
 * @param {string} token    - JWT guardado en req.session.token
 * @returns {Promise<object>} - JSON parseado de la respuesta
 */
async function api(endpoint, opciones = {}, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...opciones.headers,
  };

  const config = {
    method: opciones.method || 'GET',
    headers,
  };

  // Solo agregar body si hay datos y no es GET
  if (opciones.body && config.method !== 'GET') {
    config.body = typeof opciones.body === 'string'
      ? opciones.body
      : JSON.stringify(opciones.body);
  }

  try {
    const resp = await fetch(`${API_URL}${endpoint}`, config);

    // Sesión expirada o token inválido
    if (resp.status === 401) {
      const err = new Error('Sesión expirada. Por favor inicia sesión de nuevo.');
      err.status = 401;
      throw err;
    }

    // Sin permisos
    if (resp.status === 403) {
      const err = new Error('No tienes permisos para realizar esta acción.');
      err.status = 403;
      throw err;
    }

    // No encontrado
    if (resp.status === 404) {
      const err = new Error('Recurso no encontrado.');
      err.status = 404;
      throw err;
    }

    // Otros errores
    if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        console.log(`[API] Error ${resp.status} body:`, JSON.stringify(body, null, 2));
        const err = new Error(
            typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail) || `Error ${resp.status}`
        );
        err.status = resp.status;
        throw err;
    }

    // 204 No Content no tiene body
    if (resp.status === 204) return null;

    return resp.json();
  } catch (err) {
    console.error(`[API] ${config.method} ${endpoint}:`, err.message);
    throw err;
  }
}

module.exports = { api, API_URL };