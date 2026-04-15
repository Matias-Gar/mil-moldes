"use client";
import React from 'react';
import Image from 'next/image';
import { getOptimizedImageUrl } from '@/lib/imageOptimization';

interface Producto {
  user_id: string;
  nombre: string;
  precio: number;
  stock?: number;
  color?: string;
  variante_id?: string | number;
  variantes?: Array<{
    variante_id?: string | number;
    id?: string | number;
    color?: string;
    stock?: number;
    precio?: number;
  }>;
  categorias?: { categori?: string };
}

import type { Pack } from '@/hooks/useCarrito';

interface Props {
  busqueda: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  searchResults: Producto[];
  searchLoading: boolean;
  imagenes: Record<string, string[]>;
  onAdd: (prod: Producto) => void;
  showSuggestions: boolean;
  setShowSuggestions: (b: boolean) => void;
  packResults?: Pack[];
  onAddPack?: (pack: Pack) => void;
}

export default function BuscadorProductos({
  busqueda,
  onChange,
  onSubmit,
  searchResults,
  searchLoading,
  imagenes,
  onAdd,
  showSuggestions,
  setShowSuggestions,
  packResults = [],
  onAddPack
}: Props) {
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(); }} className="flex flex-col sm:flex-row gap-2 mb-4 mt-8">
      <div className="flex-1 relative">
        <input
          className="w-full border border-gray-900 bg-white text-gray-900 rounded px-3 py-2 placeholder-gray-700 focus:border-gray-900 focus:ring focus:ring-gray-900/30"
          placeholder="Escanea o ingresa código de barra / nombre / categoría (Ctrl+B/cmd+B)"
          value={busqueda}
          onChange={e => { onChange(e.target.value); setShowSuggestions(true); }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSubmit();
            }
          }}
          onFocus={() => { setShowSuggestions(true); if (!busqueda.trim()) onSubmit(); }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        />

        {showSuggestions && (
          <ul className="absolute z-50 left-0 right-0 mt-2 bg-white border border-gray-200 rounded shadow max-h-80 overflow-auto">
            {searchLoading && <li className="px-3 py-2 text-sm text-gray-500">Buscando...</li>}

            {/* Mostrar packs primero */}
            {!searchLoading && packResults && packResults.length > 0 && packResults.slice(0, 10).map(pack => (
              <li key={`pack-${pack.id}`} className="px-3 py-2 hover:bg-purple-50 flex items-center justify-between gap-3 border-b border-purple-100">
                <div className="flex items-center gap-3 truncate">
                  <div className="w-10 h-10 bg-purple-100 rounded flex items-center justify-center text-2xl">📦</div>
                  <div className="truncate">
                    <div className="font-bold text-purple-800 text-sm truncate">{pack.nombre}</div>
                    <div className="text-xs text-purple-700">Incluye: {(pack.pack_productos ?? []).map(item => `${item.cantidad}x ${item.productos.nombre}`).join(', ')}</div>
                    <div className="text-xs text-purple-600">Bs {Number(pack.precio_pack).toFixed(2)} <span className="ml-2 text-xs text-purple-500">Pack especial</span></div>
                  </div>
                </div>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); onAddPack && onAddPack(pack); }}
                  className="bg-purple-700 hover:bg-purple-800 text-white px-2 py-1 rounded text-sm font-semibold"
                  title="Agregar pack al carrito"
                >
                  ✓ Agregar pack
                </button>
              </li>
            ))}

            {/* Productos individuales */}
            {!searchLoading && searchResults.slice(0,20).map(p => (
              <li key={p.user_id} className="px-3 py-2 hover:bg-gray-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 truncate">
                  <div className="w-10 h-10 bg-gray-50 rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {imagenes[p.user_id]?.[0] ? (
                      <Image
                        src={getOptimizedImageUrl(imagenes[p.user_id][0], 120, { quality: 94, format: 'origin' })}
                        width={40}
                        height={40}
                        alt="thumb"
                        quality={94}
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="text-gray-300 text-xs">No img</div>
                    )}
                  </div>
                  <div className="truncate">
                    <div className="font-medium text-sm truncate">{p.nombre}</div>
                    <div className="text-xs text-gray-400">{p.categorias?.categori || 'Sin categoría'}</div>
                    <div className="text-xs text-gray-500">Stock: {Number(p.stock || 0)}</div>
                    {p.color && (
                      <div className="text-xs text-green-600 font-semibold">✓ Color preseleccionado: {p.color}</div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <div className="text-sm font-semibold text-gray-700">Bs {Number(p.precio).toFixed(2)}</div>
                  {p.variante_id ? (
                    <button
                      type="button"
                      onMouseDown={e => {
                        e.preventDefault();
                        onAdd({
                          ...p,
                          variante_id: p.variante_id,
                          color: p.color || 'Sin color',
                          precio: Number(p.precio ?? 0),
                          stock: Number(p.stock || 0)
                        });
                        setShowSuggestions(false);
                        onChange('');
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-sm font-semibold"
                      title="Agregar producto con color preseleccionado"
                    >
                      ✓ Agregar
                    </button>
                  ) : Array.isArray(p.variantes) && p.variantes.length > 0 ? (
                    <div className="flex flex-wrap justify-end gap-1 max-w-56">
                      {p.variantes
                        .filter(v => Number(v.stock || 0) > 0)
                        .slice(0, 6)
                        .map((v, idx) => {
                          const variantId = v.variante_id ?? v.id;
                          return (
                            <button
                              key={`${p.user_id}-${String(variantId)}-${idx}`}
                              type="button"
                              onMouseDown={e => {
                                e.preventDefault();
                                onAdd({
                                  ...p,
                                  variante_id: variantId,
                                  color: v.color || 'Sin color',
                                  precio: Number(v.precio ?? p.precio ?? 0),
                                  stock: Number(v.stock || 0)
                                });
                                setShowSuggestions(false);
                                onChange('');
                              }}
                              className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs"
                              title={`Agregar color ${v.color || 'Sin color'}`}
                            >
                              {v.color || 'Color'} ({Number(v.stock || 0)})
                            </button>
                          );
                        })}
                    </div>
                  ) : (
                    <button type="button" onMouseDown={e => { e.preventDefault(); onAdd(p); setShowSuggestions(false); onChange(''); }} className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-sm">Agregar</button>
                  )}
                </div>
              </li>
            ))}

            {!searchLoading && searchResults.length === 0 && (!packResults || packResults.length === 0) && <li className="px-3 py-2 text-sm text-gray-500">No hay coincidencias</li>}
          </ul>
        )}
      </div>
      <button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded font-bold shadow">Agregar</button>
    </form>
  );
}
