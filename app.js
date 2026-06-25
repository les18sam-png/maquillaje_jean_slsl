require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 3000;

// ── Motor de vistas ────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Pasar currentPath a todas las vistas ───
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// ── Archivos estáticos ─────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ── Parseo de formularios ──────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Sesiones ───────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'cambiar_en_produccion',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,  // poner true en producción con HTTPS
    maxAge: 1000 * 60 * 60 * 8,  // 8 horas, igual que el JWT
  }
}));

// ── Auth (sin protección) ──────────────────
const auth = require('./routes/auth');
app.use('/auth', auth);

// ── Middleware de sesión (protege lo de abajo) ──
const { requireAuth } = require('./middleware/auth');
app.use(requireAuth);

// ── Ruta principal ─────────────────────────
app.get('/', (req, res) => {
  res.render('index');
});

// ── Rutas ──────────────────────────────────

// ✅ Migrado a API de Python
const productos = require('./routes/productos');
app.use('/productos', productos);

const inventario = require('./routes/inventario');
app.use('/inventario', inventario);

// ⏳ Pendiente de migrar — sigue con Supabase
const verificador = require('./routes/verificador');
app.use('/verificador', verificador);

const venta = require('./routes/venta');
app.use('/venta', venta);

const turnos = require('./routes/turnos');
app.use('/turnos', turnos);

const historial = require('./routes/historial');
app.use('/historial', historial);

const clientes = require('./routes/clientes');
app.use('/clientes', clientes);

const admin = require('./routes/admin');
app.use('/admin', admin);

const reportes = require('./routes/reportes');
app.use('/reportes', reportes);

// ── Levantar servidor ──────────────────────
const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
server.timeout = 5 * 60 * 1000; // 5 minutos