// routes/reportes.js
// SmartVenta PDV — Módulo Reportes
// Migrado a API (antes Supabase directo)

const express = require('express');
const router  = express.Router();
const { api } = require('../db/api');

/* ─────────────────────────────────────────
   GET /reportes
───────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const fechaInicio = req.query.fecha_inicio || getDefaultFechaInicio();
    const fechaFin    = req.query.fecha_fin    || getDefaultFechaFin();
    const cajaId      = req.query.caja_id || '';

    const cajasData = await api('/cajas/?solo_activas=true', {}, req.session.token).catch(() => ({ items: [] }));
    const cajas = cajasData.items || [];

    const params = new URLSearchParams({ fecha_inicio: fechaInicio, fecha_fin: fechaFin });
    if (cajaId) params.append('caja_id', cajaId);

    let data;
    try {
      data = await api(`/reportes/?${params.toString()}`, {}, req.session.token);
    } catch (err) {
      if (err.status === 401) return res.redirect('/auth/login?error=sesion');
      if (err.status === 403) {
        return res.render('reportes/index', {
          title: 'Reportes',
          fechaInicio, fechaFin, caja_id: cajaId, cajas,
          totalVentas: 0, totalTickets: 0, ticketProm: 0,
          labelsDias: [], dataDias: [], porMetodo: {},
          cajerosArray: [], turnosConVentas: [],
          ventasPorCaja: [], topProductos: [],
          error: 'No tienes permiso para consultar los reportes.',
        });
      }
      throw err;
    }

    const labelsDias = data.ventas_por_dia.map(d => {
      const [, m, day] = d.fecha.split('-');
      return `${day}/${m}`;
    });
    const dataDias = data.ventas_por_dia.map(d => d.total);

    res.render('reportes/index', {
      title: 'Reportes',
      fechaInicio, fechaFin, caja_id: cajaId, cajas,
      totalVentas:     data.total_ventas,
      totalTickets:    data.total_tickets,
      ticketProm:      data.ticket_promedio,
      labelsDias, dataDias,
      porMetodo:       data.por_metodo,
      cajerosArray:    data.cajeros,
      turnosConVentas: data.turnos,
      ventasPorCaja:   data.ventas_por_caja || [],
      topProductos:    data.top_productos || [],
      error: null,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    console.error('Error en GET /reportes:', err.message);
    res.status(500).send('Error al cargar reportes: ' + err.message);
  }
});

function getDefaultFechaInicio() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}
function getDefaultFechaFin() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

module.exports = router;