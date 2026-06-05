// routes/inventario.js
const express  = require('express');
const router   = express.Router();
const { supabase } = require('../db/database');

const SUCURSAL_ID = process.env.SUCURSAL_ID;

// ─── EXISTENCIAS ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { q = '', categoria_id = '', alerta = '' } = req.query;

  let query = supabase
    .from('productos')
    .select('*, categorias(nombre), inventario(cantidad_actual)')
    .eq('sucursal_id', SUCURSAL_ID)
    .eq('activo', true)
    .order('descripcion');

  if (q) query = query.or(`codigo_barras.ilike.%${q}%,descripcion.ilike.%${q}%`);
  if (categoria_id) query = query.eq('categoria_id', categoria_id);

  const { data: productos } = await query;
  const { data: categorias } = await supabase
    .from('categorias').select('*').eq('activo', true).order('nombre');

  let lista = (productos || []).map(p => ({
    ...p,
    categoria_nombre: p.categorias?.nombre || '—',
    stock_actual:     p.inventario?.[0]?.cantidad_actual ?? 0
  }));

  if (alerta === '1') lista = lista.filter(p => p.stock_actual <= p.inventario_minimo);

  const totalProductos  = lista.length;
  const totalBajoStock  = lista.filter(p => p.stock_actual <= p.inventario_minimo).length;

  res.render('inventario/index', {
    productos: lista,
    categorias: categorias || [],
    q, categoria_id, alerta,
    totalProductos, totalBajoStock
  });
});

// ─── ENTRADA DE INVENTARIO ────────────────────────────────────────────────────
router.post('/entrada', async (req, res) => {
  const { producto_id, cantidad, notas } = req.body;
  if (!producto_id || !cantidad || parseInt(cantidad) <= 0) {
    return res.redirect('/inventario?toast=error_entrada');
  }

  // Obtener stock actual
  const { data: inv } = await supabase
    .from('inventario')
    .select('cantidad_actual')
    .eq('producto_id', producto_id)
    .eq('sucursal_id', SUCURSAL_ID)
    .single();

  const stockAntes   = inv?.cantidad_actual ?? 0;
  const stockDespues = stockAntes + parseInt(cantidad);

  // Actualizar inventario
  await supabase.from('inventario')
    .update({ cantidad_actual: stockDespues, ultima_actualizacion: new Date().toISOString() })
    .eq('producto_id', producto_id)
    .eq('sucursal_id', SUCURSAL_ID);

  // Registrar en kardex
  await supabase.from('kardex').insert({
    producto_id,
    sucursal_id:          SUCURSAL_ID,
    usuario_id:           '00000000-0000-0000-0000-000000000000', // temporal hasta tener auth
    tipo_movimiento:      'entrada_mercancia',
    tipo_referencia:      'entrada',
    cantidad_entrada:     parseInt(cantidad),
    cantidad_salida:      0,
    existencia_resultante: stockDespues,
    costo_unitario:       0,
    notas:                notas || null
  });

  res.redirect('/inventario?toast=entrada_ok');
});

// ─── AJUSTE DE INVENTARIO ─────────────────────────────────────────────────────
router.post('/ajuste', async (req, res) => {
  const { producto_id, nueva_cantidad, notas } = req.body;
  if (!producto_id || nueva_cantidad === undefined || nueva_cantidad === '') {
    return res.redirect('/inventario?toast=error_ajuste');
  }

  const { data: inv } = await supabase
    .from('inventario')
    .select('cantidad_actual')
    .eq('producto_id', producto_id)
    .eq('sucursal_id', SUCURSAL_ID)
    .single();

  const stockAntes   = inv?.cantidad_actual ?? 0;
  const stockDespues = parseInt(nueva_cantidad);
  const diff         = stockDespues - stockAntes;

  await supabase.from('inventario')
    .update({ cantidad_actual: stockDespues, ultima_actualizacion: new Date().toISOString() })
    .eq('producto_id', producto_id)
    .eq('sucursal_id', SUCURSAL_ID);

  await supabase.from('kardex').insert({
    producto_id,
    sucursal_id:           SUCURSAL_ID,
    usuario_id:            '00000000-0000-0000-0000-000000000000',
    tipo_movimiento:       'ajuste_inventario',
    tipo_referencia:       'ajuste',
    cantidad_entrada:      diff > 0 ? diff : 0,
    cantidad_salida:       diff < 0 ? Math.abs(diff) : 0,
    existencia_resultante: stockDespues,
    costo_unitario:        0,
    notas:                 notas || null
  });

  res.redirect('/inventario?toast=ajuste_ok');
});

// ─── KARDEX ───────────────────────────────────────────────────────────────────
router.get('/kardex', async (req, res) => {
  const { producto_id = '', q = '' } = req.query;

  let movimientos = [];
  let productoSel = null;

  if (producto_id) {
    const { data: prod } = await supabase
      .from('productos')
      .select('*, categorias(nombre), inventario(cantidad_actual)')
      .eq('id', producto_id)
      .single();

    productoSel = prod ? {
      ...prod,
      categoria_nombre: prod.categorias?.nombre || '—',
      stock_actual:     prod.inventario?.[0]?.cantidad_actual ?? 0
    } : null;

    const { data: kardex } = await supabase
      .from('kardex')
      .select('*')
      .eq('producto_id', producto_id)
      .eq('sucursal_id', SUCURSAL_ID)
      .order('fecha_hora', { ascending: false });

    movimientos = kardex || [];
  }

  res.render('inventario/kardex', { productoSel, movimientos, producto_id, q });
});

// ─── API BUSCAR PRODUCTO (para modales) ───────────────────────────────────────
router.get('/api/buscar', async (req, res) => {
  const { q = '' } = req.query;
  if (!q) return res.json([]);

  const { data } = await supabase
    .from('productos')
    .select('id, codigo_barras, descripcion, precio_venta, inventario(cantidad_actual)')
    .eq('sucursal_id', SUCURSAL_ID)
    .eq('activo', true)
    .or(`codigo_barras.ilike.%${q}%,descripcion.ilike.%${q}%`)
    .limit(15);

  res.json((data || []).map(p => ({
    ...p,
    stock_actual: p.inventario?.[0]?.cantidad_actual ?? 0
  })));
});

module.exports = router;