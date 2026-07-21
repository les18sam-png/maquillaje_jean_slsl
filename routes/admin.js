// routes/admin.js
// SmartVenta PDV — Módulo Admin
// Usuarios y Configuración migrados a API · Roles sigue con Supabase

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { supabase } = require('../db/database');
const { api, API_URL } = require('../db/api');
const { leerConfigTicket, guardarConfigTicket } = require('../utils/config-ticket');
const SUCURSAL_ID = process.env.SUCURSAL_ID;
// ─── MULTER para el logo del sistema ──────────────────────────────────────────
const logoDir = path.join(__dirname, '../public/uploads/logo');
if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'logo-' + Date.now() + ext);
  }
});

const logoFilter = (req, file, cb) => {
  const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
  permitidos.includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error('Formato no permitido'), false);
};

const uploadLogo = multer({
  storage: logoStorage,
  fileFilter: logoFilter,
  limits: { fileSize: 2 * 1024 * 1024 }
});
/* ─────────────────────────────────────────
   GET /admin → panel principal
───────────────────────────────────────── */
router.get('/', (req, res) => {
  res.render('admin/index', { title: 'Administración' });
});

/* ─────────────────────────────────────────
   72 — GET /admin/usuarios — MIGRADO
───────────────────────────────────────── */
router.get('/usuarios', async (req, res) => {
  try {
    const data = await api('/usuarios/', {}, req.session.token);

    const usuarios = (data.items || []).map(u => ({
      ...u,
      roles: { nombre: u.rol_nombre },
    }));

    res.render('admin/usuarios', {
      title:    'Usuarios',
      usuarios,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error en GET /admin/usuarios:', err.message);
    res.status(500).send('Error al cargar usuarios: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   GET /admin/usuarios/nuevo — MIGRADO
───────────────────────────────────────── */
router.get('/usuarios/nuevo', async (req, res) => {
  try {
    // Roles sigue en Supabase por ahora
    const { data: roles } = await supabase
      .from('roles')
      .select('id, nombre')
      .eq('sucursal_id', SUCURSAL_ID)
      .order('nombre');

    res.render('admin/form-usuario', {
      title:       'Nuevo Usuario',
      usuario:     null,
      roles:       roles || [],
      modoEdicion: false,
    });
  } catch (err) {
    console.error('Error en GET /admin/usuarios/nuevo:', err.message);
    res.status(500).send('Error: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   POST /admin/usuarios/nuevo — MIGRADO
───────────────────────────────────────── */
router.post('/usuarios/nuevo', async (req, res) => {
  try {
    const { nombre_completo, nombre_usuario, contrasena, rol_id } = req.body;

    await api('/usuarios/', {
      method: 'POST',
      body: JSON.stringify({
        nombre_completo: nombre_completo?.trim(),
        nombre_usuario:  nombre_usuario?.trim(),
        contrasena,
        rol_id,
      }),
    }, req.session.token);

    res.redirect('/admin/usuarios?toast=creado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error creando usuario:', err.message);
    res.redirect('/admin/usuarios/nuevo?error=fallo');
  }
});

/* ─────────────────────────────────────────
   GET /admin/usuarios/:id/editar — MIGRADO
───────────────────────────────────────── */
router.get('/usuarios/:id/editar', async (req, res) => {
  try {
    const usuario = await api(`/usuarios/${req.params.id}`, {}, req.session.token);

    const { data: roles } = await supabase
      .from('roles')
      .select('id, nombre')
      .eq('sucursal_id', SUCURSAL_ID)
      .order('nombre');

    res.render('admin/form-usuario', {
      title:       `Editar — ${usuario.nombre_completo}`,
      usuario,
      roles:       roles || [],
      modoEdicion: true,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 404) return res.status(404).send('Usuario no encontrado.');
    console.error('Error en GET /admin/usuarios/:id/editar:', err.message);
    res.status(500).send('Error: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   POST /admin/usuarios/:id/editar — MIGRADO
───────────────────────────────────────── */
router.post('/usuarios/:id/editar', async (req, res) => {
  try {
    const { nombre_completo, nombre_usuario, rol_id } = req.body;

    await api(`/usuarios/${req.params.id}`, {
      method: 'PUT',
      body: JSON.stringify({ nombre_completo, nombre_usuario, rol_id }),
    }, req.session.token);

    res.redirect('/admin/usuarios?toast=actualizado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error actualizando usuario:', err.message);
    res.redirect(`/admin/usuarios/${req.params.id}/editar?error=fallo`);
  }
});

/* ─────────────────────────────────────────
   POST /admin/usuarios/:id/toggle — MIGRADO
───────────────────────────────────────── */
router.post('/usuarios/:id/toggle', async (req, res) => {
  try {
    const { activo_actual } = req.body;
    const nuevoEstado = activo_actual === 'true' ? false : true;

    await api(`/usuarios/${req.params.id}/estado?activo=${nuevoEstado}`, {
      method: 'PATCH',
    }, req.session.token);

    res.redirect('/admin/usuarios?toast=actualizado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error toggling usuario:', err.message);
    res.redirect('/admin/usuarios');
  }
});

/* ─────────────────────────────────────────
   73 — GET /admin/roles — sigue con Supabase
───────────────────────────────────────── */
router.get('/roles', async (req, res) => {
  try {
    const { data: roles, error } = await supabase
      .from('roles')
      .select('*')
      .eq('sucursal_id', SUCURSAL_ID)
      .order('nombre');

    if (error) throw error;

    res.render('admin/roles', {
      title: 'Roles y Permisos',
      roles: roles || [],
    });
  } catch (err) {
    console.error('Error en GET /admin/roles:', err.message);
    res.status(500).send('Error al cargar roles: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   GET /admin/configuracion — MIGRADO a API
───────────────────────────────────────── */
router.get('/configuracion', async (req, res) => {
  try {
    const sucursal = await api('/sucursales/actual', {}, req.session.token);

    const cajasData = await api('/cajas/?solo_activas=false', {}, req.session.token).catch(() => ({ items: [] }));

    res.render('admin/configuracion', {
      title:    'Configuración',
      sucursal: sucursal || {},
      cajas:    cajasData.items || [],
      toast:    req.query.toast || null,
      error:    req.query.error || null,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error en GET /admin/configuracion:', err.message);
    res.status(500).send('Error al cargar configuración: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   POST /admin/configuracion — editar sucursal (solo admin)
───────────────────────────────────────── */
router.post('/configuracion', async (req, res) => {
  try {
    const { nombre, direccion, telefono } = req.body;

    await api('/sucursales/actual', {
      method: 'PUT',
      body: JSON.stringify({
        nombre:    nombre?.trim(),
        direccion: direccion?.trim(),
        telefono:  telefono?.trim(),
      }),
    }, req.session.token);

    res.redirect('/admin/configuracion?toast=guardado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect('/admin/configuracion?error=sin_permiso');
    console.error('Error actualizando sucursal:', err.message);
    res.redirect('/admin/configuracion?error=fallo');
  }
});

/* ─────────────────────────────────────────
   GET /admin/cajas — MIGRADO a API
───────────────────────────────────────── */
router.get('/cajas', async (req, res) => {
  try {
    const data = await api('/cajas/?solo_activas=false', {}, req.session.token);
    res.render('admin/cajas', {
      title: 'Cajas',
      cajas: data.items || [],
      toast: req.query.toast || null,
      error: req.query.error || null,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error en GET /admin/cajas:', err.message);
    res.status(500).send('Error al cargar cajas: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   POST /admin/cajas — MIGRADO a API
───────────────────────────────────────── */
router.post('/cajas', async (req, res) => {
  try {
    const { nombre, es_verificador } = req.body;
    await api('/cajas/', {
      method: 'POST',
      body: JSON.stringify({
        nombre:         nombre?.trim(),
        es_verificador: es_verificador === 'true',
      }),
    }, req.session.token);
    res.redirect('/admin/cajas?toast=creada');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    const msg = err.status === 409 ? 'limite' : 'fallo';
    res.redirect(`/admin/cajas?error=${msg}`);
  }
});
/* ─────────────────────────────────────────
   GET /admin/logotipo — pantalla de logo
───────────────────────────────────────── */
router.get('/logotipo', (req, res) => {
  // Busca si ya hay un logo subido (el archivo más reciente en la carpeta)
  let logoActual = null;
  try {
    const archivos = fs.readdirSync(logoDir)
      .filter(f => /^logo-.*\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort()
      .reverse();
    logoActual = archivos[0] || null;
  } catch { logoActual = null; }

  res.render('admin/logotipo', {
    title: 'Logotipo',
    logoActual,
    toast: req.query.toast || null,
    error: req.query.error || null,
  });
});

/* ─────────────────────────────────────────
   POST /admin/logotipo — subir logo nuevo
───────────────────────────────────────── */
router.post('/logotipo', uploadLogo.single('logo'), (req, res) => {
  if (!req.file) {
    return res.redirect('/admin/logotipo?error=formato');
  }

  // Borra los logos anteriores, deja solo el nuevo
  try {
    fs.readdirSync(logoDir)
      .filter(f => /^logo-.*\.(jpg|jpeg|png|webp)$/i.test(f) && f !== req.file.filename)
      .forEach(f => fs.unlinkSync(path.join(logoDir, f)));
  } catch { /* si falla el borrado, no es crítico */ }

  res.redirect('/admin/logotipo?toast=guardado');
});

/* ─────────────────────────────────────────
   POST /admin/logotipo/quitar — volver al ícono por defecto
───────────────────────────────────────── */
router.post('/logotipo/quitar', (req, res) => {
  try {
    fs.readdirSync(logoDir)
      .filter(f => /^logo-.*\.(jpg|jpeg|png|webp)$/i.test(f))
      .forEach(f => fs.unlinkSync(path.join(logoDir, f)));
  } catch { /* nada */ }
  res.redirect('/admin/logotipo?toast=quitado');
});


/* ─────────────────────────────────────────
   GET /admin/ticket — configuración del ticket
───────────────────────────────────────── */
router.get('/ticket', async (req, res) => {
  try {
    const sucursal = await api('/sucursales/actual', {}, req.session.token).catch(() => ({}));
    const config   = leerConfigTicket();

    res.render('admin/ticket', {
      title: 'Ticket',
      sucursal: sucursal || {},
      config,
      toast: req.query.toast || null,
      error: req.query.error || null,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error en GET /admin/ticket:', err.message);
    res.status(500).send('Error al cargar configuración del ticket: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   POST /admin/ticket — guardar configuración
───────────────────────────────────────── */
router.post('/ticket', (req, res) => {
  try {
    const { mensaje_final, leyenda, mostrar_direccion, mostrar_telefono } = req.body;

    guardarConfigTicket({
      mensaje_final:     (mensaje_final || '').trim(),
      leyenda:           (leyenda || '').trim(),
      mostrar_direccion: mostrar_direccion === 'on',
      mostrar_telefono:  mostrar_telefono === 'on',
    });

    res.redirect('/admin/ticket?toast=guardado');
  } catch (err) {
    console.error('Error guardando config del ticket:', err.message);
    res.redirect('/admin/ticket?error=fallo');
  }
});


/* ─────────────────────────────────────────
   GET /admin/corte — corte de caja (consulta)
───────────────────────────────────────── */
router.get('/corte', async (req, res) => {
  try {
    const { caja_id = '', fecha = '' } = req.query;

    // Cajas para el selector
    const cajasData = await api('/cajas/?solo_activas=false', {}, req.session.token).catch(() => ({ items: [] }));
    const cajas = (cajasData.items || []).filter(c => !c.es_verificador);

    let corte = null;
    let errorCorte = null;

    // Si ya eligieron caja y fecha, calcula el corte
    if (caja_id && fecha) {
      try {
        corte = await api(`/cortes/?caja_id=${caja_id}&fecha=${fecha}`, {}, req.session.token);
      } catch (e) {
        errorCorte = e.status === 403
          ? 'No tienes permiso para ver cortes.'
          : (e.message || 'No se pudo calcular el corte.');
      }
    }

    res.render('admin/corte', {
      title: 'Corte de caja',
      cajas,
      corte,
      errorCorte,
      filtros: { caja_id, fecha },
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error en GET /admin/corte:', err.message);
    res.status(500).send('Error al cargar corte: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   GET /admin/respaldo — exportar datos
───────────────────────────────────────── */
router.get('/respaldo', (req, res) => {
  res.render('admin/respaldo', {
    title: 'Respaldo',
    error: req.query.error || null,
  });
});



/* ─────────────────────────────────────────
   GET /admin/respaldo/json — descargar respaldo JSON
───────────────────────────────────────── */
router.get('/respaldo/json', async (req, res) => {
  try {
    const respuesta = await fetch(`${API_URL}/respaldo/json`, {
      headers: { Authorization: `Bearer ${req.session.token}` },
    });
    if (!respuesta.ok) throw new Error('Error al generar el respaldo JSON');

    const buffer = await respuesta.arrayBuffer();
    const disposition = respuesta.headers.get('content-disposition') || '';
    const nombre = disposition.match(/filename=([^;]+)/)?.[1] || 'respaldo.json';

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.redirect('/admin/respaldo?error=fallo');
  }
});

/* ─────────────────────────────────────────
   GET /admin/respaldo/excel — descargar respaldo Excel
───────────────────────────────────────── */
router.get('/respaldo/excel', async (req, res) => {
  try {
    const respuesta = await fetch(`${API_URL}/respaldo/excel`, {
      headers: { Authorization: `Bearer ${req.session.token}` },
    });
    if (!respuesta.ok) throw new Error('Error al generar el respaldo Excel');

    const buffer = await respuesta.arrayBuffer();
    const disposition = respuesta.headers.get('content-disposition') || '';
    const nombre = disposition.match(/filename=([^;]+)/)?.[1] || 'respaldo.xlsx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.redirect('/admin/respaldo?error=fallo');
  }
});


/* ─────────────────────────────────────────
   Página temporal para secciones en desarrollo
───────────────────────────────────────── */
router.get('/en-construccion', (req, res) => {
  res.render('admin/en-construccion', { title: 'En construcción' });
});

module.exports = router;