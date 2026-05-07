export const ADMIN_ROLES = ['admin', 'administracion', 'vendedor', 'almacen'];

const COMMON_PATHS = ['/admin', '/admin/perfil'];

const VENDEDOR_PATHS = [
  '/admin/pedidos',
  '/admin/ventas',
  '/admin/pagos',
  '/admin/inventario/stock',
  '/admin/flujo-caja',
];

const ALMACEN_PATHS = [
  '/admin/categorias',
  '/admin/productos/nuevo',
  '/admin/productos/aumentar-stock',
  '/admin/productos/transferencia-sucursal',
  '/admin/inventario/stock',
  '/admin/inventario/proximo-a-compra',
  '/admin/inventario/estadistica',
];

const ADMINISTRACION_PATHS = Array.from(new Set([...VENDEDOR_PATHS, ...ALMACEN_PATHS]));

const ROLE_PATHS = {
  admin: ['*'],
  administracion: [...COMMON_PATHS, ...ADMINISTRACION_PATHS],
  vendedor: [...COMMON_PATHS, ...VENDEDOR_PATHS],
  almacen: [...COMMON_PATHS, ...ALMACEN_PATHS],
};

export const ADMIN_MENU = [
  {
    label: 'Perfiles',
    roles: ['admin'],
    children: [
      { label: 'Mi Perfil', path: '/admin/perfil', roles: ADMIN_ROLES },
      { label: 'Perfiles', path: '/admin/perfiles', roles: ['admin'] },
    ],
  },
  {
    label: 'Pedidos',
    roles: ['admin', 'administracion', 'vendedor'],
    children: [
      { label: 'Gestionar Pedidos', path: '/admin/pedidos', roles: ['admin', 'administracion', 'vendedor'] },
    ],
  },
  {
    label: 'Catalogo',
    path: '/admin/productos/catalogo',
    roles: ['admin'],
  },
  {
    label: 'Gestion de Productos',
    roles: ['admin', 'administracion', 'almacen'],
    children: [
      { label: 'Anadir Nuevos Articulos', path: '/admin/productos/nuevo', roles: ['admin', 'administracion', 'almacen'] },
      { label: 'Aumentar Stock', path: '/admin/productos/aumentar-stock', roles: ['admin', 'administracion', 'almacen'] },
      { label: 'Transferencia Sucursal', path: '/admin/productos/transferencia-sucursal', roles: ['admin', 'administracion', 'almacen'] },
      { label: 'Editar Articulos', path: '/admin/productos/editar', roles: ['admin'] },
      { label: 'Eliminar Articulos', path: '/admin/productos/eliminar', roles: ['admin'] },
    ],
  },
  {
    label: 'Control de Inventario',
    roles: ['admin', 'administracion', 'vendedor', 'almacen'],
    children: [
      { label: 'Stock', path: '/admin/inventario/stock', roles: ['admin', 'administracion', 'vendedor', 'almacen'] },
      { label: 'Proximo a compra', path: '/admin/inventario/proximo-a-compra', roles: ['admin', 'administracion', 'almacen'] },
      { label: 'Auditoria de Stock', path: '/admin/ventas/auditoria', roles: ['admin', 'administracion', 'vendedor'] },
      { label: 'Estadistica', path: '/admin/inventario/estadistica', roles: ['admin', 'administracion', 'almacen'] },
    ],
  },
  {
    label: 'Ventas',
    roles: ['admin', 'administracion', 'vendedor'],
    children: [
      { label: 'Venta de Productos', path: '/admin/ventas/nueva', roles: ['admin', 'administracion', 'vendedor'] },
      { label: 'Todas las ventas', path: '/admin/ventas/todas', roles: ['admin', 'administracion', 'vendedor'] },
      { label: 'Estadistica', path: '/admin/ventas/estadistica', roles: ['admin', 'administracion', 'vendedor'] },
      { label: 'Limpieza de ventas', path: '/admin/ventas/limpieza', roles: ['admin'] },
    ],
  },
  {
    label: 'Pagos',
    roles: ['admin', 'administracion', 'vendedor'],
    children: [
      { label: 'QR', path: '/admin/pagos/qr', roles: ['admin', 'administracion', 'vendedor'] },
      { label: 'Transferencias', path: '/admin/pagos/transferencias', roles: ['admin', 'administracion', 'vendedor'] },
      { label: 'Tarjeta', path: '/admin/pagos/tarjeta', roles: ['admin', 'administracion', 'vendedor'] },
      { label: 'Efectivo', path: '/admin/pagos/efectivo', roles: ['admin', 'administracion', 'vendedor'] },
      { label: 'Estadisticas', path: '/admin/pagos/estadistica', roles: ['admin', 'administracion', 'vendedor'] },
    ],
  },
  { label: 'Flujo de Caja', path: '/admin/flujo-caja', roles: ['admin', 'administracion', 'vendedor'] },
  {
    label: 'Categorias',
    roles: ['admin', 'administracion', 'almacen'],
    children: [
      { label: 'Gestionar Categorias', path: '/admin/categorias', roles: ['admin', 'administracion', 'almacen'] },
    ],
  },
  {
    label: 'Promociones',
    roles: ['admin'],
    children: [
      { label: 'Productos', path: '/admin/promociones/productos', roles: ['admin'] },
      { label: 'Descuentos', path: '/admin/promociones/descuentos', roles: ['admin'] },
      { label: 'Packs', path: '/admin/promociones/packs', roles: ['admin'] },
    ],
  },
  {
    label: 'Configuracion',
    roles: ['admin'],
    children: [
      { label: 'Panel de Control', path: '/admin/whatsapp', roles: ['admin'] },
      { label: 'Sucursales', path: '/admin/configuracion/sucursales', roles: ['admin'] },
      { label: 'Generador de QR', path: '/admin/configuracion/generador-qr', roles: ['admin'] },
    ],
  },
];

