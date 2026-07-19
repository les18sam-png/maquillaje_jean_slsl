// utils/config-ticket.js
// Guarda y lee la configuración personalizable del ticket impreso.
// Se almacena en un archivo JSON — no toca la base de datos.

const fs   = require('fs');
const path = require('path');

const configDir  = path.join(__dirname, '../config');
const configFile = path.join(configDir, 'ticket.json');

// Valores por defecto si nunca se ha guardado nada
const DEFAULTS = {
  mensaje_final: '¡Gracias por su compra!',
  leyenda: '',
  mostrar_direccion: true,
  mostrar_telefono: true,
};

function leerConfigTicket() {
  try {
    const contenido = fs.readFileSync(configFile, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(contenido) };
  } catch {
    return { ...DEFAULTS };
  }
}

function guardarConfigTicket(datos) {
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  const actual = leerConfigTicket();
  const nuevo  = { ...actual, ...datos };

  fs.writeFileSync(configFile, JSON.stringify(nuevo, null, 2), 'utf8');
  return nuevo;
}

module.exports = { leerConfigTicket, guardarConfigTicket, DEFAULTS };