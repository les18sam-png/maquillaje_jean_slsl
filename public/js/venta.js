// SmartVenta — venta.js

const carrito = [];

function actualizarTotal() {
  const total = carrito.reduce((sum, item) => sum + item.subtotal, 0);
  document.getElementById('total').textContent = `$${total.toFixed(2)}`;
}

function renderCarrito() {
  const tbody = document.getElementById('carrito-body');
  if (!tbody) return;

  if (carrito.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted" style="padding:2rem;">
          Sin productos agregados
        </td>
      </tr>`;
    actualizarTotal();
    return;
  }

  tbody.innerHTML = carrito.map((item, i) => `
    <tr>
      <td>${item.descripcion}</td>
      <td>
        <input type="number" min="1" value="${item.cantidad}"
          onchange="cambiarCantidad(${i}, this.value)"
          style="width:60px;padding:0.25rem;border:1px solid var(--gray-light);border-radius:6px;text-align:center;">
      </td>
      <td>$${item.precio.toFixed(2)}</td>
      <td>$${item.subtotal.toFixed(2)}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="eliminarItem(${i})">✕</button>
      </td>
    </tr>
  `).join('');

  actualizarTotal();
}

function agregarProducto(producto) {
  const existe = carrito.findIndex(i => i.id === producto.id);
  if (existe >= 0) {
    carrito[existe].cantidad++;
    carrito[existe].subtotal = carrito[existe].cantidad * carrito[existe].precio;
  } else {
    carrito.push({
      id: producto.id,
      descripcion: producto.descripcion,
      precio: producto.precio,
      cantidad: 1,
      subtotal: producto.precio
    });
  }
  renderCarrito();
}

function cambiarCantidad(index, valor) {
  const cantidad = parseInt(valor);
  if (cantidad < 1) return;
  carrito[index].cantidad = cantidad;
  carrito[index].subtotal = cantidad * carrito[index].precio;
  actualizarTotal();
}

function eliminarItem(index) {
  carrito.splice(index, 1);
  renderCarrito();
}

// Búsqueda (se conectará al backend después)
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('busqueda');
  if (!input) return;

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = input.value.trim();
      if (!query) return;
      // Por ahora producto de prueba
      agregarProducto({
        id: Date.now(),
        descripcion: query,
        precio: 99.99
      });
      input.value = '';
      input.focus();
    }
  });
});