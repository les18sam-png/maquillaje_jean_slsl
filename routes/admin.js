// routes/admin.js
// SmartVenta PDV — Módulo Admin
// Usuarios y Configuración migrados a API · Roles sigue con Supabase

const express = require('express');
const router  = express.Router();
const { supabase } = require('../db/database');
const { api }      = require('../db/api');

const SUCURSAL_ID = process.env.SUCURSAL_ID;

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
   Página temporal para secciones en desarrollo
───────────────────────────────────────── */
router.get('/en-construccion', (req, res) => {
  res.render('admin/en-construccion', { title: 'En construcción' });
});

module.exports = router;