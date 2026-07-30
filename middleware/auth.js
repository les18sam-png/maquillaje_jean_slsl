// middleware/auth.js

function requireAuth(req, res, next) {
  if (!req.session.token) {
    return res.redirect('/auth/login');
  }

  // La dueña solo puede ver su panel — cualquier otra ruta la regresa ahí
  const esDueno = !!req.session.permisos?.perm_dueno;
  if (esDueno && !req.path.startsWith('/dashboard-dueno')) {
    return res.redirect('/dashboard-dueno');
  }

  res.locals.usuario     = req.session.usuario?.nombre_completo || null;
  res.locals.sucursal    = req.session.sucursal_nombre || null;
  res.locals.sucursal_id = req.session.sucursal_id;
  res.locals.permisos    = req.session.permisos || {};
  res.locals.caja        = req.session.caja_nombre || null;
  next();
}

// Verifica que haya un turno abierto en sesión.
// Si no, manda a apertura antes de dejar entrar al POS o a rutas de venta.
function requireTurno(req, res, next) {
  if (!req.session.turno_id || !req.session.caja_id) {
    return res.redirect('/turnos/apertura');
  }
  res.locals.caja_id   = req.session.caja_id;
  res.locals.turno_id  = req.session.turno_id;
  next();
}

module.exports = { requireAuth, requireTurno };