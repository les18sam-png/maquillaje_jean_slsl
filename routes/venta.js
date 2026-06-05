// routes/venta.js
// SmartVenta PDV — Módulo Punto de Venta
// SOLO FRONTEND

const express = require('express');
const router  = express.Router();
const { supabase } = require('../db/database');

const SUCURSAL_ID = process.env.SUCURSAL_ID;

/* ─────────────────────────────────────────
   60 — GET /venta
   Catálogo de productos con buscador
───────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const busqueda   = req.query.q          || '';
    const categoria  = req.query.categoria  || '';
    const tipoBusq   = req.query.tipo_busq  || 'nombre'; // 'nombre' | 'codigo'

    // Categorías para el filtro
    const { data: categorias } = await supabase
      .from('categorias')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre');

    // Productos con stock
    let query = supabase
      .from('productos')
      .select(`
        id,
        descripcion,
        codigo_barras,
        precio_venta,
        precio_mayoreo,
        ruta_imagen,
        categoria_id,
        inventario_minimo,
        inventario!inner(cantidad_actual)
      `)
      .eq('activo', true)
      .eq('inventario.sucursal_id', SUCURSAL_ID);

    if (busqueda) {
      if (tipoBusq === 'codigo') {
        query = query.ilike('codigo_barras', `%${busqueda}%`);
      } else {
       query = query.ilike('descripcion', `%${busqueda}%`);
      }
    }

    if (categoria) {
      query = query.eq('categoria_id', categoria);
    }

    query = query.order('descripcion');

    const { data: productos, error } = await query;
if (error) throw error;

const productosNorm = (productos || []).map(p => ({ ...p, nombre: p.descripcion }));

res.render('venta/catalogo', {
  title:      'Punto de Venta',
  productos:  productosNorm,

      categorias: categorias || [],
      busqueda,
      categoria,
      tipoBusq,
    });
  } catch (err) {
    console.error('Error en GET /venta:', err.message);
    res.status(500).render('error', { mensaje: 'No se pudo cargar el catálogo.' });
  }
});

/* ─────────────────────────────────────────
   61 — GET /venta/carrito
   Vista del carrito / cobro
───────────────────────────────────────── */
router.get('/carrito', async (req, res) => {
  try {
    // Clientes para el select
    const { data: clientes } = await supabase
      .from('clientes')
      .select('id, nombre, es_mayorista')
      .order('nombre');

    res.render('venta/carrito', {
      title:    'Carrito — Punto de Venta',
      clientes: clientes || [],
    });
  } catch (err) {
    console.error('Error en GET /venta/carrito:', err.message);
    res.status(500).render('error', { mensaje: 'No se pudo cargar el carrito.' });
  }
});

/* ─────────────────────────────────────────
   GET /venta/producto/:id
   Devuelve datos de un producto en JSON
   (para agregar al carrito por código)
───────────────────────────────────────── */
router.get('/producto/:id', async (req, res) => {
  try {
    const { data: producto, error } = await supabase
      .from('productos')
      .select(`
        id, nombre, codigo_barras,
        precio_venta, precio_mayoreo,
        ruta_imagen,
        inventario(cantidad_actual)
      `)
      .eq('id', req.params.id)
      .eq('inventario.sucursal_id', SUCURSAL_ID)
      .single();

    if (error || !producto) return res.status(404).json({ error: 'Producto no encontrado' });

    res.json(producto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;