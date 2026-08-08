// utils/impresora.js
// Impresión de tickets térmicos ESC/POS (RF-04.1, RNF-05.3)
//
// Estrategia: node-thermal-printer arma el buffer ESC/POS en memoria
// (sin usar su mecanismo de "interface" real), y nosotros lo enviamos
// directo a la impresora compartida de Windows con "copy /b", sin
// depender de módulos nativos (node-printer) que no compilan en
// Node/VS2022 recientes.
//
// config.valor para tipo 'usb' = nombre del RECURSO COMPARTIDO en Windows
// (Panel de control → Impresoras → Propiedades → Uso compartido),
// NO necesariamente el nombre completo de la impresora.
/**
 * Normaliza un timestamp de FastAPI/Supabase a un Date correcto.
 * La columna `creado_en` es `timestamp` SIN zona horaria en Postgres,
 * pero el valor guardado corresponde a UTC (por now() en sesión UTC).
 * Si el string no trae offset, se le agrega 'Z' para que Node lo
 * interprete como UTC en vez de como hora local del servidor.
 */

const { printer: ThermalPrinter, types: PrinterTypes } = require('node-thermal-printer');
const { exec } = require('child_process');
const sharp = require('sharp');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { leerConfigTicket } = require('./config-ticket');
function normalizarFecha(valor) {
  if (!valor) return new Date();
  const tieneZona = /Z$|[+-]\d{2}:\d{2}$/.test(valor);
  return new Date(tieneZona ? valor : `${valor}Z`);
}
const logoDir = path.join(__dirname, '../public/uploads/logo');

// Ancho máximo del logo en píxeles para papel de 80mm.
// Ajustar si se ve muy grande (bajar) o muy chico (subir).
const ANCHO_LOGO_PX = 180;
const RADIO_ESQUINAS_PX = 22; // qué tanto se redondean las esquinas del logo

function obtenerRutaLogo() {
  try {
    const archivos = fs.readdirSync(logoDir)
      .filter(f => /^logo-.*\.png$/i.test(f)) // printImage solo soporta PNG
      .sort()
      .reverse();
    return archivos[0] ? path.join(logoDir, archivos[0]) : null;
  } catch {
    return null;
  }
}

/**
 * Redimensiona el logo a un ancho fijo apropiado para el papel térmico,
 * le recorta las esquinas redondeadas (sobre fondo blanco, para que las
 * esquinas salgan en blanco/vacías al imprimir en térmica), lo convierte
 * a escala de grises, y devuelve la ruta de un archivo temporal PNG.
 */
async function prepararLogoParaImpresion(rutaOriginal) {
  const rutaTemp = path.join(os.tmpdir(), `logo_ticket_${Date.now()}.png`);

  // Redimensionar primero y materializar el resultado en un buffer, para
  // conocer las dimensiones REALES de salida antes de construir la máscara
  // (el .resize() de sharp es perezoso y no se aplica hasta procesar).
  const bufferRedimensionado = await sharp(rutaOriginal)
    .resize({ width: ANCHO_LOGO_PX })
    .toBuffer();

  const metadata = await sharp(bufferRedimensionado).metadata();
  const ancho = metadata.width;
  const alto  = metadata.height;

  // Máscara con esquinas redondeadas (rect blanco con radio, sobre fondo transparente)
  const mascara = Buffer.from(
    `<svg width="${ancho}" height="${alto}">
       <rect x="0" y="0" width="${ancho}" height="${alto}" rx="${RADIO_ESQUINAS_PX}" ry="${RADIO_ESQUINAS_PX}" fill="#fff"/>
     </svg>`
  );

  await sharp(bufferRedimensionado)
    .composite([{ input: mascara, blend: 'dest-in' }]) // recorta con la máscara
    .flatten({ background: '#ffffff' })                // rellena lo transparente (esquinas) de blanco
    .greyscale()
    .png()
    .toFile(rutaTemp);

  return rutaTemp;
}

/**
 * Envía un buffer crudo ESC/POS a una impresora compartida de Windows
 * usando el comando "copy /b", sin depender de módulos nativos.
 * @param {Buffer} buffer      — bytes ESC/POS ya armados
 * @param {string} nombreShare — nombre del recurso compartido en Windows
 */
function enviarBufferAImpresoraWindows(buffer, nombreShare) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `ticket_${Date.now()}.prn`);
    fs.writeFile(tempFile, buffer, (errEscritura) => {
      if (errEscritura) return reject(new Error('No se pudo generar el archivo temporal del ticket.'));

      const destino = `\\\\localhost\\${nombreShare}`;
      exec(`copy /b "${tempFile}" "${destino}"`, (errComando, stdout, stderr) => {
        fs.unlink(tempFile, () => {}); // limpiar siempre, incluso si falla

        if (errComando) {
          return reject(new Error(
            `No se pudo enviar el ticket a "${nombreShare}". Verifica que la impresora esté compartida con ese nombre exacto. Detalle: ${stderr || errComando.message}`
          ));
        }
        resolve();
      });
    });
  });
}

/**
 * Imprime un ticket de venta en la impresora configurada para la caja.
 * @param {object} config  — { tipo: 'usb'|'red', valor: string, puerto: number }
 * @param {object} venta   — datos del ticket (folio, total, artículos, pagos, etc.)
 */
