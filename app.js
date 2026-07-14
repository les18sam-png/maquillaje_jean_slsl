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
const { requireAuth, requireTurno } = require('./middleware/auth');
app.use(requireAuth);

// ── Ruta principal ─────────────────────────
app.get('/', (req, res) => {
  res.redirect('/venta');
});

// ── Rutas ──────────────────────────────────

// ✅ Migrado a API de Python
const productos = require('./routes/productos');
app.use('/productos', productos);

const inventario = require('./routes/inventario');
app.use('/inventario', inventario);

// Verificador viejo (Supabase directo) — pendiente de migrar
const verificador = require('./routes/verificador');
app.use('/verificador', verificador);

// Verificador nuevo (migrado a API)
app.use('/verificador-precios', require('./routes/verificador-precios'));

const venta = require('./routes/venta');
app.use('/venta', venta);

const turnos = require('./routes/turnos');
app.use('/turnos', turnos);


app.use('/ventas-dia', require('./routes/historial'));

const clientes = require('./routes/clientes');
app.use('/clientes', clientes);

const admin = require('./routes/admin');
app.use('/admin', admin);

const reportes = require('./routes/reportes');
app.use('/reportes', reportes);

app.use('/impresion', require('./routes/impresion'));

app.use('/auditoria', require('./routes/auditoria'));

// ── Levantar servidor ──────────────────────
const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
server.timeout = 5 * 60 * 1000; // 5 minutos