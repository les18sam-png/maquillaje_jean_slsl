// routes/inventario.js
// MIGRADO — usa helper api.js en lugar de Supabase directo
const express = require('express');
const router  = express.Router();
const { api } = require('../db/api');

// ─── LISTADO / PANTALLA PRINCIPAL ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { q = '', categoria_id = '', alerta = '', pagina = '1' } = req.query;

    const params = new URLSearchParams();
    if (q)               params.append('termino', q);
    if (categoria_id)     params.append('categoria_id', categoria_id);
    if (alerta === '1')   params.append('solo_stock_bajo', 'true');
    params.append('pagina', pagina);
    params.append('por_pagina', '50');

    const data = await api(`/inventario?${params.toString()}`, {}, req.session.token);

    const categoriasData = await api('/productos/categorias/lista', {}, req.session.token).catch(() => ({ items: [] }));

    const lista = (data.items || []).map(p => ({
      ...p,
      id:               p.id ?? p.producto_id,
      categoria_nombre: p.categoria_nombre || '—',
      stock_actual:     p.cantidad_actual,
    }));

    res.render('inventario/index', {
      productos: lista,
      categorias: categoriasData.items || [],
      q, categoria_id, alerta,
      totalProductos:  data.resumen?.productos_activos || 0,
      totalBajoStock:  data.resumen?.productos_stock_bajo || 0,
      paginaActual:    data.pagina || 1,
      totalPaginas:    data.total_paginas || 1,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error en GET /inventario:', err.message);
    res.status(500).send('Error al cargar inventario: ' + err.message);
  }
});

// ─── ENTRADA DE INVENTARIO ────────────────────────────────────────────────────
router.post('/entrada', async (req, res) => {
  const { producto_id, cantidad, notas, q } = req.body;
  const volver = q ? `&q=${encodeURIComponent(q)}` : '';

  try {
    if (!producto_id || !cantidad || parseInt(cantidad) <= 0) {
      return res.redirect(`/inventario?toast=error_entrada${volver}`);
    }

    await api('/inventario/entradas', {
      method: 'POST',
      body: JSON.stringify({
        producto_id,
        cantidad: parseInt(cantidad),
        notas: notas || null,
      }),
    }, req.session.token);

    res.redirect(`/inventario?toast=entrada_ok${volver}`);
  } catch (err) {
    console.error('Error en POST /inventario/entrada:', err.message);
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect(`/inventario?toast=sin_permiso${volver}`);
    res.redirect(`/inventario?toast=error_entrada${volver}`);
  }
});

// ─── AJUSTE DE INVENTARIO ─────────────────────────────────────────────────────
router.post('/ajuste', async (req, res) => {
  const { producto_id, nueva_cantidad, motivo, q } = req.body;
  const volver = q ? `&q=${encodeURIComponent(q)}` : '';

  try {
    if (!producto_id || nueva_cantidad === undefined || nueva_cantidad === '') {
      return res.redirect(`/inventario?toast=error_ajuste${volver}`);
    }
    if (!motivo || motivo.trim().length < 3) {
      return res.redirect(`/inventario?toast=error_ajuste_motivo${volver}`);
    }

    await api('/inventario/ajustes', {
      method: 'POST',
      body: JSON.stringify({
        producto_id,
        nueva_cantidad: parseInt(nueva_cantidad),
        motivo: motivo.trim(),
      }),
    }, req.session.token);

    res.redirect(`/inventario?toast=ajuste_ok${volver}`);
  } catch (err) {
    console.error('Error en POST /inventario/ajuste:', err.message);
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect(`/inventario?toast=sin_permiso${volver}`);
    res.redirect(`/inventario?toast=error_ajuste${volver}`);
  }
});

// ─── KARDEX ───────────────────────────────────────────────────────────────────
// ─── KARDEX ───────────────────────────────────────────────────────────────────
router.get('/kardex', async (req, res) => {
  try {
    const {
      producto_id = '', q = '',
      fecha_desde = '', fecha_hasta = '',
      tipo_movimiento = '', caja_id = '', usuario_id = '',
    } = req.query;

    let movimientos = [];
    let productoSel = null;

    // Listas para los dropdowns de filtro (tolerantes a fallo de permisos)
    const cajasData = await api('/cajas/?solo_activas=true', {}, req.session.token).catch(() => ({ items: [] }));
    const usuariosData = await api('/usuarios/', {}, req.session.token).catch(() => ({ items: [] }));
    const cajas = cajasData.items || [];
    const usuarios = usuariosData.items || [];

    if (producto_id) {
      const params = new URLSearchParams();
      if (fecha_desde)     params.append('fecha_desde', fecha_desde);
      if (fecha_hasta)     params.append('fecha_hasta', fecha_hasta);
      if (tipo_movimiento) params.append('tipo_movimiento', tipo_movimiento);
      if (caja_id)         params.append('caja_id', caja_id);
      if (usuario_id)      params.append('usuario_id', usuario_id);
      const qs = params.toString() ? `?${params.toString()}` : '';

      const kardexData = await api(`/kardex/${producto_id}${qs}`, {}, req.session.token).catch(() => null);

      if (kardexData) {
        const e = kardexData.encabezado;
        productoSel = {
          descripcion:       e.descripcion,
          codigo_barras:     e.codigo_barras,
          categoria_nombre:  e.categoria_nombre,
          stock_actual:      e.existencia_actual,
          inventario_minimo: e.inventario_minimo,
          precio_venta:      e.precio_venta,
          ruta_imagen:       e.ruta_imagen,
        };
        movimientos = kardexData.movimientos || [];
      }
    }

    res.render('inventario/kardex', {
      productoSel, movimientos, producto_id, q,
      cajas, usuarios,
      filtros: { fecha_desde, fecha_hasta, tipo_movimiento, caja_id, usuario_id },
    });
  } catch (err) {
    console.error('Error en GET /inventario/kardex:', err.message);
    res.status(500).send('Error al cargar kardex: ' + err.message);
  }
});
// ─── API BUSCAR PRODUCTO (para el buscador de kardex) ─────────────────────────
router.get('/api/buscar', async (req, res) => {
  try {
    const { q = '' } = req.query;
    if (!q) return res.json([]);

    const data = await api(`/kardex/productos/buscar?termino=${encodeURIComponent(q)}`, {}, req.session.token);

    res.json((data || []).map(p => ({
      ...p,
      stock_actual: p.stock_actual ?? p.cantidad_actual ?? 0,
    })));
  } catch (err) {
    console.error('Error en GET /inventario/api/buscar:', err.message);
    res.json([]);
  }
});

module.exports = router;