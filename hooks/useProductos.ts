import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/SupabaseClient';

interface Producto {
  user_id: string;
  nombre: string;
  precio: number;
  precio_base?: number;
  precio_compra?: number;
  stock?: number;
  stock_total?: number;
  codigo_barra?: string;
  codigo?: string;
  categoria?: string;
  unidad?: string;
  unidad_base?: string;
  unidades_alternativas?: string[];
  unidades_disponibles?: string[];
  factor_conversion?: number;
  variante_id?: number | string;
  color?: string;
  variantes?: Array<{
    variante_id?: number;
    id?: number;
    color?: string;
    stock?: number;
    stock_decimal?: number;
    precio?: number;
    sku?: string;
    codigo_barra?: string;
    imagen_url?: string;
    activo?: boolean;
  }>;
  categorias?: { categori?: string };
}

interface VarianteBusqueda {
  producto_id: string | number;
  id?: number;
  color?: string;
  stock?: number;
  stock_decimal?: number;
  precio?: number;
  sku?: string;
}

// simple util to group images by producto_id
function agruparImagenes(imgs: Array<{ producto_id: string | number; imagen_url?: string }>) {
  const out: Record<string, string[]> = {};
  imgs.forEach(i => {
    const id = String(i.producto_id);
    if (!out[id]) out[id] = [];
    if (i.imagen_url) out[id].push(i.imagen_url);
  });
  return out;
}

function buildUnidadesDisponibles(unidadBase?: string, unidadesAlternativas?: string[]) {
  const base = String(unidadBase || '').trim();
  const alternativas = Array.isArray(unidadesAlternativas)
    ? unidadesAlternativas.map((u) => String(u || '').trim()).filter(Boolean)
    : [];
  if (!base) return alternativas;
  return [base, ...alternativas.filter((u) => u !== base)];
}

function getEffectiveVariantStock(variant: { stock?: number | null; stock_decimal?: number | null }) {
  const decimal = Number(variant?.stock_decimal);
  const legacy = Number(variant?.stock);
  return Math.max(0, Number.isFinite(decimal) && decimal > 0 ? decimal : legacy || 0);
}

async function enriquecerUnidades(productos: Producto[], sucursalId?: string) {
  const ids = productos.map((p) => p.user_id).filter(Boolean);
  if (ids.length === 0) return productos;

  let productosQuery = supabase
      .from('productos')
      .select('user_id, unidad_base, unidades_alternativas, factor_conversion, stock')
      .in('user_id', ids);
  let variantesQuery = supabase
      .from('producto_variantes')
      .select('producto_id, id, color, stock, stock_decimal, precio, sku, imagen_url')
      .in('producto_id', ids);
  if (sucursalId) {
    productosQuery = productosQuery.eq('sucursal_id', sucursalId);
    variantesQuery = variantesQuery.eq('sucursal_id', sucursalId);
  }

  const [{ data }, { data: variantRows }] = await Promise.all([productosQuery, variantesQuery]);

  const byId = new Map(
    (Array.isArray(data) ? data : []).map((row) => [
      String(row.user_id),
      {
        unidad_base: String(row.unidad_base || '').trim() || 'unidad',
        unidades_alternativas: Array.isArray(row.unidades_alternativas) ? row.unidades_alternativas : [],
        factor_conversion: Number(row.factor_conversion || 0) || undefined,
        stock: Number(row.stock ?? 0)
      }
    ])
  );
  const variantsByProductId = (Array.isArray(variantRows) ? variantRows : []).reduce<Record<string, Producto['variantes']>>((acc, row) => {
    const key = String(row.producto_id);
    if (!acc[key]) acc[key] = [];
    const effectiveStock = getEffectiveVariantStock(row);
    acc[key]?.push({
      id: row.id,
      variante_id: row.id,
      color: row.color,
      stock: Number(row.stock ?? 0),
      stock_decimal: effectiveStock,
      precio: Number(row.precio ?? 0) || undefined,
      sku: row.sku,
      imagen_url: row.imagen_url,
    });
    return acc;
  }, {});

  return productos.map((producto) => {
    const extra = byId.get(String(producto.user_id));
    if (!extra) return producto;
    const variantesReales = variantsByProductId[String(producto.user_id)];
    const variantes = Array.isArray(variantesReales) && variantesReales.length > 0
      ? variantesReales
      : producto.variantes;
    const variantStock = Array.isArray(variantes) && variantes.length > 0
      ? variantes.reduce((acc, v) => acc + Math.max(0, Number(v.stock_decimal ?? v.stock ?? 0)), 0)
      : 0;
    const productStock = Number.isFinite(extra.stock) ? Math.max(0, extra.stock) : Math.max(0, Number(producto.stock || 0));
    const hasUnitConversion =
      extra.factor_conversion &&
      extra.factor_conversion > 0 &&
      extra.unidades_alternativas.length > 0;
    return {
      ...producto,
      variantes,
      unidad_base: extra.unidad_base,
      unidades_alternativas: extra.unidades_alternativas,
      unidades_disponibles: buildUnidadesDisponibles(extra.unidad_base, extra.unidades_alternativas),
      factor_conversion: extra.factor_conversion,
      unidad: producto.unidad ?? extra.unidad_base,
      stock: hasUnitConversion
        ? (productStock > 0 ? productStock : variantStock)
        : (variantStock > 0 || productStock <= 0 ? variantStock : productStock)
    };
  });
}

