require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 3000;

// Motor de vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Pasar currentPath a todas las vistas
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Parseo de formularios
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sesiones
app.use(session({
  secret: 'smartventa_secret',
  resave: false,
  saveUninitialized: false
}));

// Ruta principal
app.get('/', (req, res) => {
  res.render('index');
});

// Rutas
const verificador = require('./routes/verificador');
app.use('/verificador', verificador);

const venta = require('./routes/venta');
app.use('/venta', venta);

const turnos = require('./routes/turnos');
app.use('/turnos', turnos);

const historial = require('./routes/historial');
app.use('/historial', historial);

const productos = require('./routes/productos');
app.use('/productos', productos);

const inventario = require('./routes/inventario');
app.use('/inventario', inventario);

// ← NUEVO
const clientes = require('./routes/clientes');
app.use('/clientes', clientes);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});