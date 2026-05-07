import { useState, useEffect } from 'react';
import { supabase } from './SupabaseClient';

// Hook para obtener packs activos
export const usePacks = (sucursalId = null) => {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const obtenerPacks = async () => {
      try {
        setLoading(true);
        

        let query = supabase
          .from('packs')
          .select(`
            *,
            pack_productos (
              cantidad,
              variante_id,
              productos!pack_productos_producto_id_fkey (
                user_id,
                nombre,
                precio,
                categoria,
                stock,
                producto_variantes (
                  id,
                  color,
                  stock,
                  precio,
                  sku,
                  imagen_url,
                  activo
                )
              )
            )
          `)
          .eq('activo', true)
          .order('created_at', { ascending: false });
        if (sucursalId) query = query.eq('sucursal_id', sucursalId);
        const { data, error } = await query;

        if (error) {
          // Mostrar el error real de Supabase
          // console.error('Error al obtener packs:', error?.message || error);
          setError(error);
          return;
        }

        // No filtrar por stock, mostrar todos los packs activos
        setPacks(data || []);
      } catch (err) {
        // console.error('Error:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    obtenerPacks();

    // Suscribirse a cambios en packs (asegura que no se creen múltiples canales con el mismo nombre)
    let channel = supabase.getChannels().find(c => c.topic === 'realtime:packs_changes');
    if (!channel) {
      channel = supabase
        .channel('packs_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'packs' }, obtenerPacks)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pack_productos' }, obtenerPacks);
      channel.subscribe();
    }

    return () => {
      if (channel) channel.unsubscribe();
    };
  }, [sucursalId]);

  return { packs, loading, error };
};

// Función para calcular si un producto está en algún pack
export const buscarPacksDelProducto = (productoId, packs) => {
  return packs.filter(pack => 
    pack.pack_productos.some(item => item.productos.user_id === productoId)
  );
};

// Función para calcular precio de pack vs precio individual
export const calcularDescuentoPack = (pack) => {
  const precioIndividual = pack.pack_productos.reduce((total, item) => {
    return total + (item.productos.precio * item.cantidad);
  }, 0);
  
  const descuentoAbsoluto = precioIndividual - pack.precio_pack;
  const descuentoPorcentaje = precioIndividual > 0 ? (descuentoAbsoluto / precioIndividual) * 100 : 0;
  
  return {
    precioIndividual,
    precioPackActual: pack.precio_pack,
    descuentoAbsoluto,
    descuentoPorcentaje
  };
};

// Componente para mostrar packs disponibles de un producto
export const PacksDisponibles = ({ productoId, packs: packsExternos }) => {
  const { packs: packsFromHook } = usePacks();
  const packs = packsExternos || packsFromHook;
  
  const packsDelProducto = buscarPacksDelProducto(productoId, packs);
  
  if (packsDelProducto.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2">
      {packsDelProducto.map((pack) => {
        const { descuentoPorcentaje } = calcularDescuentoPack(pack);
        
        return (
          <div key={pack.id} className="bg-purple-100 border border-purple-300 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-purple-800">
                  📦 {pack.nombre}
                </div>
                <div className="text-sm text-purple-700">
                  {pack.pack_productos.length} productos - {descuentoPorcentaje.toFixed(1)}% OFF
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-purple-800">
                  Bs {pack.precio_pack}
                </div>
                <div className="text-xs text-purple-600">
                  Pack especial
                </div>
              </div>
            </div>
            
            {pack.descripcion && (
              <div className="text-sm text-purple-700 mt-2">
                {pack.descripcion}
              </div>
            )}
            
            {/* Mostrar productos del pack */}
            <div className="mt-2 text-xs text-purple-600">
              Incluye: {pack.pack_productos.map(item => 
                `${item.cantidad}x ${item.productos.nombre}`
              ).join(', ')}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Componente integrado que muestra promociones Y packs
export const PrecioConPromocionYPacks = ({ producto, promociones: promocionesExistentes }) => {
  const { packs } = usePacks();
  
  // Importar dinámicamente para evitar problemas de ESLint
  const [PrecioConPromocion, setPrecioConPromocion] = useState(null);
  
  useEffect(() => {
    import('./promociones').then(module => {
      setPrecioConPromocion(() => module.PrecioConPromocion);
    });
  }, []);
  
  if (!PrecioConPromocion) {
    return <div>Cargando...</div>;
  }
  
  return (
    <div>
      {/* Precio con promociones normales */}
      <PrecioConPromocion 
        producto={producto} 
        promociones={promocionesExistentes} 
      />
      
      {/* Packs disponibles */}
      <PacksDisponibles 
        productoId={producto.user_id} 
        packs={packs} 
      />
    </div>
  );
};

const packsModule = {
  usePacks,
  buscarPacksDelProducto,
  calcularDescuentoPack,
  PacksDisponibles,
  PrecioConPromocionYPacks
};

export default packsModule;
