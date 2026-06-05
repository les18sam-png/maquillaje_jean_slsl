// routes/historial.js
// SmartVenta PDV — Módulo Historial
// SOLO FRONTEND

const express = require('express');
const router  = express.Router();
const { supabase } = require('../db/database');

const SUCURSAL_ID = process.env.SUCURSAL_ID;
const POR_PAGINA  = 20;

/* ─────────────────────────────────────────
   68 — GET /historial
   Listado con filtros + paginación
───────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const fechaInicio = req.query.fecha_inicio || '';
    const fechaFin    = req.query.fecha_fin    || '';
    const estado      = req.query.estado       || '';
    const metodo      = req.query.metodo       || '';
    const pagina      = parseInt(req.query.pagina) || 1;
    const desde       = (pagina - 1) * POR_PAGINA;

    let query = supabase
      .from('ventas')
      .select(`
        id, folio, total, metodo_pago_principal,
        estado, creado_en, aplico_mayoreo,
        usuarios(nombre_completo),
        clientes(nombre),
        cajas(nombre)
      `, { count: 'exact' })
      .eq('sucursal_id', SUCURSAL_ID);

    if (fechaInicio) query = query.gte('creado_en', fechaInicio);
    if (fechaFin)    query = query.lte('creado_en', fechaFin + 'T23:59:59');
    if (estado)      query = query.eq('estado', estado);
    if (metodo)      query = query.eq('metodo_pago_principal', metodo);

    query = query
      .order('creado_en', { ascending: false })
      .range(desde, desde + POR_PAGINA - 1);

    const { data: ventas, count, error } = await query;
    if (error) throw error;

    const totalPaginas = Math.ceil((count || 0) / POR_PAGINA);

    res.render('historial/index', {
      title:        'Historial de Ventas',
      ventas:       ventas || [],
      fechaInicio,
      fechaFin,
      estado,
      metodo,
      pagina,
      totalPaginas,
      totalVentas:  count || 0,
    });
  } catch (err) {
    console.error('Error en GET /historial:', err.message);
    res.status(500).send('Error al cargar historial: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   70 — GET /historial/:id
   Detalle de venta
───────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Venta principal
    const { data: venta, error: errVenta } = await supabase
      .from('ventas')
      .select(`
        id, folio, total, metodo_pago_principal,
        estado, creado_en, aplico_mayoreo, motivo_mayoreo, notas,
        cancelado_en,
        usuarios(nombre_completo),
        clientes(id, nombre, telefono, es_mayorista),
        cajas(nombre),
        turnos(inicio)
      `)
      .eq('id', id)
      .single();

    if (errVenta || !venta) {
      return res.status(404).send('Venta no encontrada.');
    }

    // Artículos de la venta
    const { data: articulos } = await supabase
      .from('venta_articulos')
      .select(`
        id, cantidad, precio_unitario,
        uso_precio_mayoreo, descuento,
        productos(descripcion, codigo_barras, ruta_imagen)
      `)
      .eq('venta_id', id);

    // Pagos
    const { data: pagos } = await supabase
      .from('pagos')
      .select('id, metodo, monto, cambio, referencia')
      .eq('venta_id', id);

    res.render('historial/detalle', {
      title:     `Venta #${venta.folio}`,
      venta,
      articulos: articulos || [],
      pagos:     pagos     || [],
    });
  } catch (err) {
    console.error('Error en GET /historial/:id:', err.message);
    res.status(500).send('Error al cargar detalle: ' + err.message);
  }
});

module.exports = router;