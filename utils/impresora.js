// utils/impresora.js
// Abstracción de impresora térmica ESC/POS para USB y red (RF-04.1, RNF-05.3)

const escpos  = require('escpos');
escpos.USB     = require('escpos-usb');
escpos.Network = require('escpos-network');

/**
 * Imprime un ticket de venta en la impresora configurada para la caja.
 * @param {object} config  — { tipo: 'usb'|'red', valor: string, puerto: number }
 * @param {object} venta   — datos del ticket (folio, total, artículos, pagos, etc.)
 */
async function imprimirTicket(config, venta) {
  return new Promise((resolve, reject) => {
    let device;

    if (config.tipo === 'usb') {
      // valor = 'COM3' en Windows, '/dev/usb/lp0' en Linux
      const dispositivos = escpos.USB.findPrinter();
      if (!dispositivos || dispositivos.length === 0) {
        return reject(new Error('No se encontró impresora USB conectada'));
      }
      device = new escpos.USB(dispositivos[0]);
    } else {
      // red: valor = '192.168.1.100', puerto = 9100
      device = new escpos.Network(config.valor, config.puerto || 9100);
    }

    const printer = new escpos.Printer(device, { encoding: 'ISO-8859-1' });

    device.open(function(err) {
      if (err) return reject(new Error('No se pudo conectar con la impresora: ' + err.message));

      try {
        const linea = '--------------------------------';
        const lineaDoble = '================================';

        printer
          .font('a')
          .align('ct')
          .style('b')
          .size(1, 1)
          .text('MAQUILLAJE Y MAS JEAN')
          .style('normal')
          .text('Ticket de venta')
          .text(lineaDoble)

          .align('lt')
          .text(`Folio:    #${venta.folio}`)
          .text(`Fecha:    ${new Date(venta.creado_en).toLocaleString('es-MX')}`)
          .text(`Cajero:   ${venta.cajero || ''}`)
          .text(`Caja:     ${venta.caja || ''}`)

        if (venta.cliente) {
          printer.text(`Cliente:  ${venta.cliente}`);
        }

        printer
          .text(lineaDoble)
          .align('ct')
          .style('b')
          .text('PRODUCTO       CANT  PRECIO  IMPORTE')
          .style('normal')
          .text(linea);

        // Artículos
        (venta.articulos || []).forEach(art => {
          const nombre = art.descripcion.substring(0, 18).padEnd(18);
          const cant   = String(art.cantidad).padStart(3);
          const precio = `$${Number(art.precio_unitario).toFixed(2)}`.padStart(7);
          const importe = `$${(art.precio_unitario * art.cantidad).toFixed(2)}`.padStart(8);
          printer.text(`${nombre}${cant}${precio}${importe}`);
          if (art.uso_precio_mayoreo) printer.text('  ** PRECIO MAYOREO **');
        });

        printer.text(lineaDoble);

        // Totales
        printer
          .align('rt')
          .style('b')
          .size(1, 1)
          .text(`TOTAL:  $${Number(venta.total).toFixed(2)}`)
          .style('normal')
          .size(0, 0);

        // Pagos
        (venta.pagos || []).forEach(p => {
          const metodoLabel = {
            efectivo: 'Efectivo',
            tarjeta: 'Tarjeta',
            transferencia: 'Transferencia',
            cheque: 'Cheque',
          }[p.metodo] || p.metodo;
          printer.text(`${metodoLabel.padEnd(15)} $${Number(p.monto).toFixed(2)}`);
          if (p.metodo === 'efectivo' && p.cambio > 0) {
            printer.text(`Cambio:         $${Number(p.cambio).toFixed(2)}`);
          }
        });

        printer
          .text(linea)
          .align('ct')
          .text('¡Gracias por su compra!')
          .text(' ')
          .text(' ')
          .cut()
          .close(() => resolve());

      } catch (e) {
        reject(e);
      }
    });
  });
}

module.exports = { imprimirTicket };