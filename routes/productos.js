// routes/productos.js
// MIGRADO — usa helper api.js en lugar de Supabase directo
// Todas las operaciones pasan por FastAPI (:8000)

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { api, API_URL } = require('../db/api');

// ─── MULTER ───────────────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../public/uploads/productos');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
    cb(null, name);
  }
});

const filtroPorFormato = (req, file, cb) => {
  const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
  permitidos.includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error('Formato no permitido'), false);
};

const upload = multer({
  storage,
  fileFilter: filtroPorFormato,
  limits: { fileSize: 2 * 1024 * 1024 }
});

// ─── HELPER: obtener categorías vía FastAPI ───────────────────────────────────
async function obtenerCategorias(token) {
  try {
    const resultado = await api('/categorias/', {}, token);
    return resultado?.items || [];
  } catch {
    return [];
  }
}

// ─── HELPER: obtener promociones vía FastAPI ──────────────────────────────────
async function obtenerPromociones(token) {
  try {
    const resultado = await api('/promociones/', {}, token);
    return resultado?.items || [];
  } catch {
    return [];
  }
}

// ─── LISTADO ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { q = '', categoria_id = '' } = req.query;
  const hayFiltros = q || categoria_id;

  try {
    const params = new URLSearchParams();
    if (q)            params.append('termino', q);
    if (categoria_id) params.append('categoria', categoria_id);

    // Sin filtros — no consultar productos
    const productos = hayFiltros
      ? await api(`/productos/buscar?${params}`, {}, req.session.token)
      : [];

    const categorias = await obtenerCategorias(req.session.token);

    res.render('productos/index', {
      productos: productos || [],
      categorias,
      q,
      categoria_id,
      hayFiltros: !!hayFiltros,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.render('productos/index', { productos: [], categorias: [], q, categoria_id, hayFiltros: false });
  }
});
// ─── FORMULARIO NUEVO ─────────────────────────────────────────────────────────
router.get('/nuevo', async (req, res) => {
  try {
    const categorias = await obtenerCategorias(req.session.token);
    res.render('productos/form', {
      producto: null,
      categorias,
      error: null,
      exito: req.query.exito === '1',
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.render('productos/form', { producto: null, categorias: [], error: null });
  }
});

// ─── CREAR PRODUCTO ───────────────────────────────────────────────────────────
router.post('/nuevo', upload.single('imagen'), async (req, res) => {
  const {
    codigo_barras, descripcion, categoria_id,
    precio_venta, precio_mayoreo, costo_unitario,
    inventario_minimo, estado
  } = req.body;

  if (!descripcion || !precio_venta || !precio_mayoreo) {
    if (req.file) fs.unlinkSync(req.file.path);
    const categorias = await obtenerCategorias(req.session.token);
    return res.render('productos/form', {
      producto: null,
      categorias,
      error: 'Descripción, precio de venta y precio de mayoreo son obligatorios.',
    });
  }

  try {
    await api('/productos/', {
      method: 'POST',
      body: {
        codigo_barras:     codigo_barras  || null,
        descripcion,
        categoria_id:      categoria_id   || null,
        precio_venta:      parseFloat(precio_venta),
        precio_mayoreo:    parseFloat(precio_mayoreo),
        costo_unitario:    parseFloat(costo_unitario)    || 0,
        inventario_minimo: parseInt(inventario_minimo)   || 0,
        ruta_imagen:       req.file ? req.file.filename  : null,
        activo:            estado !== 'inactivo',
      },
    }, req.session.token);

    res.redirect('/productos/nuevo?exito=1');
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');

    const categorias = await obtenerCategorias(req.session.token);
    const mensaje = err.message?.includes('unique') || err.message?.includes('duplicado')
      ? 'Ya existe un producto con ese código de barras.'
      : 'Error al guardar el producto.';

    res.render('productos/form', { producto: null, categorias, error: mensaje });
  }
});

// ─── FORMULARIO EDITAR ────────────────────────────────────────────────────────
router.get('/editar/:id', async (req, res) => {
  try {
    const [producto, categorias] = await Promise.all([
      api(`/productos/${req.params.id}`, {}, req.session.token),
      obtenerCategorias(req.session.token),
    ]);
    res.render('productos/form', {
      producto,
      categorias,
      error: null,
      exito: req.query.exito === '1',
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.redirect('/productos');
  }
});

// ─── ACTUALIZAR PRODUCTO ──────────────────────────────────────────────────────
router.post('/editar/:id', upload.single('imagen'), async (req, res) => {
  const { id } = req.params;
  const {
    codigo_barras, descripcion, categoria_id,
    precio_venta, precio_mayoreo, costo_unitario,
    inventario_minimo, estado
  } = req.body;

  if (!descripcion || !precio_venta || !precio_mayoreo) {
    if (req.file) fs.unlinkSync(req.file.path);
    const categorias = await obtenerCategorias(req.session.token);
    const producto = await api(`/productos/${id}`, {}, req.session.token).catch(() => null);
    return res.render('productos/form', {
      producto,
      categorias,
      error: 'Descripción, precio de venta y precio de mayoreo son obligatorios.',
    });
  }

  try {
    let imagenAnterior = null;
    if (req.file) {
      const productoActual = await api(`/productos/${id}`, {}, req.session.token);
      imagenAnterior = productoActual?.ruta_imagen || null;
    }

    const cuerpo = {
      codigo_barras:     codigo_barras  || null,
      descripcion,
      categoria_id:      categoria_id   || null,
      precio_venta:      parseFloat(precio_venta),
      precio_mayoreo:    parseFloat(precio_mayoreo),
      costo_unitario:    parseFloat(costo_unitario)  || 0,
      inventario_minimo: parseInt(inventario_minimo) || 0,
      activo:            estado !== 'inactivo',
    };

    if (req.file) cuerpo.ruta_imagen = req.file.filename;

    await api(`/productos/${id}`, { method: 'PUT', body: cuerpo }, req.session.token);

    if (req.file && imagenAnterior) {
      const rutaAnterior = path.join(uploadsDir, imagenAnterior);
      if (fs.existsSync(rutaAnterior)) fs.unlinkSync(rutaAnterior);
    }

    res.redirect('/productos?toast=editado');
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');

    const categorias = await obtenerCategorias(req.session.token);
    const producto = await api(`/productos/${id}`, {}, req.session.token).catch(() => null);
    res.render('productos/form', {
      producto,
      categorias,
      error: 'Error al actualizar el producto.',
    });
  }
});

// ─── TOGGLE ACTIVO / INACTIVO (soft delete) ───────────────────────────────────
router.post('/toggle/:id', async (req, res) => {
  try {
    const producto = await api(`/productos/${req.params.id}`, {}, req.session.token);
    const nuevoEstado = !producto.activo;

    await api(`/productos/${req.params.id}/visibilidad?activo=${nuevoEstado}`, {
      method: 'PATCH',
    }, req.session.token);

    res.json({ ok: true, estado: nuevoEstado ? 'activo' : 'inactivo' });
  } catch (err) {
    res.json({ ok: false, mensaje: err.message });
  }
});

// ─── API BUSCAR (usada por POS y verificador) ─────────────────────────────────
router.get('/api/buscar', async (req, res) => {
  const { q = '' } = req.query;
  if (!q) return res.json([]);

  try {
    const productos = await api(
      `/productos/buscar?termino=${encodeURIComponent(q)}`,
      {},
      req.session.token,
    );

    res.json((productos || []).map(p => ({
      ...p,
      codigo:    p.codigo_barras,
      imagen:    p.ruta_imagen,
      categoria: p.categoria_nombre,
    })));
  } catch {
    res.json([]);
  }
});

// ─── DEPARTAMENTOS ────────────────────────────────────────────────────────────
router.get('/departamentos', async (req, res) => {
   try {
    const resultado = await api('/categorias/', {}, req.session.token);
    const categorias = (resultado?.items || []);
    res.render('productos/departamentos', { categorias, editando: null, error: null });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.render('productos/departamentos', { categorias: [], editando: null, error: null });
  }
});

router.get('/departamentos/editar/:id', async (req, res) => {
  try {
    const [editando, categorias] = await Promise.all([
      api(`/categorias/${req.params.id}`, {}, req.session.token),
      obtenerCategorias(req.session.token),
    ]);
    res.render('productos/departamentos', { categorias, editando, error: null });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.redirect('/productos/departamentos');
  }
});

router.post('/departamentos/nuevo', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre?.trim()) {
    const categorias = await obtenerCategorias(req.session.token);
    return res.render('productos/departamentos', {
      categorias,
      editando: null,
      error: 'El nombre es obligatorio.',
    });
  }

  try {
    await api('/categorias/', { method: 'POST', body: { nombre: nombre.trim() } }, req.session.token);
    res.redirect('/productos/departamentos?toast=creado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    const categorias = await obtenerCategorias(req.session.token);
    res.render('productos/departamentos', {
      categorias,
      editando: null,
      error: 'Error al crear el departamento.',
    });
  }
});

router.post('/departamentos/editar/:id', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre?.trim()) return res.redirect('/productos/departamentos/editar/' + req.params.id);

  try {
    await api(`/categorias/${req.params.id}`, {
      method: 'PUT',
      body: { nombre: nombre.trim() },
    }, req.session.token);
    res.redirect('/productos/departamentos?toast=editado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.redirect('/productos/departamentos');
  }
});

router.post('/departamentos/eliminar/:id', async (req, res) => {
  try {
    await api(`/categorias/${req.params.id}`, { method: 'DELETE' }, req.session.token);
    res.redirect('/productos/departamentos?toast=eliminado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.redirect('/productos/departamentos?toast=error');
  }
});

// ─── PROMOCIONES ──────────────────────────────────────────────────────────────
router.get('/promociones', async (req, res) => {
  try {
    const promociones = await obtenerPromociones(req.session.token);
    res.render('productos/promociones', { promociones, editando: null, error: null });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.render('productos/promociones', { promociones: [], editando: null, error: null });
  }
});

router.get('/promociones/editar/:id', async (req, res) => {
  try {
    const [editando, promociones] = await Promise.all([
      api(`/promociones/${req.params.id}`, {}, req.session.token),
      obtenerPromociones(req.session.token),
    ]);
    res.render('productos/promociones', { promociones, editando, error: null });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.redirect('/productos/promociones');
  }
});

router.post('/promociones/nuevo', async (req, res) => {
  const { nombre, producto_id, cantidad_minima, tipo_beneficio, valor_beneficio } = req.body;

  if (!nombre || !producto_id || !cantidad_minima || !valor_beneficio || !tipo_beneficio) {
    const promociones = await obtenerPromociones(req.session.token);
    return res.render('productos/promociones', {
      promociones,
      editando: null,
      error: 'Faltan campos obligatorios.',
    });
  }

  try {
    await api('/promociones/', {
      method: 'POST',
      body: {
        nombre:           nombre.trim(),
        producto_id,
        cantidad_minima:  parseInt(cantidad_minima),
        tipo_beneficio,
        valor_beneficio:  parseFloat(valor_beneficio),
        fecha_inicio:     new Date().toISOString().split('T')[0],
      },
    }, req.session.token);
    res.redirect('/productos/promociones?toast=creado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    const promociones = await obtenerPromociones(req.session.token);
    res.render('productos/promociones', {
      promociones,
      editando: null,
      error: err.message || 'Error al crear la promoción.',
    });
  }
});

router.post('/promociones/editar/:id', async (req, res) => {
  const { nombre, producto_id, cantidad_minima, tipo_beneficio, valor_beneficio } = req.body;
  if (!nombre || !producto_id || !cantidad_minima || !valor_beneficio)
    return res.redirect('/productos/promociones/editar/' + req.params.id);

  try {
    await api(`/promociones/${req.params.id}`, {
      method: 'PUT',
      body: {
        nombre:          nombre.trim(),
        producto_id,
        cantidad_minima: parseInt(cantidad_minima),
        tipo_beneficio,
        valor_beneficio: parseFloat(valor_beneficio),
      },
    }, req.session.token);
    res.redirect('/productos/promociones?toast=editado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.redirect('/productos/promociones');
  }
});

router.post('/promociones/eliminar/:id', async (req, res) => {
  try {
    await api(`/promociones/${req.params.id}`, { method: 'DELETE' }, req.session.token);
    res.redirect('/productos/promociones?toast=eliminado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.redirect('/productos/promociones');
  }
});

module.exports = router;