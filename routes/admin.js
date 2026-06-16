// routes/admin.js
// SmartVenta PDV — Módulo Admin
// SOLO FRONTEND

const express = require('express');
const router  = express.Router();
const { supabase } = require('../db/database');

const SUCURSAL_ID = process.env.SUCURSAL_ID;

/* ─────────────────────────────────────────
   GET /admin → panel principal
───────────────────────────────────────── */
router.get('/', (req, res) => {
  res.render('admin/index', { title: 'Administración' });
});

/* ─────────────────────────────────────────
   72 — GET /admin/usuarios
───────────────────────────────────────── */
router.get('/usuarios', async (req, res) => {
  try {
    const { data: usuarios, error } = await supabase
      .from('usuarios')
      .select(`
        id, nombre_completo, nombre_usuario,
        activo, ultimo_login, creado_en,
        roles(nombre)
      `)
      .eq('sucursal_id', SUCURSAL_ID)
      .order('nombre_completo');

    if (error) throw error;

    res.render('admin/usuarios', {
      title:    'Usuarios',
      usuarios: usuarios || [],
    });
  } catch (err) {
    console.error('Error en GET /admin/usuarios:', err.message);
    res.status(500).send('Error al cargar usuarios: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   GET /admin/usuarios/nuevo
───────────────────────────────────────── */
router.get('/usuarios/nuevo', async (req, res) => {
  try {
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
   POST /admin/usuarios/nuevo
───────────────────────────────────────── */
router.post('/usuarios/nuevo', async (req, res) => {
  try {
    const { nombre_completo, nombre_usuario, contrasena, rol_id } = req.body;

    // TODO: conectar con endpoint de tu novia para crear usuario con hash bcrypt
    // await api('/admin/usuarios', { method: 'POST', body: JSON.stringify({...}) }, req.session.token)

    // Temporal — insert directo (sin hash, tu novia lo maneja)
    const { error } = await supabase
      .from('usuarios')
      .insert([{
        sucursal_id:    SUCURSAL_ID,
        rol_id,
        nombre_completo: nombre_completo?.trim(),
        nombre_usuario:  nombre_usuario?.trim(),
        contrasena_hash: contrasena, // temporal, tu novia hashea
        activo: true,
      }]);

    if (error) throw error;

    res.redirect('/admin/usuarios?toast=creado');
  } catch (err) {
    console.error('Error creando usuario:', err.message);
    res.redirect('/admin/usuarios/nuevo?error=fallo');
  }
});

/* ─────────────────────────────────────────
   GET /admin/usuarios/:id/editar
───────────────────────────────────────── */
router.get('/usuarios/:id/editar', async (req, res) => {
  try {
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('id, nombre_completo, nombre_usuario, activo, rol_id')
      .eq('id', req.params.id)
      .single();

    if (error || !usuario) return res.status(404).send('Usuario no encontrado.');

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
    console.error('Error en GET /admin/usuarios/:id/editar:', err.message);
    res.status(500).send('Error: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   POST /admin/usuarios/:id/editar
───────────────────────────────────────── */
router.post('/usuarios/:id/editar', async (req, res) => {
  try {
    const { nombre_completo, nombre_usuario, rol_id } = req.body;

    const { error } = await supabase
      .from('usuarios')
      .update({ nombre_completo, nombre_usuario, rol_id })
      .eq('id', req.params.id);

    if (error) throw error;

    res.redirect('/admin/usuarios?toast=actualizado');
  } catch (err) {
    console.error('Error actualizando usuario:', err.message);
    res.redirect(`/admin/usuarios/${req.params.id}/editar?error=fallo`);
  }
});

/* ─────────────────────────────────────────
   POST /admin/usuarios/:id/toggleactivo
───────────────────────────────────────── */
router.post('/usuarios/:id/toggle', async (req, res) => {
  try {
    const { activo_actual } = req.body;
    const nuevoEstado = activo_actual === 'true' ? false : true;

    const { error } = await supabase
      .from('usuarios')
      .update({ activo: nuevoEstado })
      .eq('id', req.params.id);

    if (error) throw error;

    res.redirect('/admin/usuarios?toast=actualizado');
  } catch (err) {
    console.error('Error toggling usuario:', err.message);
    res.redirect('/admin/usuarios');
  }
});

/* ─────────────────────────────────────────
   73 — GET /admin/roles
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
   74 — GET /admin/configuracion
───────────────────────────────────────── */
router.get('/configuracion', async (req, res) => {
  try {
    const { data: sucursal } = await supabase
      .from('sucursales')
      .select('*')
      .eq('id', SUCURSAL_ID)
      .single();

    const { data: cajas } = await supabase
      .from('cajas')
      .select('*')
      .eq('sucursal_id', SUCURSAL_ID)
      .order('nombre');

    res.render('admin/configuracion', {
      title:    'Configuración',
      sucursal: sucursal || {},
      cajas:    cajas    || [],
    });
  } catch (err) {
    console.error('Error en GET /admin/configuracion:', err.message);
    res.status(500).send('Error al cargar configuración: ' + err.message);
  }
});

module.exports = router;