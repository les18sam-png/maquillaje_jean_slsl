// routes/impresion.js
const express = require('express');
const router  = express.Router();
const { api } = require('../db/api');
const { imprimirTicket } = require('../utils/impresora');

/* ─────────────────────────────────────────
   POST /impresion/ticket/:venta_id
   Obtiene la venta de FastAPI y la manda
   a la impresora configurada para la caja.
───────────────────────────────────────── */
router.post('/ticket/:venta_id', async (req, res) => {
  try {
    // 1. Obtener datos completos de la venta desde FastAPI
    const venta = await api(`/ventas/${req.params.venta_id}`, {}, req.session.token);

    // 2. Obtener configuración de la impresora de la caja actual
    const caja = await api(`/cajas/${req.session.caja_id}`, {}, req.session.token);

    if (!caja.impresora_tipo || !caja.impresora_valor) {
      return res.status(422).json({
        ok: false,
        error: 'Esta caja no tiene impresora configurada. Ve a Administración → Cajas para configurarla.',
      });
    }

    await imprimirTicket(
      {
        tipo:   caja.impresora_tipo,
        valor:  caja.impresora_valor,
        puerto: caja.impresora_puerto || 9100,
      },
      venta
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[Impresión] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message || 'Error al imprimir el ticket.' });
  }
});

module.exports = router;