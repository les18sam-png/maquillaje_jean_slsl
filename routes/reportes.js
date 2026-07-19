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

    const data = await api(
      `/reportes/?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`,
      {},
      req.session.token
    );

    const labelsDias = data.ventas_por_dia.map(d => {
      const [, m, day] = d.fecha.split('-');
      return `${day}/${m}`;
    });
    const dataDias = data.ventas_por_dia.map(d => d.total);

    res.render('reportes/index', {
      title: 'Reportes',
      fechaInicio,
      fechaFin,
      totalVentas:     data.total_ventas,
      totalTickets:    data.total_tickets,
      ticketProm:      data.ticket_promedio,
      labelsDias,
      dataDias,
      porMetodo:       data.por_metodo,
      cajerosArray:    data.cajeros,
      turnosConVentas: data.turnos,
    });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    if (err.status === 403) return res.status(403).send('No tienes permiso para ver reportes.');
    console.error('Error en GET /reportes:', err.message);
    res.status(500).send('Error al cargar reportes: ' + err.message);
  }
});

/* Helpers de fecha por defecto: últimos 7 días */
function getDefaultFechaInicio() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().substring(0, 10);
}
function getDefaultFechaFin() {
  return new Date().toISOString().substring(0, 10);
}

module.exports = router;