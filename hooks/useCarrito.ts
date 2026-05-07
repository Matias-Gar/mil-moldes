import { useState, useEffect, useCallback, useMemo } from 'react';
import { calcularPrecioConPromocion } from '../lib/promociones';
import { usePacks, calcularDescuentoPack } from '../lib/packs';

export interface Producto {
  user_id: string | number | null; // For packs, this should be null
  variante_id?: string | number;
  stock?: number;
  color?: string;
  cart_key?: string;
  variantes?: Array<{
    variante_id?: string | number;
    id?: string | number;
    color?: string;
    stock?: number;
    stock_decimal?: number;
    precio?: number;
    imagen_url?: string;
  }>;
  codigo_barra?: string;
  codigo?: string;
  nombre: string;
  precio: number;
  precio_pack?: number;
  precio_individual?: number;
  precio_original?: number;
  descuento?: number;
  productos?: PackProduct[];
  cantidad?: number;
  cantidad_base?: number;
  cantidad_display?: number;
  unidad?: string;
  unidad_base?: string;
  unidades_alternativas?: string[];
  unidades_disponibles?: string[];
  factor_conversion?: number;
  tipo?: 'pack' | 'producto';
  pack_id?: string | number;
  pack_data?: Pack;
  categorias?: { categori?: string };
}

export interface PackProduct {
  cantidad: number;
  variante_id?: string | number;
  productos: {
    user_id: string;
    nombre: string;
    precio: number;
    producto_variantes?: Array<{
      id?: string | number;
      color?: string;
      precio?: number;
      stock?: number;
      stock_decimal?: number;
      imagen_url?: string;
      sku?: string;
      codigo_barra?: string;
    }>;
  };
}

export interface Pack {
  id: string | number;
  nombre: string;
  descripcion?: string;
  precio_pack: number;
  precio_individual?: number;
  pack_productos?: PackProduct[];
}

export interface PromocionAplicada {
  tipo?: string;
  valor?: number;
  descripcion?: string;
}

export interface CartItem extends Producto {
  cantidad: number;
  cantidad_base?: number;
  cantidad_display?: number;
  unidad?: string; // unidad seleccionada por el usuario (ej: metro, rollo, litro)
  precio: number;
  precio_original?: number;
  descuento_item?: number;
  promocion_aplicada?: PromocionAplicada | null;
  pack_id?: string | number;
  pack_data?: Pack;
  descuento_pack?: number;
  stock?: number;
  categoria?: string;
  imagen_url?: string;
}

