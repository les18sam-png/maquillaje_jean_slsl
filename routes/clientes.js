// routes/clientes.js
// SmartVenta PDV — Módulo Clientes
// SOLO FRONTEND: todas las llamadas a Supabase las conecta el backend

const express = require('express');
const router  = express.Router();
const { supabase } = require('../db/database');

/* ─────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────── */
const SUCURSAL_ID = process.env.SUCURSAL_ID;
const POR_PAGINA  = 20;

/* ─────────────────────────────────────────
   56 — GET /clientes
   Listado con búsqueda + filtros + paginación
───────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const busqueda = req.query.q        || '';
    const tipo     = req.query.tipo     || '';   // 'normal' | 'mayorista'
    const orden    = req.query.orden    || 'nombre_asc';
    const pagina   = parseInt(req.query.pagina) || 1;
    const desde    = (pagina - 1) * POR_PAGINA;

    // ── Construir query base ──────────────────
    let query = supabase
      .from('clientes')
      .select('*', { count: 'exact' });

    if (busqueda) {
      query = query.or(
        `nombre.ilike.%${busqueda}%,` +
        `correo.ilike.%${busqueda}%,` +
        `telefono.ilike.%${busqueda}%,` +
        `rfc.ilike.%${busqueda}%`
      );
    }

    if (tipo === 'mayorista') query = query.eq('es_mayorista', true);
    if (tipo === 'normal')    query = query.eq('es_mayorista', false);

    // Ordenamiento
    switch (orden) {
      case 'nombre_desc':  query = query.order('nombre',     { ascending: false }); break;
      case 'reciente':     query = query.order('creado_en',  { ascending: false }); break;
      case 'antiguo':      query = query.order('creado_en',  { ascending: true  }); break;
      default:             query = query.order('nombre',     { ascending: true  }); break;
    }

    query = query.range(desde, desde + POR_PAGINA - 1);

    const { data: clientes, count, error } = await query;
    if (error) throw error;

    const totalPaginas = Math.ceil((count || 0) / POR_PAGINA);

    res.render('clientes/index', {
      title:        'Clientes',
      clientes:     clientes || [],
      busqueda,
      tipo,
      orden,
      pagina,
      totalPaginas,
      totalClientes: count || 0,
    });
  } catch (err) {
    console.error('Error en GET /clientes:', err.message);
    res.status(500).render('error', { mensaje: 'No se pudo cargar la lista de clientes.' });
  }
});

/* ─────────────────────────────────────────
   58 — GET /clientes/nuevo
   Formulario de alta
───────────────────────────────────────── */
router.get('/nuevo', (req, res) => {
  res.render('clientes/form', {
    title:   'Nuevo Cliente',
    cliente: null,
    modoEdicion: false,
  });
});

/* ─────────────────────────────────────────
   58 — POST /clientes/nuevo
   Crear cliente
───────────────────────────────────────── */
router.post('/nuevo', async (req, res) => {
  try {
    const {
      nombre, correo, telefono, rfc,
      es_mayorista, direccion, notas,
    } = req.body;

    const { error } = await supabase
      .from('clientes')
      .insert([{
        nombre:       nombre?.trim(),
        correo:       correo?.trim()   || null,
        telefono:     telefono?.trim() || null,
        rfc:          rfc?.trim()      || null,
        es_mayorista: es_mayorista === 'on' || es_mayorista === 'true',
        direccion:    direccion?.trim() || null,
        notas:        notas?.trim()    || null,
      }]);

    if (error) throw error;

    res.redirect('/clientes?toast=creado');
  } catch (err) {
    console.error('Error creando cliente:', err.message);
    res.render('clientes/form', {
      title:       'Nuevo Cliente',
      cliente:     req.body,
      modoEdicion: false,
      error:       'No se pudo guardar el cliente. Verifica los datos.',
    });
  }
});

/* ─────────────────────────────────────────
   59 — GET /clientes/:id
   Detalle / perfil del cliente
───────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Cliente
    const { data: cliente, error: errCliente } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', id)
      .single();

    if (errCliente || !cliente) {
      return res.status(404).render('error', { mensaje: 'Cliente no encontrado.' });
    }

    // Últimas 10 ventas del cliente
    const { data: ventas, error: errVentas } = await supabase
      .from('ventas')
      .select('id, folio, total, metodo_pago, creado_en, estado')
      .eq('cliente_id', id)
      .order('creado_en', { ascending: false })
      .limit(10);

    // Estadísticas rápidas
    const { data: stats } = await supabase
      .from('ventas')
      .select('total')
      .eq('cliente_id', id)
      .eq('estado', 'completada');

    const totalGastado   = (stats || []).reduce((s, v) => s + (v.total || 0), 0);
    const totalCompras   = (stats || []).length;
    const ticketPromedio = totalCompras > 0 ? totalGastado / totalCompras : 0;

    res.render('clientes/detalle', {
      title:          `Cliente — ${cliente.nombre}`,
      cliente,
      ventas:         ventas || [],
      totalGastado,
      totalCompras,
      ticketPromedio,
    });
  } catch (err) {
    console.error('Error en GET /clientes/:id:', err.message);
    res.status(500).render('error', { mensaje: 'Error al cargar el cliente.' });
  }
});

/* ─────────────────────────────────────────
   58 — GET /clientes/:id/editar
   Formulario de edición
───────────────────────────────────────── */
router.get('/:id/editar', async (req, res) => {
  try {
    const { data: cliente, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !cliente) {
      return res.status(404).render('error', { mensaje: 'Cliente no encontrado.' });
    }

    res.render('clientes/form', {
      title:       `Editar — ${cliente.nombre}`,
      cliente,
      modoEdicion: true,
    });
  } catch (err) {
    console.error('Error en GET /clientes/:id/editar:', err.message);
    res.status(500).render('error', { mensaje: 'Error al cargar el formulario.' });
  }
});

/* ─────────────────────────────────────────
   58 — POST /clientes/:id/editar
   Actualizar cliente
───────────────────────────────────────── */
router.post('/:id/editar', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre, correo, telefono, rfc,
      es_mayorista, direccion, notas,
    } = req.body;

    const { error } = await supabase
      .from('clientes')
      .update({
        nombre:       nombre?.trim(),
        correo:       correo?.trim()    || null,
        telefono:     telefono?.trim()  || null,
        rfc:          rfc?.trim()       || null,
        es_mayorista: es_mayorista === 'on' || es_mayorista === 'true',
        direccion:    direccion?.trim() || null,
        notas:        notas?.trim()     || null,
      })
      .eq('id', id);

    if (error) throw error;

    res.redirect(`/clientes/${id}?toast=actualizado`);
  } catch (err) {
    console.error('Error actualizando cliente:', err.message);
    const cliente = { id: req.params.id, ...req.body };
    res.render('clientes/form', {
      title:       'Editar Cliente',
      cliente,
      modoEdicion: true,
      error:       'No se pudo guardar los cambios.',
    });
  }
});

/* ─────────────────────────────────────────
   POST /clientes/:id/eliminar
───────────────────────────────────────── */
router.post('/:id/eliminar', async (req, res) => {
  try {
    const { error } = await supabase
      .from('clientes')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.redirect('/clientes?toast=eliminado');
  } catch (err) {
    console.error('Error eliminando cliente:', err.message);
    res.redirect(`/clientes/${req.params.id}?error=no-se-pudo-eliminar`);
  }
});

module.exports = router;