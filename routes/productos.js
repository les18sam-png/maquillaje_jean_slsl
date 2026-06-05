// routes/productos.js
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { supabase } = require('../db/database');

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

const fileFilter = (req, file, cb) => {
  const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
  permitidos.includes(file.mimetype) ? cb(null, true) : cb(new Error('Formato no permitido'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });

// ─── HELPERS ──────────────────────────────────────────────────────────────────
async function getCategorias() {
  const { data } = await supabase.from('categorias').select('*').eq('activo', true).order('nombre');
  return data || [];
}

// ─── LISTADO ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { q = '', categoria_id = '' } = req.query;

  let query = supabase
    .from('productos')
    .select('*, categorias(nombre), inventario(cantidad_actual)')
    .eq('sucursal_id', process.env.SUCURSAL_ID)
    .order('descripcion');

  if (q) query = query.or(`codigo_barras.ilike.%${q}%,descripcion.ilike.%${q}%`);
  if (categoria_id) query = query.eq('categoria_id', categoria_id);

  const { data: productos } = await query;
  const categorias = await getCategorias();

  const productosFormateados = (productos || []).map(p => ({
    ...p,
    categoria_nombre: p.categorias?.nombre || null,
    stock_actual: p.inventario?.[0]?.cantidad_actual ?? 0
  }));

  res.render('productos/index', {
    productos: productosFormateados,
    categorias,
    q,
    categoria_id
  });
});

// ─── FORMULARIO NUEVO ─────────────────────────────────────────────────────────
router.get('/nuevo', async (req, res) => {
  res.render('productos/form', {
    producto:   null,
    categorias: await getCategorias(),
    error:      null
  });
});

// ─── CREAR PRODUCTO ───────────────────────────────────────────────────────────
router.post('/nuevo', upload.single('imagen'), async (req, res) => {
  const { codigo_barras, descripcion, categoria_id, precio_venta, precio_mayoreo, costo_unitario, stock_actual, inventario_minimo, estado } = req.body;
  const imagen = req.file ? req.file.filename : null;

  if (!descripcion || !precio_venta || !precio_mayoreo) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.render('productos/form', {
      producto: { ...req.body },
      categorias: await getCategorias(),
      error: 'Faltan campos obligatorios.'
    });
  }

  if (!imagen) {
    return res.render('productos/form', {
      producto: { ...req.body },
      categorias: await getCategorias(),
      error: 'La imagen es obligatoria.'
    });
  }

  const { error } = await supabase.from('productos').insert({
    sucursal_id:       process.env.SUCURSAL_ID,
    codigo_barras:     codigo_barras || null,
    descripcion,
    categoria_id:      categoria_id  || null,
    precio_venta:      parseFloat(precio_venta),
    precio_mayoreo:    parseFloat(precio_mayoreo),
    costo_unitario:    parseFloat(costo_unitario) || 0,
    inventario_minimo: parseInt(inventario_minimo) || 0,
    ruta_imagen:       imagen,
    activo:            estado !== 'inactivo'
  });
  console.log('ERROR SUPABASE:', error);
  console.log('SUCURSAL_ID:', process.env.SUCURSAL_ID);

  if (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.render('productos/form', {
      producto: { ...req.body },
      categorias: await getCategorias(),
      error: error.message.includes('unique') ? 'Ya existe un producto con ese código de barras.' : 'Error al guardar el producto.'
    });
  }

  res.redirect('/productos?toast=creado');
});

// ─── FORMULARIO EDITAR ────────────────────────────────────────────────────────
router.get('/editar/:id', async (req, res) => {
  const { data: producto } = await supabase.from('productos').select('*').eq('id', req.params.id).single();
  if (!producto) return res.redirect('/productos');

  res.render('productos/form', {
    producto,
    categorias: await getCategorias(),
    error: null
  });
});

