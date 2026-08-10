const express = require('express');
const router  = express.Router();
const { api } = require('../db/api');

const POR_PAGINA = 20;

// ─── HELPER: mensaje de error legible según el status ─────────────────────────
function mensajeError(err, accionDefault = 'realizar esta acción') {
  if (err.status === 403) return `No tienes permiso para ${accionDefault}.`;
  if (err.status === 404) return 'El recurso solicitado no existe o fue eliminado.';
  return err.message || 'Ocurrió un error inesperado. Intenta de nuevo.';
}

// ─────────────────────────────────────────
// GET /clientes
// ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const busqueda = req.query.q      || '';
    const tipo     = req.query.tipo   || '';
    const orden    = req.query.orden  || 'nombre_asc';
    const pagina   = parseInt(req.query.pagina) || 1;

    const params = new URLSearchParams();
    if (busqueda) params.append('busqueda', busqueda);
    if (tipo === 'mayorista') params.append('es_mayorista', 'true');
    if (tipo === 'normal')    params.append('es_mayorista', 'false');
    params.append('orden', orden);
    params.append('pagina', pagina);
    params.append('por_pagina', POR_PAGINA);

    const data = await api(`/clientes/?${params}`, {}, req.session.token);

    res.render('clientes/index', {
      title: 'Clientes',
      clientes:      data?.items       || [],
      totalClientes: data?.total       || 0,
      totalPaginas:  Math.ceil((data?.total || 0) / POR_PAGINA),
      busqueda, tipo, orden, pagina,
      toast: req.query.toast || null,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) {
      return res.render('clientes/index', {
        title: 'Clientes',
        clientes: [], totalClientes: 0, totalPaginas: 0,
        busqueda: '', tipo: '', orden: 'nombre_asc', pagina: 1,
        toast: null,
        error: mensajeError(err, 'consultar la lista de clientes'),
      });
    }
    console.error('Error en GET /clientes:', err.message);
    res.status(500).send('No se pudo cargar la lista de clientes.');
  }
});

// ─────────────────────────────────────────
// GET /clientes/nuevo
// ─────────────────────────────────────────
router.get('/nuevo', (req, res) => {
  res.render('clientes/form', {
    title: 'Nuevo Cliente',
    cliente: null,
    modoEdicion: false,
    error: req.query.error || null,
  });
});

// ─────────────────────────────────────────
// POST /clientes/nuevo
// ─────────────────────────────────────────
router.post('/nuevo', async (req, res) => {
  try {
    const { nombre, correo, telefono, es_mayorista, notas } = req.body;

    await api('/clientes/', {
      method: 'POST',
      body: JSON.stringify({
        nombre:       nombre?.trim(),
        correo:       correo?.trim()   || null,
        telefono:     telefono?.trim() || null,
        es_mayorista: es_mayorista === 'on' || es_mayorista === 'true',
        notas:        notas?.trim()    || null,
      }),
    }, req.session.token);

    res.redirect('/clientes?toast=creado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error creando cliente:', err.message);
    res.render('clientes/form', {
      title: 'Nuevo Cliente',
      cliente: req.body,
      modoEdicion: false,
      error: err.status === 403
        ? mensajeError(err, 'crear clientes')
        : 'No se pudo guardar el cliente.',
    });
  }
});

// ─────────────────────────────────────────
// GET /clientes/:id/editar
// ─────────────────────────────────────────
router.get('/:id/editar', async (req, res) => {
  try {
    const cliente = await api(`/clientes/${req.params.id}`, {}, req.session.token);
    res.render('clientes/form', {
      title: `Editar — ${cliente.nombre}`,
      cliente,
      modoEdicion: true,
      error: req.query.error || null,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 404) return res.status(404).send('Cliente no encontrado.');
    if (err.status === 403) return res.redirect('/clientes?error=sin_permiso');
    console.error('Error en GET /clientes/:id/editar:', err.message);
    res.status(500).send('Error al cargar el formulario.');
  }
});

// ─────────────────────────────────────────
// POST /clientes/:id/editar
// ─────────────────────────────────────────
router.post('/:id/editar', async (req, res) => {
  try {
    const { nombre, correo, telefono, es_mayorista, notas } = req.body;

    await api(`/clientes/${req.params.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre:       nombre?.trim(),
        correo:       correo?.trim()    || null,
        telefono:     telefono?.trim()  || null,
        es_mayorista: es_mayorista === 'on' || es_mayorista === 'true',
        notas:        notas?.trim()     || null,
      }),
    }, req.session.token);

    res.redirect(`/clientes/${req.params.id}?toast=actualizado`);
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect(`/clientes/${req.params.id}/editar?error=sin_permiso`);
    console.error('Error actualizando cliente:', err.message);
    res.redirect(`/clientes/${req.params.id}/editar?error=fallo`);
  }
});

// ─────────────────────────────────────────
// GET /clientes/:id
// ─────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [cliente, ventasData] = await Promise.all([
      api(`/clientes/${req.params.id}`, {}, req.session.token),
      api(`/ventas/cliente/${req.params.id}?limite=10`, {}, req.session.token)
        .catch(() => ({ items: [], total: 0, total_gastado: 0 })),
    ]);

    const ventas         = ventasData?.items        || [];
    const totalCompras   = ventasData?.total         || 0;
    const totalGastado   = ventasData?.total_gastado || 0;
    const ticketPromedio = totalCompras > 0 ? totalGastado / totalCompras : 0;

    res.render('clientes/detalle', {
      title: `Cliente — ${cliente.nombre}`,
      cliente, ventas,
      totalGastado, totalCompras, ticketPromedio,
      toast: req.query.toast || null,
      query: req.query, 
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 404) return res.status(404).send('Cliente no encontrado.');
    if (err.status === 403) return res.redirect('/clientes?error=sin_permiso');
    console.error('Error en GET /clientes/:id:', err.message);
    res.status(500).send('Error al cargar el cliente.');
  }
});

// ─────────────────────────────────────────
// POST /clientes/:id/eliminar
// ─────────────────────────────────────────
router.post('/:id/eliminar', async (req, res) => {
  try {
    await api(`/clientes/${req.params.id}`, { method: 'DELETE' }, req.session.token);
    res.redirect('/clientes?toast=eliminado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 409) return res.redirect(`/clientes/${req.params.id}?error=tiene-ventas`);
    if (err.status === 403) return res.redirect(`/clientes/${req.params.id}?error=sin_permiso`);
    console.error('Error eliminando cliente:', err.message);
    res.redirect(`/clientes/${req.params.id}?error=no-se-pudo-eliminar`);
  }
});
module.exports = router;