export function useProductos(_includeCost = false, sucursalId?: string) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [imagenes, setImagenes] = useState<Record<string, string[]>>({});
  const [searchResults, setSearchResults] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);

  const fetchProductos = useCallback(async () => {
    const selectFields = 'producto_id, nombre, precio_base, stock_total, codigo_barra, categoria, category_id, variantes';
    let query = supabase
      .from('v_productos_catalogo')
      .select(selectFields)
      .limit(1000);
    if (sucursalId) query = query.eq('sucursal_id', sucursalId);
    const { data, error } = await query;
    if (!error && data) {
      const productosBase = Array.isArray(data)
        ? (data as Array<Record<string, unknown>>).map((p) => {
            const variantes = Array.isArray(p.variantes)
              ? (p.variantes as Producto['variantes'])
              : [];
            const precioBase = Number(p.precio_base ?? 0);
            return {
              user_id: String(p.producto_id ?? ''),
              nombre: String(p.nombre ?? ''),
              precio: precioBase,
              precio_base: precioBase,
              precio_compra: undefined,
              stock: Number(p.stock_total ?? 0),
              stock_total: Number(p.stock_total ?? 0),
              codigo_barra: String(p.codigo_barra ?? ''),
              categoria: String(p.categoria ?? ''),
              categorias: { categori: String(p.categoria ?? '') },
              variantes
            } as Producto;
          })
        : [];
      const productosData = await enriquecerUnidades(productosBase, sucursalId);
      setProductos(productosData);
      const ids = productosData.map(p => p.user_id).filter(Boolean);
      if (ids.length) {
        let imgsQuery = supabase
          .from('producto_imagenes')
          .select('producto_id, imagen_url')
          .in('producto_id', ids);
        if (sucursalId) imgsQuery = imgsQuery.eq('sucursal_id', sucursalId);
        const { data: imgs } = await imgsQuery;
        if (Array.isArray(imgs)) setImagenes(agruparImagenes(imgs));
      }
    }
    setLoading(false);
  }, [sucursalId]);

  const searchProductos = useCallback(async (q: string) => {
    setSearchLoading(true);
    try {
      const term = q.trim();
      let resultados: Producto[] = [];

      const normalizeCode = (value: unknown) => String(value ?? '').replace(/\D/g, '');
      const matchesBarcode = (input: string, stored: unknown) => {
        const a = normalizeCode(input);
        const b = normalizeCode(stored);
        if (!a || !b) return false;
        return a === b || (a.length === 13 && a.slice(0, 12) === b) || (b.length === 13 && b.slice(0, 12) === a);
      };

      // Primero, buscar por código de barras de variante si es numérico
      if (term.match(/^\d+$/) && term.length > 3) {
        const fallbackCode = term.length === 13 ? term.slice(0, -1) : '';
        let variantQuery = supabase
          .from('producto_variantes')
          .select('producto_id, id, color, stock, stock_decimal, precio, sku');
        if (sucursalId) variantQuery = variantQuery.eq('sucursal_id', sucursalId);

        if (fallbackCode) {
          variantQuery = variantQuery.or(`sku.eq.${term},sku.eq.${fallbackCode}`);
        } else {
          variantQuery = variantQuery.eq('sku', term);
        }

        const { data: variantMatches } = await variantQuery;

        if (Array.isArray(variantMatches) && variantMatches.length > 0) {
          const matchedVariants = (variantMatches as VarianteBusqueda[]).filter((variant) => matchesBarcode(term, variant.sku));
          
          if (matchedVariants.length > 0) {
            // Obtener los productos de las variantes encontradas
            const productIds = [...new Set(matchedVariants.map(v => v.producto_id))];
            let matchedQuery = supabase
              .from('v_productos_catalogo')
              .select('producto_id, nombre, precio_base, stock_total, codigo_barra, categoria, variantes')
              .in('producto_id', productIds)
              .limit(50);
            if (sucursalId) matchedQuery = matchedQuery.eq('sucursal_id', sucursalId);
            const { data: matchedProducts } = await matchedQuery;

            if (Array.isArray(matchedProducts)) {
              const productosEncontrados = (matchedProducts as Array<Record<string, unknown>>).map((p) => {
                const variantes = Array.isArray(p.variantes)
                  ? (p.variantes as Producto['variantes'])
                  : [];
                const precioBase = Number(p.precio_base ?? 0);
                const matchedVar = matchedVariants.find(v => v.producto_id === p.producto_id);
                return {
                  user_id: String(p.producto_id ?? ''),
                  nombre: String(p.nombre ?? ''),
                  precio: precioBase,
                  precio_base: precioBase,
                  precio_compra: undefined,
                  stock: matchedVar ? getEffectiveVariantStock(matchedVar as any) : Number(p.stock_total ?? 0),
                  stock_total: Number(p.stock_total ?? 0),
                  codigo_barra: String(p.codigo_barra ?? ''),
                  categoria: String(p.categoria ?? ''),
                  categorias: { categori: String(p.categoria ?? '') },
                  variantes,
                  // Preseleccionar la variante encontrada
                  variante_id: matchedVar?.id || matchedVar?.id,
                  color: matchedVar?.color || '',
                  codigo: String(matchedVar?.sku || '')
                } as Producto;
              });
              resultados = await enriquecerUnidades(productosEncontrados, sucursalId);
            }
          }
        }
      }

      const numericMatch = term.match(/^\d+$/);

      // Si no encontramos por código de variante y la búsqueda era numérica,
      // devolvemos vacío para evitar caer al código general de producto.
      if (resultados.length === 0 && numericMatch) {
        setSearchResults([]);
        return [] as Producto[];
      }

      // Si no encontramos por código de variante, buscar por nombre/categoría
      if (resultados.length === 0) {
        const selectFields = 'producto_id, nombre, precio_base, stock_total, codigo_barra, categoria, variantes';
        let query = supabase
          .from('v_productos_catalogo')
          .select(selectFields)
          .order('nombre', { ascending: true })
          .limit(50);
        if (sucursalId) query = query.eq('sucursal_id', sucursalId);
        if (term) {
          query = query.or(`nombre.ilike.%${term}%,categoria.ilike.%${term}%`);
        }
        const { data, error } = await query;
        if (error) throw error;
        const productosEncontrados = Array.isArray(data)
          ? (data as Array<Record<string, unknown>>).map((p) => {
              const variantes = Array.isArray(p.variantes)
                ? (p.variantes as Producto['variantes'])
                : [];
              const precioBase = Number(p.precio_base ?? 0);
              return {
                user_id: String(p.producto_id ?? ''),
                nombre: String(p.nombre ?? ''),
                precio: precioBase,
                precio_base: precioBase,
                precio_compra: undefined,
                stock: Number(p.stock_total ?? 0),
                stock_total: Number(p.stock_total ?? 0),
                codigo_barra: String(p.codigo_barra ?? ''),
                categoria: String(p.categoria ?? ''),
                categorias: { categori: String(p.categoria ?? '') },
                variantes
              } as Producto;
            })
          : [];
        resultados = await enriquecerUnidades(productosEncontrados, sucursalId);
      }

      setSearchResults(resultados);
      // cargar imágenes para resultados
      const ids = resultados.map(r => r.user_id).filter(Boolean);
      if (ids.length) {
        let imgsQuery = supabase
          .from('producto_imagenes')
          .select('producto_id, imagen_url')
          .in('producto_id', ids);
        if (sucursalId) imgsQuery = imgsQuery.eq('sucursal_id', sucursalId);
        const { data: imgs } = await imgsQuery;
        if (Array.isArray(imgs)) {
          setImagenes(prev => ({ ...prev, ...agruparImagenes(imgs) }));
        }
      }
      return resultados;
    } catch (e) {
      // console.error('searchProductos error', e);
      setSearchResults([]);
      return [] as Producto[];
    } finally {
      setSearchLoading(false);
    }
  }, [sucursalId]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  return {
    productos,
    imagenes,
    searchResults,
    loading,
    searchLoading,
    fetchProductos,
    searchProductos
  };
}
