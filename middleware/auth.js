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



module.exports = { requireAuth };