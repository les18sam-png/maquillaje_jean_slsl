const express = require('express');
const router  = express.Router();
const { api } = require('../db/api');

router.get('/', (req, res) => {
  res.render('verificador/index', { title: 'Verificador de Precios' });
});

router.get('/buscar', async (req, res) => {
  try {
    const { q = '', categoria = '' } = req.query;
    const params = new URLSearchParams();
    if (q)         params.append('termino', q);
    if (categoria) params.append('categoria', categoria);
    params.append('solo_con_stock', 'false');

    const productos = await api(`/productos/buscar?${params}`, {}, req.session.token);
    res.json(productos || []);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/categorias', async (req, res) => {
  try {
    const data = await api('/categorias/', {}, req.session.token);
    res.json(data?.items || []);
  } catch {
    res.json([]);
  }
});

module.exports = router;