// ─── ACTUALIZAR PRODUCTO ──────────────────────────────────────────────────────
router.post('/editar/:id', upload.single('imagen'), async (req, res) => {
  const { id } = req.params;
  const { codigo_barras, descripcion, categoria_id, precio_venta, precio_mayoreo, costo_unitario, stock_actual, inventario_minimo, estado } = req.body;

  const { data: productoActual } = await supabase.from('productos').select('ruta_imagen').eq('id', id).single();
  if (!productoActual) return res.redirect('/productos');

  let imagen = productoActual.ruta_imagen;
  if (req.file) {
    if (imagen) {
      const imgAnterior = path.join(uploadsDir, imagen);
      if (fs.existsSync(imgAnterior)) fs.unlinkSync(imgAnterior);
    }
    imagen = req.file.filename;
  }

  if (!descripcion || !precio_venta || !precio_mayoreo) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.render('productos/form', {
      producto: { ...req.body, id, ruta_imagen: imagen },
      categorias: await getCategorias(),
      error: 'Faltan campos obligatorios.'
    });
  }

  const { error } = await supabase.from('productos').update({
    codigo_barras:     codigo_barras || null,
    descripcion,
    categoria_id:      categoria_id  || null,
    precio_venta:      parseFloat(precio_venta),
    precio_mayoreo:    parseFloat(precio_mayoreo),
    costo_unitario:    parseFloat(costo_unitario) || 0,
    inventario_minimo: parseInt(inventario_minimo) || 0,
    ruta_imagen:       imagen,
    activo:            estado !== 'inactivo'
  }).eq('id', id);

  if (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.render('productos/form', {
      producto: { ...req.body, id, ruta_imagen: imagen },
      categorias: await getCategorias(),
      error: 'Error al actualizar el producto.'
    });
  }

  res.redirect('/productos?toast=editado');
});

// ─── TOGGLE ACTIVO / INACTIVO ─────────────────────────────────────────────────
router.post('/toggle/:id', async (req, res) => {
  const { data: producto } = await supabase.from('productos').select('activo').eq('id', req.params.id).single();
  if (!producto) return res.json({ ok: false });

  await supabase.from('productos').update({ activo: !producto.activo }).eq('id', req.params.id);
  res.json({ ok: true, estado: !producto.activo ? 'activo' : 'inactivo' });
});

// ─── ELIMINAR PRODUCTO ────────────────────────────────────────────────────────
router.post('/eliminar/:id', async (req, res) => {
  const { data: producto } = await supabase.from('productos').select('ruta_imagen').eq('id', req.params.id).single();
  if (!producto) return res.redirect('/productos');

  if (producto.ruta_imagen) {
    const imgPath = path.join(uploadsDir, producto.ruta_imagen);
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  }

  await supabase.from('productos').delete().eq('id', req.params.id);
  res.redirect('/productos?toast=eliminado');
});

// ─── API BUSCAR ───────────────────────────────────────────────────────────────
router.get('/api/buscar', async (req, res) => {
  const { q = '' } = req.query;
  if (!q) return res.json([]);

  const { data } = await supabase
    .from('productos')
    .select('id, codigo_barras, descripcion, precio_venta, precio_mayoreo, ruta_imagen, categorias(nombre)')
    .eq('activo', true)
    .or(`codigo_barras.eq.${q},descripcion.ilike.%${q}%`)
    .limit(20);

  res.json((data || []).map(p => ({
    ...p,
    codigo: p.codigo_barras,
    imagen: p.ruta_imagen,
    categoria: p.categorias?.nombre
  })));
});

// ─── DEPARTAMENTOS ────────────────────────────────────────────────────────────
router.get('/departamentos', async (req, res) => {
  const { data: categorias } = await supabase.from('categorias').select('*, productos(count)').order('nombre');
  const formateadas = (categorias || []).map(c => ({
    ...c,
    total_productos: c.productos?.[0]?.count || 0
  }));
  res.render('productos/departamentos', { categorias: formateadas, editando: null, error: null });
});

router.get('/departamentos/editar/:id', async (req, res) => {
  const { data: editando } = await supabase.from('categorias').select('*').eq('id', req.params.id).single();
  if (!editando) return res.redirect('/productos/departamentos');
  const { data: categorias } = await supabase.from('categorias').select('*, productos(count)').order('nombre');
  const formateadas = (categorias || []).map(c => ({ ...c, total_productos: c.productos?.[0]?.count || 0 }));
  res.render('productos/departamentos', { categorias: formateadas, editando, error: null });
});

router.post('/departamentos/nuevo', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre?.trim()) {
    const { data: categorias } = await supabase.from('categorias').select('*, productos(count)').order('nombre');
    const formateadas = (categorias || []).map(c => ({ ...c, total_productos: c.productos?.[0]?.count || 0 }));
    return res.render('productos/departamentos', { categorias: formateadas, editando: null, error: 'El nombre es obligatorio.' });
  }
  await supabase.from('categorias').insert({ nombre: nombre.trim() });
  res.redirect('/productos/departamentos?toast=creado');
});

