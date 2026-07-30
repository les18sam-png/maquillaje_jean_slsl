const express = require('express');
const router = express.Router();
const { api } = require('../db/api');

function requiereDueno(req, res, next) {
  if (!req.session.token) return res.redirect('/auth/login?next=/dashboard-dueno');
  if (!req.session.permisos?.perm_dueno) return res.status(403).send('No tienes permiso para acceder a este panel.');
  next();
}

router.get('/', requiereDueno, (req, res) => {
  res.render('dashboard-dueno/index', { title: 'Panel de la Dueña' });
});

router.get('/ventas-dia', requiereDueno, (req, res) => {
  res.render('dashboard-dueno/ventas-dia', { title: 'Ventas del día' });
});

router.get('/productos-faltantes', requiereDueno, (req, res) => {
  res.render('dashboard-dueno/productos-faltantes', { title: 'Productos faltantes' });
});

router.get('/resumen', requiereDueno, async (req, res) => {
  try {
    const { fecha } = req.query;
    const params = new URLSearchParams();
    if (fecha) params.append('fecha', fecha);
    const datos = await api(`/dashboard-dueno/resumen?${params}`, {}, req.session.token);
    res.json(datos);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error al cargar el resumen.' });
  }
});

router.get('/data/ventas-dia', requiereDueno, async (req, res) => {
  try {
    const { fecha, sucursal_id } = req.query;
    const params = new URLSearchParams();
    if (fecha) params.append('fecha', fecha);
    if (sucursal_id) params.append('sucursal_id', sucursal_id);
    const datos = await api(`/dashboard-dueno/ventas-dia?${params}`, {}, req.session.token);
    res.json(datos);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error al cargar las ventas.' });
  }
});

router.get('/data/venta/:id', requiereDueno, async (req, res) => {
  try {
    const datos = await api(`/dashboard-dueno/venta/${req.params.id}/detalle`, {}, req.session.token);
    res.json(datos);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error al cargar el detalle.' });
  }
});

router.get('/data/productos-faltantes', requiereDueno, async (req, res) => {
  try {
    const { sucursal_id } = req.query;
    const params = new URLSearchParams();
    if (sucursal_id) params.append('sucursal_id', sucursal_id);
    const datos = await api(`/dashboard-dueno/productos-faltantes?${params}`, {}, req.session.token);
    res.json(datos);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error al cargar productos faltantes.' });
  }
});

module.exports = router;