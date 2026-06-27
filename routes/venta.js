// routes/venta.js
const express = require('express');
const router  = express.Router();
const { api } = require('../db/api');

async function obtenerCategorias(token) {
  try { return (await api('/categorias/', {}, token))?.items || []; } catch { return []; }
}
async function obtenerClientes(token) {
  try { return (await api('/clientes/', {}, token))?.items || []; } catch { return []; }
}

router.get('/', async (req, res) => {
  try {
    const [categorias, clientes, pendientes] = await Promise.all([
      obtenerCategorias(req.session.token),
      obtenerClientes(req.session.token),
      api('/ventas/pendientes', {}, req.session.token).catch(() => []),
    ]);

    res.render('venta/index', {
      title: 'Punto de Venta',
      categorias, clientes,
      pendientes: pendientes || [],
      permisos: req.session.permisos || {},   // ← ver nota al final
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.status(500).send('Error al cargar el punto de venta: ' + err.message);
  }
});

router.get('/buscar', async (req, res) => {
  try {
    const { q = '', categoria = '' } = req.query;
    const params = new URLSearchParams();
    if (q) params.append('termino', q);
    if (categoria) params.append('categoria', categoria);
    params.append('solo_con_stock', 'true');

    const productosRaw = await api(`/productos/buscar?${params}`, {}, req.session.token);
    res.json((productosRaw || []).map(p => ({ ...p, nombre: p.descripcion })));
  } catch (err) {
    if (err.status === 401) return res.status(401).json({ error: 'Sesión expirada' });
    res.status(err.status || 500).json({ error: err.message || 'Error al buscar productos.' });
  }
});

router.get('/producto/:id', async (req, res) => {
  try {
    const producto = await api(`/productos/${req.params.id}`, {}, req.session.token);
    res.json({ ...producto, nombre: producto.descripcion });
  } catch (err) {
    res.status(err.status === 404 ? 404 : 500).json({ error: err.message });
  }
});

/* ── Tickets pendientes ─────────────────── */
router.post('/pendiente', async (req, res) => {
  try {
    const venta = await api('/ventas/pendiente', { method: 'POST', body: req.body }, req.session.token);
    res.json({ ok: true, venta });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error al guardar ticket.' });
  }
});

router.put('/pendiente/:id', async (req, res) => {
  try {
    const venta = await api(`/ventas/pendiente/${req.params.id}`, { method: 'PUT', body: req.body }, req.session.token);
    res.json({ ok: true, venta });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error al actualizar ticket.' });
  }
});

router.delete('/pendiente/:id', async (req, res) => {
  try {
    await api(`/ventas/pendiente/${req.params.id}`, { method: 'DELETE' }, req.session.token);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error al eliminar ticket.' });
  }
});

router.post('/pendiente/:id/cobrar', async (req, res) => {
  try {
    const venta = await api(`/ventas/pendiente/${req.params.id}/cobrar`, { method: 'POST', body: req.body }, req.session.token);
    res.json({ ok: true, venta });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error al cobrar ticket.' });
  }
});

/* ── Venta directa (sin pasar por pendiente) ────────────────── */
router.post('/cobrar', async (req, res) => {
  if (!req.session.caja_id || !req.session.turno_id) {
    return res.status(409).json({ error: 'No hay un turno abierto en esta caja. Abre turno antes de cobrar.' });
  }
  const { cliente_id, articulos, pagos, notas } = req.body;
  if (!Array.isArray(articulos) || articulos.length === 0) {
    return res.status(400).json({ error: 'El carrito está vacío.' });
  }
  if (!Array.isArray(pagos) || pagos.length === 0) {
    return res.status(400).json({ error: 'Debes especificar al menos un método de pago.' });
  }
  try {
    const venta = await api('/ventas/', {
      method: 'POST',
      body: { cliente_id: cliente_id || null, articulos, pagos, notas: notas || null },
    }, req.session.token);
    res.json({ ok: true, venta });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error al registrar la venta.' });
  }
});

/* ── Movimientos de caja manuales (F7/F8) ───────────────────── */
router.post('/movimiento-caja', async (req, res) => {
  try {
    const movimiento = await api('/movimientos-caja/', { method: 'POST', body: req.body }, req.session.token);
    res.json({ ok: true, movimiento });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'No se pudo registrar el movimiento.' });
  }
});

module.exports = router;