export function normalizeAdminRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function isAdminPanelRole(role) {
  return ADMIN_ROLES.includes(normalizeAdminRole(role));
}

export function isFullAdminRole(role) {
  return normalizeAdminRole(role) === 'admin';
}

function matchesPath(pathname, allowedPath) {
  if (allowedPath === '/admin') {
    return pathname === '/admin';
  }
  return pathname === allowedPath || pathname.startsWith(`${allowedPath}/`);
}

export function canAccessAdminPath(role, pathname) {
  const normalizedRole = normalizeAdminRole(role);
  const normalizedPath = String(pathname || '').trim();

  if (!isAdminPanelRole(normalizedRole) || !normalizedPath.startsWith('/admin')) return false;
  if (normalizedRole === 'admin') return true;

  const allowedPaths = ROLE_PATHS[normalizedRole] || COMMON_PATHS;
  return allowedPaths.some((allowedPath) => matchesPath(normalizedPath, allowedPath));
}

export function getDefaultAdminRoute(role) {
  const normalizedRole = normalizeAdminRole(role);
  if (normalizedRole === 'admin') return '/admin';
  if (normalizedRole === 'administracion') return '/admin/pedidos';
  if (normalizedRole === 'vendedor') return '/admin/pedidos';
  if (normalizedRole === 'almacen') return '/admin/categorias';
  return '/admin/perfil';
}

export function filterAdminMenuByRole(role, menu = ADMIN_MENU) {
  const normalizedRole = normalizeAdminRole(role);
  return menu
    .map((item) => {
      const itemRoles = item.roles || ADMIN_ROLES;
      if (!itemRoles.includes(normalizedRole)) return null;

      if (!Array.isArray(item.children)) return item;

      const children = item.children.filter((child) => (child.roles || ADMIN_ROLES).includes(normalizedRole));
      if (children.length === 0) return null;

      return { ...item, children };
    })
    .filter(Boolean);
}

export function flattenAdminLinks(menu = ADMIN_MENU) {
  return menu.flatMap((item) => {
    if (Array.isArray(item.children)) return item.children;
    return item.path ? [item] : [];
  });
}
