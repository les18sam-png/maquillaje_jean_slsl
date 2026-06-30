// middleware/auth.js

function requireAuth(req, res, next) {
  if (!req.session.token) {
    return res.redirect('/auth/login');
  }
  res.locals.usuario     = req.session.usuario;
  res.locals.sucursal_id = req.session.sucursal_id;
  res.locals.permisos    = req.session.permisos || {};
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.token) {
    return res.redirect('/auth/login?error=sesion');
  }
  res.locals.usuario     = req.session.usuario;
  res.locals.sucursal_id = req.session.sucursal_id;
  res.locals.permisos    = req.session.permisos || {};
  next();
}

// Verifica que haya un turno abierto en sesión.
// Si no, manda a apertura antes de dejar entrar al POS o a rutas de venta.
function requireTurno(req, res, next) {
  if (!req.session.turno_id || !req.session.caja_id) {
    return res.redirect('/turnos/apertura');
  }
  res.locals.caja_id  = req.session.caja_id;
  res.locals.turno_id = req.session.turno_id;
  next();
}

module.exports = { requireAuth, requireTurno };

