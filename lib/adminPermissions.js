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
    label: 'Catálogo',
    path: '/admin/productos/catalogo',
    roles: ['admin'],
  },
  {
    label: 'Gestión de Productos',
    roles: ['admin', 'administracion', 'almacen'],
    children: [
      { label: 'Añadir Nuevos Artículos', path: '/admin/productos/nuevo', roles: ['admin', 'administracion', 'almacen'] },
      { label: 'Aumentar Stock', path: '/admin/productos/aumentar-stock', roles: ['admin', 'administracion', 'almacen'] },
      { label: 'Editar Artículos', path: '/admin/productos/editar', roles: ['admin'] },
      { label: 'Eliminar Artículos', path: '/admin/productos/eliminar', roles: ['admin'] },
    ],
  },
  {
    label: 'Control de Inventario',
    roles: ['admin', 'administracion', 'vendedor', 'almacen'],
    children: [
      { label: 'Stock', path: '/admin/inventario/stock', roles: ['admin', 'administracion', 'vendedor', 'almacen'] },
      { label: 'Próximo a compra', path: '/admin/inventario/proximo-a-compra', roles: ['admin', 'administracion', 'almacen'] },
      { label: 'Auditoría de Stock', path: '/admin/ventas/auditoria', roles: ['admin', 'administracion', 'vendedor'] },
      { label: 'Estadística', path: '/admin/inventario/estadistica', roles: ['admin', 'administracion', 'almacen'] },
    ],
  },
  {
    label: 'Ventas',
    roles: ['admin', 'administracion', 'vendedor'],
    children: [
      { label: 'Venta de Productos', path: '/admin/ventas/nueva', roles: ['admin', 'administracion', 'vendedor'] },
      { label: 'Todas las ventas', path: '/admin/ventas/todas', roles: ['admin', 'administracion', 'vendedor'] },
      { label: 'Estadística', path: '/admin/ventas/estadistica', roles: ['admin', 'administracion', 'vendedor'] },
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
      { label: 'Estadísticas', path: '/admin/pagos/estadistica', roles: ['admin', 'administracion', 'vendedor'] },
    ],
  },
  { label: 'Flujo de Caja', path: '/admin/flujo-caja', roles: ['admin', 'administracion', 'vendedor'] },
  {
    label: 'Categorías',
    roles: ['admin', 'administracion', 'almacen'],
    children: [
      { label: 'Gestionar Categorías', path: '/admin/categorias', roles: ['admin', 'administracion', 'almacen'] },
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
    label: 'Configuración',
    roles: ['admin'],
    children: [
      { label: 'Panel de Control', path: '/admin/whatsapp', roles: ['admin'] },
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