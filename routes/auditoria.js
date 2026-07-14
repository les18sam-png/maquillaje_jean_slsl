const express = require('express');
const router = express.Router();
const { api, API_URL } = require('../db/api');

router.get('/', async (req, res) => {
  const {
    usuario_id, caja_id, modulo, accion, registro_id,
    fecha_inicio, fecha_fin, pagina = 1,
  } = req.query;

  const parametros = new URLSearchParams({
    pagina,
    tamano_pagina: 25,
    ...(usuario_id && { usuario_id }),
    ...(caja_id && { caja_id }),
    ...(modulo && { modulo }),
    ...(accion && { accion }),
    ...(registro_id && { registro_id }),
    ...(fecha_inicio && { fecha_inicio }),
    ...(fecha_fin && { fecha_fin }),
  });

  // Cajas y usuarios no deben tumbar la página si fallan (Promise.allSettled)
  const [resultado, cajasResp, usuariosResp] = await Promise.allSettled([
    api(`/auditoria/?${parametros.toString()}`, {}, req.session.token),
    api('/cajas/', {}, req.session.token),
    api('/usuarios/', {}, req.session.token),
  ]);

  if (resultado.status === 'rejected') {
    console.error('Error al consultar auditoría:', resultado.reason);
    const esPermiso = resultado.reason?.status === 403 || resultado.reason?.message?.includes('403');
    return res.render('auditoria/index', {
      registros: [], total: 0, pagina: 1, totalPaginas: 0,
      cajas: [], usuarios: [],
      filtros: req.query,
      toast: esPermiso ? 'sin_permiso' : 'error',
    });
  }

  const datos = resultado.value;
  res.render('auditoria/index', {
    registros: datos?.items || [],
    total: datos?.total || 0,
    pagina: datos?.pagina || 1,
    totalPaginas: datos?.total_paginas || 0,
    cajas: cajasResp.status === 'fulfilled' ? (cajasResp.value?.items || cajasResp.value || []) : [],
    usuarios: usuariosResp.status === 'fulfilled' ? (usuariosResp.value?.items || usuariosResp.value || []) : [],
    filtros: req.query,
    toast: req.query.toast,
  });
});

module.exports = router;