// routes/venta.js
const express = require('express');
const router  = express.Router();
const { api } = require('../db/api');

async function obtenerCategorias(token) {
  try { return (await api('/categorias/', {}, token))?.items || []; } catch { return []; }
}
async function obtenerClientes(token) {
  try { return (await api('/clientes/', {}, token))?.items || []; } catch { return []; }
}

router.get('/', async (req, res) => {
  const tieneTurno = !!(req.session.turno_id && req.session.caja_id);

  try {
    const resultados = await Promise.all([
      obtenerCategorias(req.session.token),
      obtenerClientes(req.session.token),
      // Cajas solo si no hay turno (para el modal de apertura)
      tieneTurno
        ? Promise.resolve([])
        : api('/cajas/?solo_activas=true', {}, req.session.token)
            .then(d => (d?.items || []).filter(c => !c.es_verificador))
            .catch(() => []),
    ]);

    const [categorias, clientes, cajas] = resultados;

    // Pendientes solo si hay turno — requiere caja_id como query param
    let pendientes = [];
    if (tieneTurno) {
      pendientes = await api(
        `/ventas/pendientes?caja_id=${req.session.caja_id}`,
        {}, req.session.token
      ).catch(() => []);
    }

   res.render('venta/index', {
      title: 'Punto de Venta',
      categorias, clientes,
      pendientes: pendientes || [],
      permisos: req.session.permisos || {},
      tieneTurno,
      cajas,
      cajeroNombre: req.session.usuario?.nombre_completo || '',
      sucursal_id: req.session.sucursal_id,
      // El header (views/partials/header.ejs) lee la variable "caja" —
      // antes no se pasaba, así que siempre mostraba el default de la
      // vista ('Caja 1') sin importar la caja real del turno abierto.
      caja: req.session.caja_nombre || null,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.status(500).send('Error al cargar el punto de venta: ' + err.message);
  }
});

//TRUNOS 
//-----------------------------

//TRUNOS 
//-----------------------------


router.post('/abrir-turno', async (req, res) => {
  const { caja_id, fondo_inicial } = req.body;
  if (!caja_id) return res.status(400).json({ ok: false, error: 'Selecciona una caja.' });

  try {
    const turno = await api('/turnos/abrir', {
      method: 'POST',
      body: JSON.stringify({
        caja_id,
        fondo_inicial: parseFloat(fondo_inicial) || 0,
      }),
    }, req.session.token);

    req.session.turno_id = turno.id;
    req.session.caja_id  = caja_id;

    // Resolver el nombre de la caja una sola vez para el header
    try {
      const caja = await api(`/cajas/${caja_id}`, {}, req.session.token);
      req.session.caja_nombre = caja?.nombre || null;
    } catch {
      req.session.caja_nombre = null;
    }

    res.json({ ok: true, turno, sucursal_id: req.session.sucursal_id });

  } catch (err) {
    // 409 = ya existe turno en esa caja → reconectar en vez de error
    if (err.status === 409) {
      try {
        const turnoActivo = await api(
          `/turnos/activo?caja_id=${caja_id}`,
          {}, req.session.token
        );
        if (turnoActivo) {
          req.session.turno_id = turnoActivo.id;
          req.session.caja_id  = caja_id;

          try {
            const caja = await api(`/cajas/${caja_id}`, {}, req.session.token);
            req.session.caja_nombre = caja?.nombre || null;
          } catch {
            req.session.caja_nombre = null;
          }

          return res.json({ ok: true, turno: turnoActivo, reconectado: true });
        }
      } catch {}
    }
    res.status(err.status || 500).json({
      ok: false,
      error: err.message || 'No se pudo abrir el turno.',
    });
  }
});

router.post('/reconectar-turno', async (req, res) => {
  const { caja_id } = req.body;
  if (!caja_id) return res.status(400).json({ ok: false });

  try {
    const turno = await api(
      `/turnos/activo?caja_id=${caja_id}`,
      {}, req.session.token
    );

    // Si no hay turno activo → responder sin_turno para mostrar formulario
    if (!turno || !turno.id) {
      return res.json({ ok: false, sin_turno: true });
    }

    req.session.turno_id = turno.id;
    req.session.caja_id  = caja_id;

    // Resolver el nombre de la caja una sola vez para el header
    try {
      const caja = await api(`/cajas/${caja_id}`, {}, req.session.token);
      req.session.caja_nombre = caja?.nombre || null;
    } catch {
      req.session.caja_nombre = null;
    }

    res.json({ ok: true, turno });
  } catch (err) {
    // 404 o cualquier error = no hay turno activo
    res.json({ ok: false, sin_turno: true });
  }
});

router.get('/buscar', async (req, res) => {
  try {
    const { q = '', categoria = '' } = req.query;
    const params = new URLSearchParams();
    if (q) params.append('termino', q);
    if (categoria) params.append('categoria', categoria);
    params.append('solo_con_stock', 'true');

    const productosRaw = await api(`/productos/buscar?${params}`, {}, req.session.token);
    res.json((productosRaw || []).map(p => ({ ...p, nombre: p.descripcion })));
  } catch (err) {
    if (err.status === 401) return res.status(401).json({ error: 'Sesión expirada' });
    res.status(err.status || 500).json({ error: err.message || 'Error al buscar productos.' });
  }
});

router.get('/producto/:id', async (req, res) => {
  try {
    const producto = await api(`/productos/${req.params.id}`, {}, req.session.token);
    res.json({ ...producto, nombre: producto.descripcion });
  } catch (err) {
    res.status(err.status === 404 ? 404 : 500).json({ error: err.message });
  }
});

/* ── Tickets pendientes ─────────────────── */
router.post('/pendiente', async (req, res) => {
  try {
    const venta = await api('/ventas/pendiente', {
      method: 'POST',
      body: JSON.stringify({ ...req.body, caja_id: req.session.caja_id }),
    }, req.session.token);
    res.json({ ok: true, venta });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error al guardar ticket.' });
  }
});

router.put('/pendiente/:id', async (req, res) => {

  try {
    const venta = await api(`/ventas/pendiente/${req.params.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...req.body, caja_id: req.session.caja_id }),
    }, req.session.token);
    res.json({ ok: true, venta });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error al actualizar ticket.' });
  }
});

router.delete('/pendiente/:id', async (req, res) => {
  try {
    // El endpoint de FastAPI exige caja_id como query param
    await api(
      `/ventas/pendiente/${req.params.id}?caja_id=${req.session.caja_id}`,
      { method: 'DELETE' },
      req.session.token
    );
    res.json({ ok: true });
  } catch (err) {
    // 404 = el ticket ya no existe (ej. ya se cobró) — no es un error real
    if (err.status === 404) return res.json({ ok: true, ya_no_existe: true });
    res.status(err.status || 500).json({ error: err.message || 'Error al eliminar ticket.' });
  }
});


router.post('/pendiente/:id/cobrar', async (req, res) => {
  try {
    const venta = await api(`/ventas/pendiente/${req.params.id}/cobrar`, {
      method: 'POST',
      body: JSON.stringify({ ...req.body, caja_id: req.session.caja_id }),
    }, req.session.token);
    res.json({ ok: true, venta });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error al cobrar ticket.' });
  }
});

/* ── Venta directa (sin pasar por pendiente) ────────────────── */
router.post('/cobrar', async (req, res) => {
  if (!req.session.caja_id || !req.session.turno_id) {
    return res.status(409).json({ error: 'No hay un turno abierto. Abre turno antes de cobrar.' });
  }
  const { cliente_id, articulos, pagos, notas } = req.body;
  if (!Array.isArray(articulos) || articulos.length === 0)
    return res.status(400).json({ error: 'El carrito está vacío.' });
  if (!Array.isArray(pagos) || pagos.length === 0)
    return res.status(400).json({ error: 'Debes especificar al menos un método de pago.' });

  try {
    const venta = await api('/ventas/', {
      method: 'POST',
      body: JSON.stringify({
        caja_id:    req.session.caja_id,   // ← desde sesión, no del body
        cliente_id: cliente_id || null,
        articulos,
        pagos,
        notas: notas || null,
      }),
    }, req.session.token);
    res.json({ ok: true, venta });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Error al registrar la venta.' });
  }
});

/* ── Movimientos de caja manuales (F7/F8) ───────────────────── */
router.post('/movimiento-caja', async (req, res) => {
  if (!req.session.caja_id) {
    return res.status(409).json({ error: 'No hay turno activo en esta caja.' });
  }
  try {
    const movimiento = await api('/movimientos-caja/', {
      method: 'POST',
      body: JSON.stringify({ ...req.body, caja_id: req.session.caja_id }),
    }, req.session.token);
    res.json({ ok: true, movimiento });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'No se pudo registrar el movimiento.' });
  }
});




module.exports = router;