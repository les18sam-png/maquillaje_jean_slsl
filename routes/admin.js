// routes/admin.js
// SmartVenta PDV — Módulo Admin
// Usuarios y Configuración migrados a API · Roles sigue con Supabase

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { api, API_URL } = require('../db/api');
const { leerConfigTicket, guardarConfigTicket } = require('../utils/config-ticket');
const SUCURSAL_ID = process.env.SUCURSAL_ID;

const PERMISOS = [
  'perm_inventario_entrada', 'perm_inventario_ajuste', 'perm_kardex',
  'perm_corte_caja', 'perm_modificar_precios', 'perm_cancelar_tickets',
  'perm_clientes', 'perm_descuentos', 'perm_reportes', 'perm_exportar',
  'perm_promociones', 'perm_administrar', 'perm_movimientos_caja',
  'perm_devoluciones', 'perm_auditoria', 'perm_dueno',
];


// ─── HELPER: mensaje de error legible según el status ─────────────────────────
function mensajeError(err, accionDefault = 'realizar esta acción') {
  if (err.status === 403) return `No tienes permiso para ${accionDefault}.`;
  if (err.status === 404) return 'El recurso solicitado no existe o fue eliminado.';
  return err.message || 'Ocurrió un error inesperado. Intenta de nuevo.';
}

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
   GET /admin/usuarios — MIGRADO
