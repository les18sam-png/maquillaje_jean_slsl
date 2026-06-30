const express = require('express');
const router  = express.Router();
const { api } = require('../db/api');

// ─────────────────────────────────────────
// GET /turnos/apertura
// ─────────────────────────────────────────
router.get('/apertura', async (req, res) => {
  // Si ya hay turno en sesión, mostrar alerta en la misma vista
  let turnoAbierto = null;
  if (req.session.turno_id && req.session.caja_id) {
    try {
      turnoAbierto = await api(
        `/turnos/activo?caja_id=${req.session.caja_id}`,
        {},
        req.session.token,
      );
    } catch (_) {}
  }

  let cajas = [];
  try {
    const resultado = await api('/cajas/', {}, req.session.token);
    // Excluir el verificador de precios — no puede tener turno (RF-01.4)
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

// ─────────────────────────────────────────
// POST /turnos/apertura — abre turno y guarda en sesión
// ─────────────────────────────────────────
router.post('/apertura', async (req, res) => {
  const { caja_id, fondo_inicial, notas } = req.body;

  if (!caja_id) {
    return res.redirect('/turnos/apertura?error=sin-caja');
  }

  try {
    const turno = await api(
      '/turnos/abrir',
      {
        method: 'POST',
        body: JSON.stringify({
          caja_id,
          fondo_inicial: parseFloat(fondo_inicial) || 0,
          notas: notas || null,
        }),
      },
      req.session.token,
    );

    // Guardar turno y caja en sesión para que los routers de venta los usen
    req.session.turno_id = turno.id;
    req.session.caja_id  = caja_id;

    res.redirect('/venta');
  } catch (err) {
    console.error('[Turnos] Error abriendo turno:', err.message);
    // 409 = caja ya tiene turno abierto
    const esConflicto = err.status === 409 || String(err.message).includes('409');
    res.redirect(`/turnos/apertura?error=${esConflicto ? 'ya-abierto' : 'fallo'}`);
  }
});

// ─────────────────────────────────────────
// GET /turnos/cierre — pantalla de cierre del turno activo
// ─────────────────────────────────────────
router.get('/cierre', async (req, res) => {
  if (!req.session.turno_id) return res.redirect('/venta');

  try {
    const fechaFiltro  = req.query.fecha  || null;
    const turnoFiltro  = req.query.turno_id || req.session.turno_id;

    const [data, caja, turnosDelDia] = await Promise.all([
      api(`/turnos/${turnoFiltro}/resumen`, {}, req.session.token),
      api(`/cajas/${req.session.caja_id}`, {}, req.session.token).catch(() => null),
      fechaFiltro
        ? api(`/turnos/?fecha=${fechaFiltro}&caja_id=${req.session.caja_id}`, {}, req.session.token).catch(() => [])
        : api(`/turnos/?caja_id=${req.session.caja_id}`, {}, req.session.token).catch(() => []),
    ]);

    const totales = data.totales_por_metodo || {};

    // Fix timezone: Supabase devuelve UTC sin Z
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
        usuarios: { nombre_completo: req.session.usuario?.nombre_completo || '—' },
      },
      inicio: inicio.toLocaleString('es-MX', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }),
      duracion,
      resumen: {
        totalTickets:       data.total_tickets     || 0,
        totalVentas:        data.total_general     || 0,
        totalEfectivo:      totales.efectivo       || 0,
        totalTarjeta:       totales.tarjeta        || 0,
        totalTransferencia: totales.transferencia  || 0,
        totalCheque:        totales.cheque         || 0,
        totalMixto:         totales.mixto          || 0,
      },
      turnosDelDia: turnosDelDia?.items || turnosDelDia || [],
      turnoSeleccionado: turnoFiltro,
      fechaFiltro: fechaFiltro || new Date().toISOString().split('T')[0],
      query: req.query,
    });
  } catch (err) {
    console.error('[Turnos] Error cargando cierre:', err.message);
    res.redirect('/venta');
  }
});

// ─────────────────────────────────────────
// POST /turnos/cierre — cierra el turno
// ─────────────────────────────────────────
router.post('/cierre', async (req, res) => {
  const { turno_id } = req.body;

  try {
    await api(
      `/turnos/${turno_id}/cerrar`,
      { method: 'POST' },
      req.session.token,
    );

    // Limpiar turno y caja de sesión — el cajero deberá abrir uno nuevo
    delete req.session.turno_id;
    res.redirect('/turnos/apertura?toast=cerrado&limpiar_caja=1');
    delete req.session.caja_id;

    res.redirect('/turnos/apertura?toast=cerrado');
  } catch (err) {
    console.error('[Turnos] Error cerrando turno:', err.message);
    res.redirect(`/turnos/cierre?error=fallo`);
  }
});

module.exports = router;