// routes/auth.js
const express = require('express');
const router  = express.Router();
const { api } = require('../db/api');

// GET /auth/login — mostrar pantalla de login
router.get('/login', (req, res) => {
  if (req.session.token) return res.redirect('/');
  res.render('auth/login', {
    title: 'Iniciar Sesión',
    error: req.query.error || null,
  });
});

// POST /auth/login — procesar login
router.post('/login', async (req, res) => {
  try {
    const { nombre_usuario, contrasena } = req.body;

    const datos = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ nombre_usuario, contrasena }),
    });

    // Guardar token y datos del usuario en sesión
    req.session.token         = datos.access_token;
    req.session.usuario       = datos.nombre_completo;
    req.session.usuario_id    = datos.usuario_id;
    req.session.sucursal_id   = datos.sucursal_id;
    req.session.permisos      = datos.permisos;

    res.redirect('/');
  } catch (err) {
    res.redirect('/auth/login?error=credenciales');
  }
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/auth/login');
});

module.exports = router;