───────────────────────────────────────── */
router.get('/usuarios', async (req, res) => {
  try {
    const data = await api('/usuarios/', {}, req.session.token);

    const usuarios = (data.items || []).map(u => {
      const permisos = {};
      PERMISOS.forEach(p => { permisos[p] = u[p]; });
      return {
        ...u,
        roles: { nombre: u.rol_nombre, ...permisos },
      };
    });

    res.render('admin/usuarios', {
      title:    'Usuarios',
      usuarios,
      error:    null,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) {
      return res.render('admin/usuarios', {
        title: 'Usuarios', usuarios: [],
        error: mensajeError(err, 'consultar la lista de usuarios'),
      });
    }
    console.error('Error en GET /admin/usuarios:', err.message);
    res.status(500).send('Error al cargar usuarios: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   GET /admin/usuarios/nuevo — MIGRADO
   Ya no carga roles: el formulario pide permisos directos, y el backend
   crea un rol exclusivo para el nuevo usuario (nombrado igual a su
   nombre_usuario) con esos permisos.
───────────────────────────────────────── */
router.get('/usuarios/nuevo', (req, res) => {
  res.render('admin/form-usuario', {
    title:       'Nuevo Usuario',
    usuario:     null,
    modoEdicion: false,
    error:       null,
  });
});

/* ─────────────────────────────────────────
   POST /admin/usuarios/nuevo — MIGRADO
   Ya no envía rol_id: manda los perm_* marcados en el formulario.
───────────────────────────────────────── */
router.post('/usuarios/nuevo', async (req, res) => {
  try {
    const { nombre_completo, nombre_usuario, contrasena } = req.body;

    const permisos = {};
    PERMISOS.forEach(p => { permisos[p] = req.body[p] === 'on'; });

    await api('/usuarios/', {
      method: 'POST',
      body: JSON.stringify({
        nombre_completo: nombre_completo?.trim(),
        nombre_usuario:  nombre_usuario?.trim(),
        contrasena,
        ...permisos,
      }),
    }, req.session.token);

    res.redirect('/admin/usuarios?toast=creado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect('/admin/usuarios?error=sin_permiso');
    console.error('Error creando usuario:', err.message);
    res.redirect('/admin/usuarios/nuevo?error=fallo');
  }
});

/* ─────────────────────────────────────────
   GET /admin/usuarios/:id/editar — MIGRADO
   Ya no carga roles: solo trae al usuario, que ya viene con sus
   permisos aplanados desde el rol que tiene asignado.
───────────────────────────────────────── */
router.get('/usuarios/:id/editar', async (req, res) => {
  try {
    const usuario = await api(`/usuarios/${req.params.id}`, {}, req.session.token);

    res.render('admin/form-usuario', {
      title:       `Editar — ${usuario.nombre_completo}`,
      usuario,
      modoEdicion: true,
      error:       null,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 404) return res.status(404).send('Usuario no encontrado.');
    if (err.status === 403) return res.redirect('/admin/usuarios?error=sin_permiso');
    console.error('Error en GET /admin/usuarios/:id/editar:', err.message);
    res.status(500).send('Error: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   POST /admin/usuarios/:id/editar — MIGRADO
   Ya no envía rol_id: si el body trae algún perm_*, el backend crea
   un rol NUEVO con esos permisos y reasigna rol_id automáticamente.
───────────────────────────────────────── */
router.post('/usuarios/:id/editar', async (req, res) => {
  try {
    const { nombre_completo, nombre_usuario } = req.body;

    const permisos = {};
    PERMISOS.forEach(p => {
      permisos[p] = req.body[p] === 'on';
    });

    await api(`/usuarios/${req.params.id}`, {
      method: 'PUT',
      body: JSON.stringify({ nombre_completo, nombre_usuario, ...permisos }),
    }, req.session.token);

    res.redirect('/admin/usuarios?toast=actualizado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect(`/admin/usuarios/${req.params.id}/editar?error=sin_permiso`);
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
    if (err.status === 403) return res.redirect('/admin/usuarios?error=sin_permiso');
    console.error('Error toggling usuario:', err.message);
    res.redirect('/admin/usuarios?error=fallo');
  }
});

/* ─────────────────────────────────────────
   GET /admin/roles — solo consulta/auditoría (no está enlazada en
   ningún menú, pero se deja accesible por si se necesita revisar
   qué roles quedaron huérfanos tras ediciones de usuarios).
───────────────────────────────────────── */
router.get('/roles', async (req, res) => {
  try {
    const rolesData = await api('/roles/', {}, req.session.token);

    res.render('admin/roles', {
      title: 'Roles y Permisos',
      roles: rolesData.items || [],
      error: null,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) {
      return res.render('admin/roles', {
        title: 'Roles y Permisos', roles: [],
        error: mensajeError(err, 'consultar los roles'),
      });
    }
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

    const configTicket = leerConfigTicket();

    let logoActual = null;
    try {
      const archivos = fs.readdirSync(logoDir)
        .filter(f => /^logo-.*\.(jpg|jpeg|png|webp)$/i.test(f))
        .sort()
        .reverse();
      logoActual = archivos[0] || null;
    } catch { logoActual = null; }

    res.render('admin/configuracion', {
      title:       'Configuración',
      sucursal:    sucursal || {},
      cajas:       cajasData.items || [],
      configTicket,
      logoActual,
      toast:       req.query.toast || null,
      error:       req.query.error || null,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) {
      return res.render('admin/configuracion', {
        title: 'Configuración', sucursal: {}, cajas: [],
        configTicket: leerConfigTicket(), logoActual: null,
        toast: null, error: mensajeError(err, 'consultar la configuración'),
      });
    }
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
    if (err.status === 403) {
      return res.render('admin/cajas', {
        title: 'Cajas', cajas: [], toast: null,
        error: mensajeError(err, 'consultar las cajas'),
      });
    }
    console.error('Error en GET /admin/cajas:', err.message);
    res.status(500).send('Error al cargar cajas: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   POST /admin/cajas — MIGRADO a API
───────────────────────────────────────── */
router.post('/cajas', async (req, res) => {
  try {
    await api('/cajas/', {
      method: 'POST',
      body: JSON.stringify(construirPayloadCaja(req.body)),
    }, req.session.token);
    res.redirect('/admin/cajas?toast=creada');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect('/admin/cajas?error=sin_permiso');
    const msg = err.status === 409 ? 'limite' : 'fallo';
    res.redirect(`/admin/cajas?error=${msg}`);
  }
});

/* ─────────────────────────────────────────
   PUT /admin/cajas/:id — editar caja (incluye impresora)
───────────────────────────────────────── */
router.put('/cajas/:id', async (req, res) => {
  try {
    await api(`/cajas/${req.params.id}`, {
      method: 'PUT',
      body: JSON.stringify(construirPayloadCaja(req.body, true)),
    }, req.session.token);
    res.redirect('/admin/cajas?toast=actualizada');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect('/admin/cajas?error=sin_permiso');
    if (err.status === 404) return res.redirect('/admin/cajas?error=no_encontrada');
    const msg = err.status === 409 ? 'limite' : 'fallo';
    res.redirect(`/admin/cajas?error=${msg}`);
  }
});

/**
 * Arma el payload para crear/actualizar una caja, normalizando los campos
 * de impresora según el tipo elegido (usb usa "valor" como nombre del
 * recurso compartido; red usa "valor" como IP + "puerto").
 */
function construirPayloadCaja(body, esActualizacion = false) {
  const payload = {
    nombre: body.nombre?.trim(),
    es_verificador: body.es_verificador === 'true',
  };
  if (esActualizacion) {
    payload.activa = body.activa === 'true';
  }

  const tieneImpresora = body.impresora_tipo === 'usb' || body.impresora_tipo === 'red';
  if (tieneImpresora) {
    payload.impresora_tipo = body.impresora_tipo;
    payload.impresora_valor = body.impresora_valor || null;
    payload.impresora_puerto = body.impresora_tipo === 'red' && body.impresora_puerto
      ? parseInt(body.impresora_puerto, 10)
      : null;
  } else {
    payload.impresora_tipo = null;
    payload.impresora_valor = null;
    payload.impresora_puerto = null;
  }

  return payload;
}

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

    let logoActual = null;
    try {
      const archivos = fs.readdirSync(logoDir)
        .filter(f => /^logo-.*\.(jpg|jpeg|png|webp)$/i.test(f))
        .sort()
        .reverse();
      logoActual = archivos[0] || null;
    } catch { logoActual = null; }

    res.render('admin/ticket', {
      title: 'Ticket',
      sucursal: sucursal || {},
      config,
      logoActual,
      toast: req.query.toast || null,
      error: req.query.error || null,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) {
      return res.render('admin/ticket', {
        title: 'Ticket', sucursal: {}, config: leerConfigTicket(), logoActual: null,
        toast: null, error: mensajeError(err, 'consultar la configuración del ticket'),
      });
    }
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
    const { fecha = '' } = req.query;

    let corte = null;
    let errorCorte = null;

    // Corte CONSOLIDADO de toda la sucursal (todas las cajas, todos los
    // turnos, incluidos los abiertos). Solo requiere fecha, ya no caja_id.
    if (fecha) {
      try {
        corte = await api(`/cortes/?fecha=${fecha}`, {}, req.session.token);
      } catch (e) {
        errorCorte = mensajeError(e, 'ver el corte de caja');
      }
    }

    res.render('admin/corte', {
      title: 'Corte de caja',
      corte,
      errorCorte,
      filtros: { fecha },
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
    if (respuesta.status === 401) return res.redirect('/auth/login?error=sesion');
    if (respuesta.status === 403) return res.redirect('/admin/respaldo?error=sin_permiso');
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
    if (respuesta.status === 401) return res.redirect('/auth/login?error=sesion');
    if (respuesta.status === 403) return res.redirect('/admin/respaldo?error=sin_permiso');
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
   GET /admin/reportes-correo — lista de destinatarios
───────────────────────────────────────── */
router.get('/reportes-correo', async (req, res) => {
  try {
    const data = await api('/destinatarios-reportes/', {}, req.session.token);
    res.render('admin/reportes-correo', {
      title: 'Reportes por correo',
      destinatarios: data.items || [],
      toast: req.query.toast || null,
      error: req.query.error || null,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) {
      return res.render('admin/reportes-correo', {
        title: 'Reportes por correo', destinatarios: [], toast: null,
        error: mensajeError(err, 'consultar los destinatarios de reportes'),
      });
    }
    console.error('Error en GET /admin/reportes-correo:', err.message);
    res.status(500).send('Error al cargar destinatarios: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   POST /admin/reportes-correo/nuevo — agregar destinatario
───────────────────────────────────────── */
router.post('/reportes-correo/nuevo', async (req, res) => {
  try {
    const { correo, nombre } = req.body;
    await api('/destinatarios-reportes/', {
      method: 'POST',
      body: JSON.stringify({
        correo: correo?.trim(),
        nombre: nombre?.trim() || null,
        recibe_corte: req.body.recibe_corte === 'on',
        recibe_ventas: req.body.recibe_ventas === 'on',
        recibe_diario: req.body.recibe_diario === 'on',
        recibe_semanal: req.body.recibe_semanal === 'on',
      }),
    }, req.session.token);
    res.redirect('/admin/reportes-correo?toast=creado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect('/admin/reportes-correo?error=sin_permiso');
    console.error('Error creando destinatario:', err.message);
    res.redirect('/admin/reportes-correo?error=fallo');
  }
});

/* ─────────────────────────────────────────
   POST /admin/reportes-correo/:id/toggle — activar/desactivar
───────────────────────────────────────── */
router.post('/reportes-correo/:id/toggle', async (req, res) => {
  try {
    const { activo_actual } = req.body;
    await api(`/destinatarios-reportes/${req.params.id}`, {
      method: 'PUT',
      body: JSON.stringify({ activo: activo_actual !== 'true' }),
    }, req.session.token);
    res.redirect('/admin/reportes-correo?toast=actualizado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect('/admin/reportes-correo?error=sin_permiso');
    console.error('Error actualizando destinatario:', err.message);
    res.redirect('/admin/reportes-correo?error=fallo');
  }
});

/* ─────────────────────────────────────────
   POST /admin/reportes-correo/:id/eliminar
───────────────────────────────────────── */
router.post('/reportes-correo/:id/eliminar', async (req, res) => {
  try {
    await api(`/destinatarios-reportes/${req.params.id}`, { method: 'DELETE' }, req.session.token);
    res.redirect('/admin/reportes-correo?toast=eliminado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect('/admin/reportes-correo?error=sin_permiso');
    console.error('Error eliminando destinatario:', err.message);
    res.redirect('/admin/reportes-correo?error=fallo');
  }
});

/* ─────────────────────────────────────────
   POST /admin/reportes-correo/:id/enviar-ahora
───────────────────────────────────────── */
router.post('/reportes-correo/:id/enviar-ahora', async (req, res) => {
  try {
    await api(`/destinatarios-reportes/${req.params.id}/enviar-ahora`, { method: 'POST' }, req.session.token);
    res.redirect('/admin/reportes-correo?toast=enviado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect('/admin/reportes-correo?error=sin_permiso');
    console.error('Error enviando reporte:', err.message);
    res.redirect('/admin/reportes-correo?error=fallo_envio');
  }
});

router.post('/reportes-correo/:id/enviar-ahora-semanal', async (req, res) => {
  try {
    await api(`/destinatarios-reportes/${req.params.id}/enviar-ahora-semanal`, { method: 'POST' }, req.session.token);
    res.redirect('/admin/reportes-correo?toast=enviado');
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.redirect('/admin/reportes-correo?error=sin_permiso');
    console.error('Error enviando reporte semanal:', err.message);
    res.redirect('/admin/reportes-correo?error=fallo_envio');
  }
});
/* ─────────────────────────────────────────
   Página temporal para secciones en desarrollo
───────────────────────────────────────── */
router.get('/en-construccion', (req, res) => {
  res.render('admin/en-construccion', { title: 'En construcción' });
});

module.exports = router;