async function imprimirTicket(config, venta) {
  const cfg = leerConfigTicket();
  const rutaLogo = obtenerRutaLogo();

  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: 'tcp://127.0.0.1:9100', // requerido por la librería, nunca se usa (solo llamamos getBuffer())
    characterSet: 'PC850_MULTILINGUAL',
    removeSpecialCharacters: false,
    lineCharacter: '-',
    width: 48, // 80mm = 48 caracteres por línea (RNF-05.3)
  });

  let rutaLogoTemp = null;

  try {
    // Logo — redimensionado y con esquinas redondeadas
    if (rutaLogo) {
      try {
        rutaLogoTemp = await prepararLogoParaImpresion(rutaLogo);
        printer.alignCenter();
        await printer.printImage(rutaLogoTemp);
        printer.newLine();
      } catch (e) {
        // Si falla el logo, el ticket debe imprimirse igual, sin logo.
        console.error('[Impresión] No se pudo imprimir el logo:', e.message);
      }
    }

    printer.alignCenter();
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println(venta.sucursal_nombre || 'MAQUILLAJE Y MAS JEAN');
    printer.setTextNormal();
    printer.bold(false);

    if (cfg.mostrar_direccion && venta.sucursal_direccion) printer.println(venta.sucursal_direccion);
    if (cfg.mostrar_telefono && venta.sucursal_telefono)   printer.println(`Tel: ${venta.sucursal_telefono}`);

    printer.println('Ticket de venta');
    printer.drawLine();

    printer.alignLeft();
    printer.println(`Folio:    #${venta.folio}`);
   printer.println(`Fecha:    ${normalizarFecha(venta.creado_en).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`);
    printer.println(`Cajero:   ${venta.cajero || ''}`);
    printer.println(`Caja:     ${venta.caja || ''}`);
    if (venta.cliente) printer.println(`Cliente:  ${venta.cliente}`);

    printer.drawLine();
    printer.alignCenter();
    printer.bold(true);
    printer.println('PRODUCTO       CANT  PRECIO  IMPORTE');
    printer.bold(false);
    printer.alignLeft();

    // Artículos
    (venta.articulos || []).forEach(art => {
      const nombre  = art.descripcion.substring(0, 22).padEnd(22);
      const cant    = String(art.cantidad).padStart(3);
      const precio  = `$${Number(art.precio_unitario).toFixed(2)}`.padStart(7);
      const importe = `$${(art.precio_unitario * art.cantidad).toFixed(2)}`.padStart(8);
      printer.println(`${nombre}${cant}${precio}${importe}`);
      if (art.uso_precio_mayoreo) printer.println('  ** PRECIO MAYOREO **');
      if (art.uso_promocion) printer.println('  ** PROMOCIÓN **');
    });

    if (venta.notas) {
      printer.drawLine();
      printer.alignLeft();
      printer.bold(true);
      printer.println('Notas:');
      printer.bold(false);
      printer.println(venta.notas);
    }

    printer.drawLine();

    // Total
    printer.alignRight();
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println(`TOTAL:  $${Number(venta.total).toFixed(2)}`);
    printer.setTextNormal();
    printer.bold(false);

// Pagos
    (venta.pagos || []).forEach(p => {
      const metodoLabel = {
        efectivo: 'Efectivo',
        tarjeta: 'Tarjeta',
        transferencia: 'Transferencia',
        cheque: 'Cheque',
      }[p.metodo] || p.metodo;

      if (p.metodo === 'efectivo') {
        // "monto" es lo que cubre de la venta; lo que el cliente dio en
        // físico es monto + cambio (así se calculó el cambio en el backend).
        const recibido = Number(p.monto) + Number(p.cambio || 0);
        printer.println(`${metodoLabel.padEnd(15)} $${recibido.toFixed(2)}`);
        printer.println(`Cambio:         $${Number(p.cambio || 0).toFixed(2)}`);
      } else {
        printer.println(`${metodoLabel.padEnd(15)} $${Number(p.monto).toFixed(2)}`);
      }
    });

    printer.drawLine();
    printer.alignCenter();
    printer.println(cfg.mensaje_final || '¡Gracias por su compra!');
    if (cfg.leyenda) { printer.newLine(); printer.println(cfg.leyenda); }

    // Abrir cajón de dinero solo si el pago incluye efectivo (puro o mixto)
    const incluyeEfectivo = (venta.pagos || []).some(p => p.metodo === 'efectivo');
    if (incluyeEfectivo) printer.openCashDrawer();

    printer.newLine();
    printer.newLine();
    printer.cut();

    // Obtener el buffer crudo y enviarlo nosotros mismos
    const buffer = printer.getBuffer();

    if (config.tipo === 'usb') {
      // config.valor = nombre del recurso compartido en Windows
      await enviarBufferAImpresoraWindows(buffer, config.valor);
    } else {
      throw new Error('Impresión por red aún no soportada en este flujo — pendiente de implementar.');
    }
  } catch (e) {
    throw new Error('Error al generar o enviar el ticket: ' + e.message);
  } finally {
    if (rutaLogoTemp) fs.unlink(rutaLogoTemp, () => {});
  }
}

module.exports = { imprimirTicket };