router.post('/departamentos/editar/:id', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre?.trim()) return res.redirect('/productos/departamentos/editar/' + req.params.id);
  await supabase.from('categorias').update({ nombre: nombre.trim() }).eq('id', req.params.id);
  res.redirect('/productos/departamentos?toast=editado');
});

router.post('/departamentos/eliminar/:id', async (req, res) => {
  await supabase.from('categorias').delete().eq('id', req.params.id);
  res.redirect('/productos/departamentos?toast=eliminado');
});

// ─── VENTAS POR PERIODO ───────────────────────────────────────────────────────
router.get('/ventas-periodo', async (req, res) => {
  const { periodo = 'hoy', desde = '', hasta = '', categoria_id = '' } = req.query;
  const hoy = new Date().toISOString().split('T')[0];

  let fechaDesde, fechaHasta;
  if (periodo === 'hoy') {
    fechaDesde = fechaHasta = hoy;
  } else if (periodo === 'semana') {
    const d = new Date(); d.setDate(d.getDate() - d.getDay());
    fechaDesde = d.toISOString().split('T')[0]; fechaHasta = hoy;
  } else if (periodo === 'mes') {
    const d = new Date();
    fechaDesde = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    fechaHasta = hoy;
  } else {
    fechaDesde = desde || hoy; fechaHasta = hasta || hoy;
  }

  const categorias = await getCategorias();
  res.render('productos/ventas-periodo', { ventas: [], categorias, periodo, desde: fechaDesde, hasta: fechaHasta, categoria_id });
});

// ─── PROMOCIONES ──────────────────────────────────────────────────────────────
router.get('/promociones', async (req, res) => {
  const { data: promociones } = await supabase.from('promociones').select('*, productos(descripcion, codigo_barras, precio_venta)').order('activa', { ascending: false });
  const formateadas = (promociones || []).map(p => ({
    ...p,
    producto_descripcion: p.productos?.descripcion,
    codigo: p.productos?.codigo_barras,
    precio_venta: p.productos?.precio_venta
  }));
  res.render('productos/promociones', { promociones: formateadas, editando: null, error: null });
});

router.get('/promociones/editar/:id', async (req, res) => {
  const { data: editando } = await supabase.from('promociones').select('*, productos(descripcion)').eq('id', req.params.id).single();
  if (!editando) return res.redirect('/productos/promociones');
  editando.producto_descripcion = editando.productos?.descripcion;
  const { data: promociones } = await supabase.from('promociones').select('*, productos(descripcion, codigo_barras, precio_venta)').order('activa', { ascending: false });
  const formateadas = (promociones || []).map(p => ({ ...p, producto_descripcion: p.productos?.descripcion }));
  res.render('productos/promociones', { promociones: formateadas, editando, error: null });
});

router.post('/promociones/nuevo', async (req, res) => {
  const { nombre, producto_id, cantidad_minima, valor_beneficio, activo } = req.body;
  if (!nombre || !producto_id || !cantidad_minima || !valor_beneficio) {
    const { data: promociones } = await supabase.from('promociones').select('*, productos(descripcion, codigo_barras, precio_venta)').order('activa', { ascending: false });
    return res.render('productos/promociones', { promociones: promociones || [], editando: null, error: 'Faltan campos obligatorios.' });
  }
  await supabase.from('promociones').insert({
    nombre: nombre.trim(),
    producto_id,
    cantidad_minima: parseInt(cantidad_minima),
    tipo_beneficio: 'precio_especial',
    valor_beneficio: parseFloat(valor_beneficio),
    fecha_inicio: new Date().toISOString().split('T')[0],
    activa: activo === '1'
  });
  res.redirect('/productos/promociones?toast=creado');
});

router.post('/promociones/editar/:id', async (req, res) => {
  const { nombre, producto_id, cantidad_minima, valor_beneficio, activo } = req.body;
  if (!nombre || !producto_id || !cantidad_minima || !valor_beneficio) return res.redirect('/productos/promociones/editar/' + req.params.id);
  await supabase.from('promociones').update({
    nombre: nombre.trim(),
    producto_id,
    cantidad_minima: parseInt(cantidad_minima),
    valor_beneficio: parseFloat(valor_beneficio),
    activa: activo === '1'
  }).eq('id', req.params.id);
  res.redirect('/productos/promociones?toast=editado');
});

router.post('/promociones/eliminar/:id', async (req, res) => {
  await supabase.from('promociones').delete().eq('id', req.params.id);
  res.redirect('/productos/promociones?toast=eliminado');
});

module.exports = router;