// POSIBLE ELIMINACION JUNTO CON VIEWS/VERIFICADOR-PRECIO

const express = require('express');
const router  = express.Router();
const { api } = require('../db/api');

router.get('/', async (req, res) => {
  try {
    const categorias = await api('/categorias/', {}, req.session.token)
      .then(r => r?.items || []).catch(() => []);
    res.render('verificador-precios/index', { title: 'Verificador de Precios', categorias });
  } catch (err) {
    if (err.status === 401) return res.redirect('/auth/login?error=sesion');
    res.status(500).send('Error al cargar el verificador.');
  }
});

// Proxy de búsqueda — el navegador no puede llamar FastAPI directamente
router.get('/buscar', async (req, res) => {
  try {
    const { q = '', categoria = '' } = req.query;
    const params = new URLSearchParams();
    if (q)        params.append('termino', q);
    if (categoria) params.append('categoria', categoria);
    // sin solo_con_stock: el verificador muestra agotados (RF-01.4)

    const productos = await api(`/productos/buscar?${params}`, {}, req.session.token);
    res.json(productos || []);
  } catch (err) {
    if (err.status === 401) return res.status(401).json({ error: 'Sesión expirada' });
    res.status(500).json({ error: 'Error al buscar productos.' });
  }
});

module.exports = router;