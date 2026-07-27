const express = require('express');
const router  = express.Router();
const fs = require('fs');
const path = require('path');
const { api } = require('../db/api');

const logoDir = path.join(__dirname, '../public/uploads/logo');

function obtenerLogoActual() {
  try {
    const archivos = fs.readdirSync(logoDir)
      .filter(f => /^logo-.*\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort()
      .reverse();
    return archivos[0] || null;
  } catch {
    return null;
  }
}

router.get('/', (req, res) => {
  res.render('verificador/index', { title: 'Verificador de Precios', logoActual: obtenerLogoActual() });
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