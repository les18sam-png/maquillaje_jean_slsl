// SmartVenta — main.js

document.addEventListener('DOMContentLoaded', () => {

  // ── Sidebar: marcar link activo ──────────────────────
  const links = document.querySelectorAll('.sidebar-link');
  const ruta  = window.location.pathname;

  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href && ruta.startsWith(href) && href !== '/') {
      link.classList.add('active');
    } else if (href === '/' && ruta === '/') {
      link.classList.add('active');
    }
  });

  // ── Header: título de página dinámico ────────────────
  const titleEl = document.getElementById('headerPageTitle');
  if (titleEl) {
    const pageTitles = {
      '/':           'Inicio',
      '/venta':      'Punto de Venta',
      '/turnos':     'Turnos',
      '/historial':  'Historial de Ventas',
      '/productos':  'Catálogo de Productos',
      '/inventario': 'Inventario',
      '/clientes':   'Clientes',
      '/reportes':   'Reportes',
      '/admin':      'Administración',
    };

    const match = Object.keys(pageTitles)
      .sort((a, b) => b.length - a.length)
      .find(k => ruta.startsWith(k));

    if (match) titleEl.textContent = pageTitles[match];
  }

});

// ── Sistema de Toasts ────────────────────────────────────
function showToast(mensaje, tipo = 'info', duracion = 3500) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.textContent = mensaje;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, duracion);
}

// Exponer globalmente
window.showToast = showToast;