const getBaseQuantity = (item: { cantidad?: number; cantidad_base?: number }) => {
  const parsed = Number(item.cantidad_base ?? item.cantidad ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const getDisplayQuantity = (item: { cantidad?: number; cantidad_display?: number }) => {
  const parsed = Number(item.cantidad_display ?? item.cantidad ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const getDisplayStock = (
  item: {
    stock?: number;
    factor_conversion?: number;
    unidad_base?: string;
  },
  unidad?: string,
) => {
  const baseStock = getAvailableStock(item);
  const factor = Number(item.factor_conversion || 0);
  const unidadBase = String(item.unidad_base || unidad || 'unidad');
  const unidadSeleccionada = String(unidad || unidadBase);
  if (unidadSeleccionada !== unidadBase && Number.isFinite(factor) && factor > 0) {
    return baseStock * factor;
  }
  return baseStock;
};

const getAvailableStock = (item: { tipo?: 'pack' | 'producto'; stock?: number }) => {
  if (item.tipo === 'pack') return Number.POSITIVE_INFINITY;
  const parsedStock = Number(item.stock);
  if (!Number.isFinite(parsedStock)) return Number.POSITIVE_INFINITY;
  return Math.max(0, parsedStock);
};

const getItemKey = (item: { tipo?: 'pack' | 'producto'; user_id?: string | number | null; variante_id?: string | number; cart_key?: string; pack_id?: string | number }) => {
  if (item.cart_key) return item.cart_key;
  if (item.tipo === 'pack') return `pack:${String(item.pack_id ?? item.user_id ?? '')}`;
  return `prod:${String(item.user_id ?? '')}:${String(item.variante_id ?? 'default')}`;
};

// Este hook centraliza todo lo relacionado al carrito: estado, operaciones y totales.
export function useCarrito(promociones: unknown[]) {
  const { packs, loading: loadingPacks } = usePacks() as { packs: Pack[]; loading: boolean; };
  const [carrito, setCarrito] = useState<CartItem[]>([]);
  const [stockWarning, setStockWarning] = useState('');

  // recalculate cart if promociones change (fixed new promo detect)
  useEffect(() => {
    setCarrito(prev => prev.map(item => {
      if (item.tipo === 'pack') return item;
      const precioInfo = calcularPrecioConPromocion(item, promociones);
      return {
        ...item,
        precio: precioInfo.precioFinal,
        precio_original: precioInfo.precioOriginal,
        descuento_item: precioInfo.descuento,
        promocion_aplicada: precioInfo.promocion
      };
    }));
  }, [promociones]);

  // cargar/guardar localstorage
  useEffect(() => {
    const stored = typeof window !== 'undefined' && localStorage.getItem('carrito_temporal');
    if (stored) {
      try { setCarrito(JSON.parse(stored)); } catch (e) { console.error('load carrito', e); }
    }
  }, []);
  useEffect(() => {
    if (carrito.length) {
      localStorage.setItem('carrito_temporal', JSON.stringify(carrito));
    } else {
      localStorage.removeItem('carrito_temporal');
    }
  }, [carrito]);

  const clearStockWarning = useCallback(() => {
    setStockWarning('');
  }, []);

  const agregar = useCallback((prod: Producto) => {
    const requestedBaseQuantity = Math.max(0.0001, Number(prod.cantidad_base ?? prod.cantidad ?? 1) || 1);
    const requestedDisplayQuantity = Math.max(0.0001, Number(prod.cantidad_display ?? prod.cantidad ?? 1) || 1);
    const basePrice = Number(prod.precio_original ?? prod.precio ?? 0);
    const prodBase = {
      ...prod,
      precio: basePrice,
      precio_original: basePrice,
      unidad: prod.unidad ?? prod.unidad_base ?? 'unidad',
      cantidad_base: requestedBaseQuantity,
      cantidad_display: requestedDisplayQuantity
    };
    const precioInfo = calcularPrecioConPromocion(prodBase, promociones);
    const precioFinal = precioInfo.precioFinal;
    const availableStock = getAvailableStock(prodBase);

    if (availableStock <= 0 || requestedBaseQuantity > availableStock) {
      setStockWarning(`${prod.nombre}${prod.color ? ` (${prod.color})` : ''} ya no tiene stock disponible.`);
      return false;
    }

    setCarrito(prev => {
      const cartKey = getItemKey(prod);
      const existe = prev.find(p => getItemKey(p) === cartKey);
      if (existe) {
        if (getBaseQuantity(existe) + requestedBaseQuantity > availableStock) {
          setStockWarning(`${prod.nombre}${prod.color ? ` (${prod.color})` : ''} solo tiene ${availableStock} unidad${availableStock === 1 ? '' : 'es'} disponible${availableStock === 1 ? '' : 's'}.`);
          return prev;
        }
        return prev.map(p => getItemKey(p) === cartKey ? {
          ...p,
          unidad_base: prodBase.unidad_base ?? p.unidad_base,
          unidades_alternativas: prodBase.unidades_alternativas ?? p.unidades_alternativas,
          unidades_disponibles: prodBase.unidades_disponibles ?? p.unidades_disponibles,
          factor_conversion: prodBase.factor_conversion ?? p.factor_conversion,
          cantidad: Math.min(getBaseQuantity(p) + requestedBaseQuantity, availableStock),
          cantidad_base: Math.min(getBaseQuantity(p) + requestedBaseQuantity, availableStock),
          cantidad_display: getDisplayQuantity(p) + requestedDisplayQuantity,
          stock: Number.isFinite(availableStock) ? availableStock : p.stock,
          precio: precioFinal,
          precio_original: precioInfo.precioOriginal,
          descuento_item: precioInfo.descuento,
          promocion_aplicada: precioInfo.promocion,
          unidad: prodBase.unidad
        } : p);
      }
      return [...prev, {
        ...prodBase,
        cart_key: cartKey,
        cantidad: requestedBaseQuantity,
        cantidad_base: requestedBaseQuantity,
        cantidad_display: requestedDisplayQuantity,
        stock: Number.isFinite(availableStock) ? availableStock : Number(prod.stock ?? 0),
        precio: precioFinal,
        descuento_item: precioInfo.descuento,
        promocion_aplicada: precioInfo.promocion
      }];
    });
    setStockWarning('');
    return true;
  }, [promociones]);

  const agregarPack = useCallback((pack: Pack) => {
    const { descuentoAbsoluto } = calcularDescuentoPack(pack);
    const itemPack: CartItem = {
      user_id: null, // never use 'pack-<id>' as user_id
      cart_key: `pack:${String(pack.id)}`,
      nombre: `📦 ${pack.nombre}`,
      precio: pack.precio_pack,
      stock: 999,
      categoria: 'Pack Especial',
      cantidad: 1,
      tipo: 'pack',
      pack_id: pack.id,
      pack_data: pack,
      descuento_pack: descuentoAbsoluto
    };
    setCarrito(prev => {
      const existe = prev.find(p => getItemKey(p) === itemPack.cart_key);
      if (existe) {
        return prev.map(p => getItemKey(p) === itemPack.cart_key ? { ...p, cantidad: p.cantidad + 1 } : p);
      }
      return [...prev, itemPack];
    });
  }, []);

  const quitar = useCallback((itemKey: string | number) => {
    const normalized = String(itemKey);
    setCarrito(prev => prev.filter(i => getItemKey(i) !== normalized));
  }, []);


  // Cambiar cantidad y unidad (para productos con conversión)
  const cambiarUnidadYCantidad = useCallback((itemKey: string | number, cantidad: number, unidad?: string, cantidadDisplay?: number) => {
    const normalized = String(itemKey);
    setCarrito(prev => prev.map(i => {
      if (getItemKey(i) !== normalized) return i;
      const availableStock = getAvailableStock(i);
      const requested = Math.max(0.0001, Number(cantidad) || 1);
      const nextUnidad = unidad || i.unidad || i.unidad_base || 'unidad';
      const nextCantidad = Math.min(requested, availableStock);
      const factor = Number(i.factor_conversion || 0);
      const unidadBase = i.unidad_base || nextUnidad;
      const availableDisplayStock = getDisplayStock(i, nextUnidad);
      if (requested > availableStock && Number.isFinite(availableStock)) {
        setStockWarning(
          `${i.nombre}${i.color ? ` (${i.color})` : ''} solo tiene ${availableDisplayStock} ${nextUnidad} disponible${availableDisplayStock === 1 ? '' : 's'}.`
        );
      } else {
        setStockWarning('');
      }
      const derivedDisplayQuantity = nextUnidad && nextUnidad !== unidadBase && factor > 0
        ? nextCantidad * factor
        : nextCantidad;
      const nextDisplayQuantity = Number.isFinite(Number(cantidadDisplay))
        ? Math.max(0.0001, Number(cantidadDisplay))
        : derivedDisplayQuantity;
      return {
        ...i,
        cantidad: nextCantidad,
        cantidad_base: nextCantidad,
        cantidad_display: nextDisplayQuantity,
        unidad: nextUnidad
      };
    }));
  }, []);

  // Mantener compatibilidad con cambiarCantidad (solo cantidad)
  const cambiarCantidad = useCallback((itemKey: string | number, cantidad: number) => {
    cambiarUnidadYCantidad(itemKey, cantidad);
  }, [cambiarUnidadYCantidad]);

  const subtotal = useMemo(() => {
    return carrito.reduce((acc, item) => {
      if (item.tipo === 'pack') {
        const pack = packs.find(p => p.id === item.pack_id);
        return acc + (pack ? pack.precio_pack * item.cantidad : 0);
      }
      const precioInfo = calcularPrecioConPromocion(item, promociones);
      return acc + precioInfo.precioFinal * getBaseQuantity(item);
    }, 0);
  }, [carrito, packs, promociones]);

  const totalDescuento = useMemo(() => {
    return carrito.reduce((acc, item) => {
      if (item.tipo === 'pack') {
        const pack = packs.find(p => p.id === item.pack_id);
        const packDescuento = pack && pack.precio_individual ? (Number(pack.precio_individual) - pack.precio_pack) * item.cantidad : 0;
        return acc + Math.max(0, packDescuento);
      }
      const itemDescuento = item.descuento_item || (item.precio_original ? Number(item.precio_original) - Number(item.precio) : 0);
      return acc + (itemDescuento * getBaseQuantity(item));
    }, 0);
  }, [carrito, packs]);

  const total = Math.max(0, subtotal);

  return {
    carrito,
    setCarrito,
    agregar,
    agregarPack,
    quitar,
    cambiarCantidad,
    cambiarUnidadYCantidad,
    subtotal,
    totalDescuento,
    total,
    loadingPacks,
    stockWarning,
    clearStockWarning
  };
}
