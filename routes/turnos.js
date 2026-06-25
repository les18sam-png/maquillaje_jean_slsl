// routes/turnos.js
// SmartVenta PDV — Módulo Turnos
// MIGRADO — usa helper api.js en lugar de Supabase directo

const express = require('express');
const router  = express.Router();
const { api } = require('../db/api');

/* ─────────────────────────────────────────
   GET /turnos → redirige según estado
   Usa la sesión del servidor; si no hay nada en sesión
   (ej. el server se reinició), consulta a FastAPI si el
   usuario ya tiene un turno abierto en otra caja.
───────────────────────────────────────── */
router.get('/', async (req, res) => {
  if (req.session.turno_id) {
    return res.redirect('/turnos/cierre');
  }

  try {
    const turno = await api('/turnos/mi-activo', {}, req.session.token);
    if (turno) {
      req.session.caja_id  = turno.caja_id;
      req.session.turno_id = turno.id;
      return res.redirect('/turnos/cierre');
    }
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
  }

  res.redirect('/turnos/apertura');
});

/* ─────────────────────────────────────────
   GET /turnos/apertura
───────────────────────────────────────── */
router.get('/apertura', async (req, res) => {
  try {
    const resultado = await api('/cajas/', {}, req.session.token);
    const cajas = (resultado?.items || []).filter(c => !c.es_verificador);

    res.render('turnos/apertura', {
      title: 'Apertura de Turno',
      cajas,
      ahora: new Date().toISOString(),
      error: req.query.error || null,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error en GET /turnos/apertura:', err.message);
    res.status(500).send('Error al cargar apertura de turno: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   POST /turnos/apertura — Abrir turno
   El fondo inicial ahora se registra como movimiento de caja
   dentro del mismo RPC en FastAPI (RF-10.1).
───────────────────────────────────────── */
router.post('/apertura', async (req, res) => {
  const { caja_id, fondo_inicial, notas } = req.body;

  if (!caja_id) return res.redirect('/turnos/apertura?error=sin-caja');

  try {
    const turno = await api('/turnos/abrir', {
      method: 'POST',
      body: {
        caja_id,
        fondo_inicial: parseFloat(fondo_inicial) || 0,
        notas: notas || null,
      },
    }, req.session.token);

    req.session.caja_id  = turno.caja_id;
    req.session.turno_id = turno.id;

    res.redirect('/turnos/cierre?toast=abierto');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 409) return res.redirect('/turnos/apertura?error=ya-abierto');
    console.error('Error abriendo turno:', err.message);
    res.redirect('/turnos/apertura?error=fallo');
  }
});

/* ─────────────────────────────────────────
   GET /turnos/cierre
───────────────────────────────────────── */
router.get('/cierre', async (req, res) => {
  if (!req.session.turno_id) {
    return res.redirect('/turnos/apertura?error=sin-turno');
  }

  try {
    const resumen = await api(`/turnos/${req.session.turno_id}/resumen`, {}, req.session.token);

    const inicio   = new Date(resumen.turno.inicio);
    const ahora    = new Date();
    const diffMs   = ahora - inicio;
    const diffHrs  = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);

    res.render('turnos/cierre', {
      title:    'Cierre de Turno',
      turno:    resumen.turno,
      resumen,
      duracion: `${diffHrs}h ${diffMins}m`,
      inicio:   inicio.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }),
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error en GET /turnos/cierre:', err.message);
    res.status(500).send('Error al cargar cierre de turno: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   POST /turnos/cierre — Cerrar turno
   Requiere perm_corte_caja (validado en FastAPI).
───────────────────────────────────────── */
router.post('/cierre', async (req, res) => {
  if (!req.session.turno_id) {
    return res.redirect('/turnos/apertura?error=sin-turno');
  }

  try {
    await api(`/turnos/${req.session.turno_id}/cerrar`, { method: 'POST' }, req.session.token);

    req.session.caja_id  = null;
    req.session.turno_id = null;

    res.redirect('/turnos/apertura?toast=cerrado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect('/turnos/cierre?error=sin-permiso');
    console.error('Error cerrando turno:', err.message);
    res.redirect('/turnos/cierre?error=fallo');
  }
});

module.exports = router;