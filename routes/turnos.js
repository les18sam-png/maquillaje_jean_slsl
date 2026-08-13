const express = require('express');
const router  = express.Router();
const { api } = require('../db/api');

router.get('/', (req, res) => {
  res.redirect('/turnos/cierre');
});

router.get('/apertura', async (req, res) => {
  let turnoAbierto = null;
  if (req.session.turno_id && req.session.caja_id) {
    try {
      turnoAbierto = await api(
        `/turnos/activo?caja_id=${req.session.caja_id}`,
        {}, req.session.token,
      );
    } catch (_) {}
  }

  let cajas = [];
  try {
    const resultado = await api('/cajas/', {}, req.session.token);
    cajas = (resultado?.items || []).filter(c => !c.es_verificador);
  } catch (err) {
    console.error('[Turnos] Error cargando cajas:', err.message);
  }

  res.render('turnos/apertura', {
    title: 'Apertura de Turno',
    cajas,
    turnoAbierto,
    query: req.query,
  });
});

router.post('/apertura', async (req, res) => {
  const { caja_id, fondo_inicial, notas } = req.body;

  if (!caja_id) return res.redirect('/turnos/apertura?error=sin-caja');

  try {
    const turno = await api('/turnos/abrir', {
      method: 'POST',
      body: JSON.stringify({
        caja_id,
        fondo_inicial: parseFloat(fondo_inicial) || 0,
        notas: notas || null,
      }),
    }, req.session.token);

    // Antes solo se guardaba caja_id — el header (views/partials/header.ejs)
    // usa la variable "caja" con el NOMBRE, no el id, así que sin esto se
    // quedaba mostrando el valor viejo de la caja anterior al cambiar.
    let cajaNombre = 'Caja';
    try {
      const cajaData = await api(`/cajas/${caja_id}`, {}, req.session.token);
      cajaNombre = cajaData?.nombre || cajaNombre;
    } catch (err) {
      console.error('[Turnos] No se pudo obtener el nombre de la caja:', err.message);
    }

    req.session.turno_id    = turno.id;
    req.session.caja_id     = caja_id;
    req.session.caja_nombre = cajaNombre;
    res.redirect('/venta');
  } catch (err) {
    console.error('[Turnos] Error abriendo turno:', err.message);
    const esConflicto = err.status === 409 || String(err.message).includes('409');
    res.redirect(`/turnos/apertura?error=${esConflicto ? 'ya-abierto' : 'fallo'}`);
  }
});

router.get('/cierre', async (req, res) => {
  if (!req.session.turno_id) return res.redirect('/venta');

  const fechaFiltro = req.query.fecha    || null;
  const turnoFiltro = req.query.turno_id || req.session.turno_id;

  try {
    const [data, caja, turnosRaw] = await Promise.all([
      api(`/turnos/${turnoFiltro}/resumen`, {}, req.session.token),
      api(`/cajas/${req.session.caja_id}`, {}, req.session.token)
        .catch(err => {
          if (err.status === 401) throw err;
          console.error('[Turnos] Error cargando caja:', err.message);
          return null;
        }),
      api(
        `/turnos/?caja_id=${req.session.caja_id}${fechaFiltro ? `&fecha=${fechaFiltro}` : ''}`,
        {}, req.session.token,
      ).catch(err => {
        if (err.status === 401) throw err;
        console.error('[Turnos] Error listando turnos:', err.message);
        return [];
      }),
    ]);

    // El nombre del cajero dueño ya viene resuelto desde el backend
    // (cajero_nombre), sin depender de /usuarios/ ni de permisos extra.
    const nombreCajero = data.turno.cajero_nombre || '—';

    const totales   = data.totales_por_metodo || {};
    const inicioRaw = data.turno.inicio;
    const inicio    = new Date(inicioRaw.includes('Z') ? inicioRaw : inicioRaw + 'Z');
    const ahora     = new Date();
    const diffMin   = Math.floor((ahora - inicio) / 60000);
    const horas     = Math.floor(diffMin / 60);
    const mins      = diffMin % 60;
    const duracion  = diffMin < 0
      ? 'calculando…'
      : horas > 0 ? `${horas}h ${mins}min` : `${mins} min`;

    res.render('turnos/cierre', {
      title: 'Cierre de Turno',
      turno: {
        ...data.turno,
        cajas:    { nombre: caja?.nombre || '—' },
        usuarios: { nombre_completo: nombreCajero },
      },
      inicio: inicio.toLocaleString('es-MX', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'America/Mexico_City',
      }),
      duracion,
      resumen: {
        totalTickets:       data.total_tickets      || 0,
        totalVentas:        data.total_general       || 0,
        totalEfectivo:      totales.efectivo         || 0,
        totalTarjeta:       totales.tarjeta          || 0,
        totalTransferencia: totales.transferencia    || 0,
        totalCheque:        totales.cheque           || 0,
        totalMixto:         totales.mixto            || 0,
        fondoInicial:       data.fondo_inicial       || 0,
        entradasManual:     data.entradas_manual     || 0,
        salidasTotal:       data.salidas_total       || 0,
        efectivoEsperado:   data.efectivo_esperado   || 0,
        detalleMovimientos: data.detalle_movimientos || [],
      },
      turnosDelDia:      turnosRaw?.items || turnosRaw || [],
      turnoSeleccionado: turnoFiltro,
      fechaFiltro:       fechaFiltro || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }),

      query:             req.query,
    });
  } catch (err) {
    console.error('[Turnos] Error cargando cierre:', err.message);
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.redirect('/venta');
  }
});

// GET /turnos/lista?fecha=YYYY-MM-DD&caja_id=UUID — para el filtro dinámico
router.get('/lista', async (req, res) => {
  try {
    const { fecha, caja_id } = req.query;
    const params = new URLSearchParams();
    if (caja_id) params.append('caja_id', caja_id);
    if (fecha)   params.append('fecha', fecha);

    const data = await api(
      `/turnos/?${params}`, {}, req.session.token
    );
    res.json(data || { items: [] });
  } catch (err) {
    console.error('[Turnos] Error listando:', err.message);
    res.json({ items: [] });
  }
});

router.post('/cierre', async (req, res) => {
  const { turno_id } = req.body;

  try {
    await api(`/turnos/${turno_id}/cerrar`, { method: 'POST' }, req.session.token);
    delete req.session.turno_id;
    delete req.session.caja_id;
    delete req.session.caja_nombre;
    res.redirect('/venta?toast=cerrado');
  } catch (err) {
    console.error('[Turnos] Error cerrando turno:', err.message);
    res.redirect('/turnos/cierre?error=fallo');
  }
});



module.exports = router;