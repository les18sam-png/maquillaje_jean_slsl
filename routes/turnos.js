// routes/turnos.js
// SmartVenta PDV — Módulo Turnos
// SOLO FRONTEND

const express = require('express');
const router  = express.Router();
const { supabase } = require('../db/database');

const SUCURSAL_ID = process.env.SUCURSAL_ID;
const USUARIO_ID  = '00000000-0000-0000-0000-000000000000'; // temporal

/* ─────────────────────────────────────────
   Helper: obtener turno abierto actual
───────────────────────────────────────── */
async function getTurnoAbierto() {
  const { data } = await supabase
    .from('turnos')
    .select(`
      id, inicio, estado,
      cajas(id, nombre),
      usuarios(id, nombre_completo)
    `)
    .eq('estado', 'abierto')
    .order('inicio', { ascending: false })
    .limit(1)
    .single();
  return data || null;
}

/* ─────────────────────────────────────────
   GET /turnos → redirige según estado
───────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const turno = await getTurnoAbierto();
    if (turno) {
      res.redirect('/turnos/cierre');
    } else {
      res.redirect('/turnos/apertura');
    }
  } catch (err) {
    console.error('Error en GET /turnos:', err.message);
    res.redirect('/turnos/apertura');
  }
});

/* ─────────────────────────────────────────
   64 — GET /turnos/apertura
───────────────────────────────────────── */
router.get('/apertura', async (req, res) => {
  try {
    // Verificar si ya hay turno abierto
    const turnoAbierto = await getTurnoAbierto();

    // Obtener cajas de la sucursal
    const { data: cajas } = await supabase
      .from('cajas')
      .select('id, nombre')
      .eq('sucursal_id', SUCURSAL_ID)
      .eq('activa', true)
      .eq('es_verificador', false)
      .order('nombre');

    res.render('turnos/apertura', {
      title:        'Apertura de Turno',
      turnoAbierto: turnoAbierto || null,
      cajas:        cajas || [],
      ahora:        new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error en GET /turnos/apertura:', err.message);
    res.status(500).send('Error al cargar apertura de turno: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   POST /turnos/apertura — Abrir turno
───────────────────────────────────────── */
router.post('/apertura', async (req, res) => {
  try {
    const { caja_id, fondo_inicial, notas } = req.body;

    // Verificar que no haya turno abierto en esa caja
    const { data: turnoExistente } = await supabase
      .from('turnos')
      .select('id')
      .eq('caja_id', caja_id)
      .eq('estado', 'abierto')
      .single();

    if (turnoExistente) {
      return res.redirect('/turnos/apertura?error=ya-abierto');
    }

    const { error } = await supabase
      .from('turnos')
      .insert([{
        caja_id,
        usuario_id: USUARIO_ID,
        estado:     'abierto',
        inicio:     new Date().toISOString(),
      }]);

    if (error) throw error;

    res.redirect('/turnos/cierre?toast=abierto');
  } catch (err) {
    console.error('Error abriendo turno:', err.message);
    res.redirect('/turnos/apertura?error=fallo');
  }
});

/* ─────────────────────────────────────────
   65 — GET /turnos/cierre
───────────────────────────────────────── */
router.get('/cierre', async (req, res) => {
  try {
    const turno = await getTurnoAbierto();

    if (!turno) {
      return res.redirect('/turnos/apertura?error=sin-turno');
    }

    // Resumen de ventas del turno
    const { data: ventas } = await supabase
      .from('ventas')
      .select('total, metodo_pago_principal, estado')
      .eq('turno_id', turno.id)
      .eq('estado', 'activa');

    const resumen = {
      totalVentas:      0,
      totalTickets:     0,
      totalEfectivo:    0,
      totalTarjeta:     0,
      totalTransferencia: 0,
      totalCheque:      0,
      totalMixto:       0,
    };

    (ventas || []).forEach(v => {
      resumen.totalVentas  += Number(v.total) || 0;
      resumen.totalTickets += 1;
      if (v.metodo_pago_principal === 'efectivo')      resumen.totalEfectivo      += Number(v.total);
      if (v.metodo_pago_principal === 'tarjeta')       resumen.totalTarjeta       += Number(v.total);
      if (v.metodo_pago_principal === 'transferencia') resumen.totalTransferencia += Number(v.total);
      if (v.metodo_pago_principal === 'cheque')        resumen.totalCheque        += Number(v.total);
      if (v.metodo_pago_principal === 'mixto')         resumen.totalMixto         += Number(v.total);
    });

    // Duración del turno
    const inicio   = new Date(turno.inicio);
    const ahora    = new Date();
    const diffMs   = ahora - inicio;
    const diffHrs  = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);
    const duracion = `${diffHrs}h ${diffMins}m`;

    res.render('turnos/cierre', {
      title:    'Cierre de Turno',
      turno,
      resumen,
      duracion,
      inicio:   inicio.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }),
    });
  } catch (err) {
    console.error('Error en GET /turnos/cierre:', err.message);
    res.status(500).send('Error al cargar cierre de turno: ' + err.message);
  }
});

/* ─────────────────────────────────────────
   POST /turnos/cierre — Cerrar turno
───────────────────────────────────────── */
router.post('/cierre', async (req, res) => {
  try {
    const { turno_id, notas } = req.body;

    const { error } = await supabase
      .from('turnos')
      .update({
        estado: 'cerrado',
        cierre: new Date().toISOString(),
      })
      .eq('id', turno_id)
      .eq('estado', 'abierto');

    if (error) throw error;

    res.redirect('/turnos/apertura?toast=cerrado');
  } catch (err) {
    console.error('Error cerrando turno:', err.message);
    res.redirect('/turnos/cierre?error=fallo');
  }
});

module.exports = router;