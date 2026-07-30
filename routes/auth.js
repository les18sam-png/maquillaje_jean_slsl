// routes/auth.js
// Maneja login y logout. Habla con FastAPI para validar credenciales.

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { api, API_URL } = require('../db/api');

const logoDir = path.join(__dirname, '../public/uploads/logo');

function obtenerLogoActual() {
  try {
    const archivos = fs.readdirSync(logoDir)
      .filter(f => /^logo-.*\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort()
      .reverse();
    return archivos[0] || null;
  } catch {
    return null;
  }
}
// ─────────────────────────────────────────
// GET /auth/login — muestra formulario
// ─────────────────────────────────────────
router.get('/login', (req, res) => {
  // Si ya hay sesión activa, redirige a abrir turno
  if (req.session.token) {
    return res.redirect('/venta');
  }
  res.render('auth/login', { error: req.query.error || null, logoActual: obtenerLogoActual() });
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

    try {
      const sucursal = await api('/sucursales/actual', {}, data.access_token);
      req.session.sucursal_nombre = sucursal?.nombre || null;
    } catch {
      req.session.sucursal_nombre = null;
    }

    // La dueña tiene su propia pantalla exclusiva — no entra al sistema normal
    if (data.permisos?.perm_dueno) {
      return res.redirect('/dashboard-dueno');
    }

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