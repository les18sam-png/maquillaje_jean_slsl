// routes/inventario.js
// MIGRADO — usa helper api.js en lugar de Supabase directo
const express = require('express');
const router  = express.Router();
const { api } = require('../db/api');

// ─── HELPER: obtener categorías vía FastAPI ───────────────────────────────────
async function obtenerCategorias(token) {
  try {
    const resultado = await api('/categorias/', {}, token);
    return resultado?.items || [];
  } catch {
    return [];
  }
}

// ─── LISTADO / PANTALLA PRINCIPAL ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { q = '', categoria_id = '', alerta = '' } = req.query;

  try {
    const params = new URLSearchParams();
    if (q)            params.append('termino', q);
    if (categoria_id) params.append('categoria_id', categoria_id);
    if (alerta === '1') params.append('solo_stock_bajo', 'true');

    const [respuesta, categorias] = await Promise.all([
      api(`/inventario/?${params}`, {}, req.session.token),
      obtenerCategorias(req.session.token),
    ]);

    res.render('inventario/index', {
      productos: respuesta?.items || [],
      categorias,
      q, categoria_id, alerta,
      totalProductos: respuesta?.resumen?.productos_activos || 0,
      totalBajoStock: respuesta?.resumen?.productos_stock_bajo || 0,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.render('inventario/index', {
      productos: [], categorias: [], q, categoria_id, alerta,
      totalProductos: 0, totalBajoStock: 0,
    });
  }
});

// ─── ENTRADA DE INVENTARIO ────────────────────────────────────────────────────
router.post('/entrada', async (req, res) => {
  const { producto_id, cantidad, notas } = req.body;

  console.log('BODY RECIBIDO:', req.body); // ← agregar

  if (!producto_id || !cantidad || parseInt(cantidad) <= 0) {
    console.log('VALIDACIÓN FALLÓ'); // ← agregar
    return res.redirect('/inventario?toast=error_entrada');
  }

  try {
    await api('/inventario/entradas', {
      method: 'POST',
      body: {
        producto_id,
        cantidad: parseInt(cantidad),
        notas: notas || null,
      },
    }, req.session.token);

    res.redirect('/inventario?toast=entrada_ok');
  } catch (err) {
    console.log('ERROR AL LLAMAR API:', err.message, err.status); // ← agregar
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect('/inventario?toast=sin_permiso');
    res.redirect('/inventario?toast=error_entrada');
  }
});

// ─── AJUSTE DE INVENTARIO ─────────────────────────────────────────────────────
router.post('/ajuste', async (req, res) => {
  const { producto_id, nueva_cantidad, motivo } = req.body;

  if (!producto_id || nueva_cantidad === undefined || nueva_cantidad === '' || !motivo) {
    return res.redirect('/inventario?toast=error_ajuste');
  }

  try {
    await api('/inventario/ajustes', {
      method: 'POST',
      body: {
        producto_id,
        nueva_cantidad: parseInt(nueva_cantidad),
        motivo,
      },
    }, req.session.token);

    res.redirect('/inventario?toast=ajuste_ok');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect('/inventario?toast=sin_permiso');
    res.redirect('/inventario?toast=error_ajuste');
  }
});

// ─── KARDEX ───────────────────────────────────────────────────────────────────
router.get('/kardex', async (req, res) => {
  const { producto_id = '', q = '' } = req.query;

  let movimientos = [];
  let productoSel = null;

  if (producto_id) {
    try {
      const resultado = await api(`/kardex/${producto_id}`, {}, req.session.token);

      productoSel = {
        id: resultado.encabezado.producto_id,
        descripcion: resultado.encabezado.descripcion,
        codigo_barras: resultado.encabezado.codigo_barras,
        categoria_nombre: resultado.encabezado.categoria_nombre,
        stock_actual: resultado.encabezado.existencia_actual,
        inventario_minimo: resultado.encabezado.inventario_minimo,
        precio_venta: resultado.encabezado.costo_unitario, // ver nota abajo
        ruta_imagen: null, // el kardex no devuelve imagen — ver nota abajo
      };

      movimientos = resultado.movimientos || [];
    } catch (err) {
      if (err.status === 401) return res.redirect('/auth/login?error=sesion');
      productoSel = null;
      movimientos = [];
    }
  }

  res.render('inventario/kardex', { productoSel, movimientos, producto_id, q });
});

// ─── API BUSCAR PRODUCTO (para el buscador de kardex) ─────────────────────────
router.get('/api/buscar', async (req, res) => {
  const { q = '' } = req.query;
  if (!q) return res.json([]);

  try {
    const resultados = await api(
      `/kardex/productos/buscar?termino=${encodeURIComponent(q)}`,
      {},
      req.session.token,
    );
    res.json((resultados || []).map(p => ({
      ...p,
      stock_actual: p.cantidad_actual,
    })));
  } catch {
    res.json([]);
  }
});

module.exports = router;