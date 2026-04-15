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
  variante_id?: number | string;
  color?: string;
  variantes?: Array<{
    variante_id?: number;
    id?: number;
    color?: string;
    stock?: number;
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

export function useProductos(_includeCost = false) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [imagenes, setImagenes] = useState<Record<string, string[]>>({});
  const [searchResults, setSearchResults] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);

  const fetchProductos = useCallback(async () => {
    const selectFields = 'producto_id, nombre, precio_base, stock_total, codigo_barra, categoria, category_id, variantes';
    const { data, error } = await supabase
      .from('v_productos_catalogo')
      .select(selectFields)
      .limit(1000);
    if (!error && data) {
      const productosData = Array.isArray(data)
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
      setProductos(productosData);
      const ids = productosData.map(p => p.user_id).filter(Boolean);
      if (ids.length) {
        const { data: imgs } = await supabase
          .from('producto_imagenes')
          .select('producto_id, imagen_url')
          .in('producto_id', ids);
        if (Array.isArray(imgs)) setImagenes(agruparImagenes(imgs));
      }
    }
    setLoading(false);
  }, []);

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
          .select('producto_id, id, color, stock, precio, sku');

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
            const { data: matchedProducts } = await supabase
              .from('v_productos_catalogo')
              .select('producto_id, nombre, precio_base, stock_total, codigo_barra, categoria, variantes')
              .in('producto_id', productIds)
              .limit(50);

            if (Array.isArray(matchedProducts)) {
              resultados = (matchedProducts as Array<Record<string, unknown>>).map((p) => {
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
                  stock: Number(matchedVar?.stock ?? p.stock_total ?? 0),
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
        if (term) {
          query = query.or(`nombre.ilike.%${term}%,categoria.ilike.%${term}%`);
        }
        const { data, error } = await query;
        if (error) throw error;
        resultados = Array.isArray(data)
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
      }

      setSearchResults(resultados);
      // cargar imágenes para resultados
      const ids = resultados.map(r => r.user_id).filter(Boolean);
      if (ids.length) {
        const { data: imgs } = await supabase
          .from('producto_imagenes')
          .select('producto_id, imagen_url')
          .in('producto_id', ids);
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
  }, []);

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
