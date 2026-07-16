
// SmartVenta PDV — Ventas del día y Devoluciones
// SOLO FRONTEND — vía FastAPI, sin acceso directo a Supabase

const express = require('express');
const router  = express.Router();
const { api } = require('../db/api');

/* ── Listado de ventas del día ─────────────── */
router.get('/', async (req, res) => {
  try {
    const params = new URLSearchParams();
    if (req.query.fecha_inicio) params.set('fecha_inicio', req.query.fecha_inicio);
    if (req.query.fecha_fin)    params.set('fecha_fin', req.query.fecha_fin);
    if (req.query.estado)       params.set('estado', req.query.estado);
    if (req.query.metodo)       params.set('metodo', req.query.metodo);
    const qs = params.toString();

    const ventas = await api(
      `/ventas/historial/dia${qs ? '?' + qs : ''}`, {}, req.session.token
    );

    res.render('historial/index', {
      title:       'Ventas del día y Devoluciones',
      ventas:      ventas || [],
      totalVentas: (ventas || []).length,
      fechaInicio: req.query.fecha_inicio || '',
      fechaFin:    req.query.fecha_fin || '',
      estado:      req.query.estado || '',
      metodo:      req.query.metodo || '',
      permisos:    req.session.permisos || {},
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error en GET /historial:', err.message);
    res.status(500).send('Error al cargar historial: ' + err.message);
  }
});

/* ── Detalle de una venta ──────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const venta = await api(
      `/ventas/historial/${req.params.id}/detalle`, {}, req.session.token
    );
    res.render('historial/detalle', {
      title:     `Venta #${venta.folio}`,
      venta,
      articulos: venta.venta_articulos || [],
      pagos:     venta.pagos || [],
      permisos:  req.session.permisos || {},
    });
  } catch (err) {
    if (err.status === 404) return res.status(404).send('Venta no encontrada.');
    console.error('Error en GET /historial/:id:', err.message);
    res.status(500).send('Error al cargar detalle: ' + err.message);
  }
});

/* ── Registrar devolución ──────────────────── */
router.post('/:id/devolucion', async (req, res) => {
  if (!req.session.caja_id || !req.session.turno_id) {
    return res.status(409).json({ error: 'No hay turno abierto. Abre turno antes de devolver.' });
  }
  try {
    const resultado = await api(`/ventas/${req.params.id}/devolucion`, {
      method: 'POST',
      body: JSON.stringify({ ...req.body, caja_id: req.session.caja_id }),
    }, req.session.token);
    res.json({ ok: true, resultado });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'No se pudo registrar la devolución.' });
  }
});

/* ── Registrar devolución ──────────────────── */
router.post('/:id/devolucion', async (req, res) => {
  if (!req.session.caja_id || !req.session.turno_id) {
    return res.status(409).json({ error: 'No hay turno abierto. Abre turno antes de devolver.' });
  }
  try {
    const resultado = await api(`/ventas/${req.params.id}/devolucion`, {
      method: 'POST',
      body: JSON.stringify({ ...req.body, caja_id: req.session.caja_id }),
    }, req.session.token);
    res.json({ ok: true, resultado });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'No se pudo registrar la devolución.' });
  }
});

module.exports = router;