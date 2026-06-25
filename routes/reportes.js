// routes/reportes.js
// SmartVenta PDV — Módulo Reportes
// SOLO FRONTEND

const express = require('express');
const router  = express.Router();
const { supabase } = require('../db/database');

const SUCURSAL_ID = process.env.SUCURSAL_ID;

/* ─────────────────────────────────────────
   76 — GET /reportes
───────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const fechaInicio = req.query.fecha_inicio || getDefaultFechaInicio();
    const fechaFin    = req.query.fecha_fin    || getDefaultFechaFin();

    // ── Ventas del periodo ──────────────────
    const { data: ventas, error } = await supabase
      .from('ventas')
      .select(`
        id, total, creado_en, metodo_pago_principal, estado, turno_id,
        usuarios!ventas_usuario_id_fkey(nombre_completo)
      `)
      .eq('sucursal_id', SUCURSAL_ID)
      .eq('estado', 'activa')
      .gte('creado_en', fechaInicio)
      .lte('creado_en', fechaFin + 'T23:59:59');

    if (error) throw error;

    const ventasActivas = ventas || [];

    // ── Totales generales ───────────────────
    const totalVentas  = ventasActivas.reduce((s, v) => s + Number(v.total), 0);
    const totalTickets = ventasActivas.length;
    const ticketProm   = totalTickets > 0 ? totalVentas / totalTickets : 0;

    // ── Ventas por día (para gráfica de línea) ──
    const ventasPorDia = {};
    ventasActivas.forEach(v => {
      const fecha = v.creado_en.substring(0, 10);
      ventasPorDia[fecha] = (ventasPorDia[fecha] || 0) + Number(v.total);
    });
    const diasOrdenados = Object.keys(ventasPorDia).sort();
    const labelsDias = diasOrdenados.map(d => {
      const [y, m, day] = d.split('-');
      return `${day}/${m}`;
    });
    const dataDias = diasOrdenados.map(d => ventasPorDia[d]);

    // ── Ventas por método de pago (gráfica barras) ──
    const porMetodo = {
      efectivo: 0, tarjeta: 0, transferencia: 0, cheque: 0, mixto: 0,
    };
    ventasActivas.forEach(v => {
      if (porMetodo.hasOwnProperty(v.metodo_pago_principal)) {
        porMetodo[v.metodo_pago_principal] += Number(v.total);
      }
    });

    // ── Ventas por cajero ────────────────────
    const porCajero = {};
    ventasActivas.forEach(v => {
      const nombre = v.usuarios?.nombre_completo || 'Sin asignar';
      if (!porCajero[nombre]) porCajero[nombre] = { total: 0, tickets: 0 };
      porCajero[nombre].total   += Number(v.total);
      porCajero[nombre].tickets += 1;
    });
    const cajerosArray = Object.entries(porCajero)
      .map(([nombre, datos]) => ({ nombre, ...datos }))
      .sort((a, b) => b.total - a.total);

    // ── Ventas por turno ─────────────────────
    const { data: turnos } = await supabase
      .from('turnos')
      .select('id, inicio, cierre, estado, cajas(nombre)')
      .order('inicio', { ascending: false })
      .limit(10);

    const turnosConVentas = (turnos || []).map(t => {
      const ventasDelTurno = ventasActivas.filter(v => v.turno_id === t.id);
      const totalTurno = ventasDelTurno.reduce((s, v) => s + Number(v.total), 0);
      return {
        ...t,
        totalVentas:  totalTurno,
        numTickets:   ventasDelTurno.length,
      };
    }).filter(t => t.numTickets > 0);

    res.render('reportes/index', {
      title: 'Reportes',
      fechaInicio,
      fechaFin,
      totalVentas,
      totalTickets,
      ticketProm,
      labelsDias,
      dataDias,
      porMetodo,
      cajerosArray,
      turnosConVentas,
    });
  } catch (err) {
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