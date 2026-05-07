export const PRODUCT_VIEW_OPTIONS = [
  { value: 'articulos', label: 'Articulos' },
  { value: 'insumos', label: 'Insumos' },
];

export const DEFAULT_PRODUCT_VIEW = 'articulos';

export function normalizeProductView(value) {
  return value === 'insumos' ? 'insumos' : DEFAULT_PRODUCT_VIEW;
}

export function getProductViewMeta(value) {
  const view = normalizeProductView(value);
  if (view === 'insumos') {
    return {
      value: view,
      singular: 'insumo',
      plural: 'insumos',
      title: 'Insumos',
      adminTitle: 'Panel de Administracion de Insumos',
      createTitle: 'Anadir Nuevo Insumo',
      editTitle: 'Editar Insumos',
    };
  }

  return {
    value: DEFAULT_PRODUCT_VIEW,
    singular: 'articulo',
    plural: 'articulos',
    title: 'Articulos',
    adminTitle: 'Panel de Administracion de Articulos',
    createTitle: 'Anadir Nuevo Articulo',
    editTitle: 'Editar Articulos',
  };
}

