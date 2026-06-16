// routes/auth.js
// Maneja login y logout. Habla con FastAPI para validar credenciales.

const express = require('express');
const router = express.Router();
const { api, API_URL } = require('../db/api');

// ─────────────────────────────────────────
// GET /auth/login — muestra formulario
// ─────────────────────────────────────────
router.get('/login', (req, res) => {
  // Si ya hay sesión activa, redirige a inicio
  if (req.session.token) {
    return res.redirect('/');
  }
  res.render('auth/login', { error: req.query.error || null });
});

// ─────────────────────────────────────────
// POST /auth/login — valida con FastAPI
// ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { nombre_usuario, contrasena } = req.body;

  if (!nombre_usuario || !contrasena) {
    return res.redirect('/auth/login?error=credenciales');
  }

  try {
    // Llamada directa a FastAPI (sin token, login es público)
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_usuario, contrasena }),
    });

    if (!response.ok) {
      return res.redirect('/auth/login?error=credenciales');
    }

    const data = await response.json();

    // Guardar todo lo necesario en la sesión
    req.session.token = data.access_token;
    req.session.usuario = {
      id: data.usuario_id,
      nombre_completo: data.nombre_completo,
    };
    req.session.sucursal_id = data.sucursal_id;
    req.session.rol_id = data.rol_id;
    req.session.permisos = data.permisos;

    res.redirect('/');
  } catch (err) {
    console.error('[Login] Error:', err.message);
    res.redirect('/auth/login?error=credenciales');
  }
});

// ─────────────────────────────────────────
// POST /auth/logout — cierra sesión
// ─────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('[Logout] Error:', err.message);
    res.redirect('/auth/login');
  });
});

// GET /auth/logout también funciona
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/auth/login'));
});

module.exports = router;