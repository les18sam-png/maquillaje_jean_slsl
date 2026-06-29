// routes/venta.js
// SmartVenta PDV — Módulo Punto de Venta
// MIGRADO — usa helper api.js en lugar de Supabase directo
// Todas las operaciones pasan por FastAPI (:8000)

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

// ─── HELPER: obtener clientes vía FastAPI ─────────────────────────────────────
// FastAPI filtra por sucursal_id del token — no hace falta filtrar aquí.
async function obtenerClientes(token) {
  try {
    const resultado = await api('/clientes/', {}, token);
    return resultado?.items || [];
  } catch {
    return [];
  }
}

/* ─────────────────────────────────────────
   GET /venta
   Catálogo de productos con buscador
───────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const busqueda  = req.query.q          || '';
    const categoria = req.query.categoria  || '';
    const tipoBusq  = req.query.tipo_busq  || 'nombre';

    const params = new URLSearchParams();
    if (busqueda)  params.append(tipoBusq === 'codigo' ? 'codigo_barras' : 'termino', busqueda);
    if (categoria) params.append('categoria', categoria);

    const [productosRaw, categorias, clientes] = await Promise.all([
      api(`/productos/buscar?${params}`, {}, req.session.token),
      obtenerCategorias(req.session.token),
      obtenerClientes(req.session.token),
    ]);

    const productos = (productosRaw || []).map(p => ({ ...p, nombre: p.descripcion }));

    res.render('venta/index', {
      title: 'Punto de Venta',
      productos,
      categorias,
      clientes,
      busqueda,
      categoria,
      tipoBusq,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error en GET /venta:', err.message);
    res.status(500).send('Error al cargar el catálogo: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   GET /venta/carrito
   Vista del carrito / cobro
───────────────────────────────────────── */
router.get('/carrito', async (req, res) => {
  try {
    const clientes = await obtenerClientes(req.session.token);
    res.render('venta/carrito', {
      title: 'Carrito — Punto de Venta',
      clientes,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
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
    const producto = await api(`/productos/${req.params.id}`, {}, req.session.token);
    res.json({ ...producto, nombre: producto.descripcion });
  } catch (err) {
    if (err.status === 401) return res.status(401).json({ error: 'Sesión expirada' });
    res.status(err.status === 404 ? 404 : 500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────
   POST /venta/cobrar
   Cierra la venta — llama al endpoint de FastAPI que ejecuta
   el RPC registrar_venta_completa (inventario + kardex + auditoría).
   caja_id y turno_id se toman de la sesión de servidor (poblada al
   abrir turno) y se envían en el body para que FastAPI los valide
   contra la base de datos antes de registrar la venta (RNF-03.4).
───────────────────────────────────────── */
router.post('/cobrar', async (req, res) => {
  if (!req.session.caja_id || !req.session.turno_id) {
    return res.status(409).json({
      error: 'No hay un turno abierto en esta caja. Abre turno antes de cobrar.',
    });
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
      body: {
        caja_id: req.session.caja_id,
        turno_id: req.session.turno_id,
        cliente_id: cliente_id || null,
        articulos,
        pagos,
        notas: notas || null,
      },
    }, req.session.token);

    res.json({ ok: true, venta });
  } catch (err) {
    if (err.status === 401) return res.status(401).json({ error: 'Sesión expirada' });
    res.status(err.status || 500).json({ error: err.message || 'Error al registrar la venta.' });
  }
});

module.exports = router;