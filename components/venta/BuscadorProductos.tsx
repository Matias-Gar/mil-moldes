"use client";

import React from "react";
import Image from "next/image";
import { getOptimizedImageUrl } from "@/lib/imageOptimization";
import { calcularPrecioConPromocion } from "@/lib/promociones";
import type { Pack, Producto } from "@/hooks/useCarrito";

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
  promociones?: any[];
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
  onAddPack,
  promociones = [],
}: Props) {
  const getEffectiveVariantStock = (v: { stock?: number; stock_decimal?: number }) => {
    const decimal = Number(v.stock_decimal);
    const legacy = Number(v.stock);
    return Math.max(0, Number.isFinite(decimal) && decimal > 0 ? decimal : legacy || 0);
  };

  const formatQuantity = (value: number) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0";
    return Number(num.toFixed(3)).toString();
  };

  const getConversionInfo = (p: Producto) => {
    const stockBase = Math.max(0, Number((p as any).stock ?? 0));
    const factor = Number((p as any).factor_conversion || 0);
    const base = String((p as any).unidad_base || "unidad");
    const alternativas = Array.isArray((p as any).unidades_alternativas)
      ? (p as any).unidades_alternativas.filter((u: string) => u && u !== base)
      : [];
    const alt = alternativas[0];
    const hasConversion = Boolean(alt && Number.isFinite(factor) && factor > 0);
    return { stockBase, factor, base, alternativas, alt, hasConversion };
  };

  const handleAddClick = (p: Producto) => {
    const { stockBase, factor, base, alternativas, alt: unidadAlternativa, hasConversion } = getConversionInfo(p);
    const unidadesBase = Array.isArray((p as any).unidades_disponibles)
      ? (p as any).unidades_disponibles
      : (p as any).unidad_base && (p as any).unidades_alternativas
        ? [
            (p as any).unidad_base,
            ...alternativas,
          ]
        : [(p as any).unidad_base || "unidad"];
    const unidades =
      hasConversion
        ? [
            ...(stockBase >= 1 ? [base] : []),
            ...(stockBase * factor > 0 ? [unidadAlternativa] : []),
          ]
        : unidadesBase;

    const unidadSeleccionada = unidades[0] || base;
    const cantidadBase = unidadSeleccionada === base || !factor || factor <= 0
      ? 1
      : 1 / factor;

    onAdd({
      ...p,
      cantidad: 1,
      cantidad_base: cantidadBase,
      cantidad_display: 1,
      unidad: unidadSeleccionada,
      unidad_base: base,
      unidades_disponibles: unidades,
    });
    setShowSuggestions(false);
    onChange("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="mb-4 mt-8 flex flex-col gap-2 sm:flex-row"
    >
      <div className="relative flex-1">
        <input
          className="w-full rounded border border-gray-900 bg-white px-3 py-2 text-gray-900 placeholder-gray-700 focus:border-gray-900 focus:ring focus:ring-gray-900/30"
          placeholder="Escanea o ingresa código de barra / nombre / categoría (Ctrl+B/cmd+B)"
          value={busqueda}
          onChange={(e) => {
            onChange(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
          onFocus={() => {
            setShowSuggestions(true);
            if (!busqueda.trim()) onSubmit();
          }}
          onBlur={() => {
            setTimeout(() => setShowSuggestions(false), 150);
          }}
        />

        {showSuggestions && (
          <ul className="absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-auto rounded border border-gray-200 bg-white shadow">
            {searchLoading && <li className="px-3 py-2 text-sm text-gray-500">Buscando...</li>}

            {!searchLoading &&
              packResults.length > 0 &&
              packResults.slice(0, 10).map((pack) => (
                <li
                  key={`pack-${pack.id}`}
                  className="flex items-center justify-between gap-3 border-b border-purple-100 px-3 py-2 hover:bg-purple-50"
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-purple-100 text-2xl">
                      📦
                    </div>
                    <div className="truncate">
                      <div className="truncate text-sm font-bold text-purple-800">{pack.nombre}</div>
                      <div className="text-xs text-purple-700">
                        Incluye:{" "}
                        {(pack.pack_productos ?? [])
                          .map((item) => `${item.cantidad}x ${item.productos.nombre}`)
                          .join(", ")}
                      </div>
                      <div className="text-xs text-purple-600">
                        Bs {Number(pack.precio_pack).toFixed(2)}
                        <span className="ml-2 text-xs text-purple-500">Pack especial</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onAddPack && onAddPack(pack);
                    }}
                    className="rounded bg-purple-700 px-2 py-1 text-sm font-semibold text-white hover:bg-purple-800"
                    title="Agregar pack al carrito"
                  >
                    Agregar pack
                  </button>
                </li>
              ))}

            {!searchLoading &&
              searchResults.slice(0, 20).map((p) => {
                const precioInfo = calcularPrecioConPromocion(p, promociones);
                return (
                  <li
                    key={String(p.user_id ?? `tmp-${p.nombre}`)}
                    className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-gray-100"
                  >
                  <div className="flex items-center gap-3 truncate">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-gray-50">
                      {imagenes[String(p.user_id)]?.[0] ? (
                        <Image
                          src={getOptimizedImageUrl(imagenes[String(p.user_id)][0], 120, {
                            quality: 94,
                            format: "origin",
                          })}
                          width={40}
                          height={40}
                          alt="thumb"
                          quality={94}
                          sizes="40px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="text-xs text-gray-300">No img</div>
                      )}
                    </div>
                    <div className="truncate">
                      <div className="truncate text-sm font-medium">{p.nombre}</div>
                      <div className="text-xs text-gray-400">
                        {p.categorias?.categori || "Sin categoría"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {(() => {
                          const stockBase = Number(p.stock || 0);
                          if (
                            Array.isArray((p as any).unidades_alternativas) &&
                            (p as any).unidades_alternativas.length > 0 &&
                            Number((p as any).factor_conversion) > 0 &&
                            (p as Producto).unidad_base
                          ) {
                            const alt = (p as any).unidades_alternativas[0];
                            const stockAlt = stockBase * Number((p as any).factor_conversion);
                            if (stockBase === 0 && stockAlt > 0) {
                              return <span>Stock: {formatQuantity(stockAlt)} {alt}</span>;
                            }
                            if (stockBase > 0) {
                              return (
                                <span>
                                  Stock: {formatQuantity(stockBase)} {(p as Producto).unidad_base} ({formatQuantity(stockAlt)} {alt})
                                </span>
                              );
                            }
                            return <span>Stock: 0</span>;
                          }
                          return <span>Stock: {formatQuantity(stockBase)}</span>;
                        })()}
                      </div>
                      {p.color && (
                        <div className="text-xs font-semibold text-green-600">
                          Color preseleccionado: {p.color}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="text-right text-sm">
                      {precioInfo.tienePromocion && (
                        <div className="text-xs text-gray-800 line-through decoration-gray-800">
                          Bs {precioInfo.precioOriginal.toFixed(2)}
                        </div>
                      )}
                      <div className={`font-bold ${precioInfo.tienePromocion ? 'text-green-600' : 'text-blue-700'}`}>
                        Bs {precioInfo.precioFinal.toFixed(2)}
                      </div>
                      {precioInfo.tienePromocion && (
                        <div className="mt-1 flex items-center justify-end gap-1.5">
                          <span className="rounded-full bg-red-500 px-2 py-1 text-[11px] font-bold leading-none text-gray-950">
                            -{precioInfo.porcentajeDescuento}%
                          </span>
                        </div>
                      )}
                    </div>
                    {p.variante_id ? (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleAddClick({
                            ...p,
                            variante_id: p.variante_id,
                            color: p.color || "Sin color",
                            precio: Number(p.precio ?? 0),
                            stock: Number(p.stock || 0),
                          });
                        }}
                        className="rounded bg-green-600 px-2 py-1 text-sm font-semibold text-white hover:bg-green-700"
                        title="Agregar producto con color preseleccionado"
                      >
                        Agregar
                      </button>
                    ) : Array.isArray(p.variantes) && p.variantes.length > 0 ? (
                      <div className="flex max-w-56 flex-wrap justify-end gap-1">
                        {p.variantes
                          .filter((v) => {
                            const { stockBase, hasConversion } = getConversionInfo(p);
                            return hasConversion ? stockBase > 0 : getEffectiveVariantStock(v) > 0;
                          })
                          .slice(0, 6)
                          .map((v, idx) => {
                            const variantId = v.variante_id ?? v.id;
                            const variantStock = getEffectiveVariantStock(v);
                            const { stockBase, factor, alt, hasConversion } = getConversionInfo(p);
                            const displayStock = hasConversion
                              ? `${formatQuantity(stockBase * factor)} ${alt}`
                              : formatQuantity(variantStock);
                            return (
                              <button
                                key={`${p.user_id}-${String(variantId)}-${idx}`}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleAddClick({
                                    ...p,
                                    variante_id: variantId,
                                    color: v.color || "Sin color",
                                    precio: Number(v.precio ?? p.precio ?? 0),
                                    stock: hasConversion ? stockBase : variantStock,
                                  });
                                }}
                                className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                                title={`Agregar color ${v.color || "Sin color"}`}
                              >
                                {v.color || "Color"} ({displayStock})
                              </button>
                            );
                          })}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleAddClick(p);
                        }}
                        className="rounded bg-green-600 px-2 py-1 text-sm text-white hover:bg-green-700"
                      >
                        Agregar
                      </button>
                    )}
                  </div>
                </li>
                );
              })}

            {!searchLoading && searchResults.length === 0 && packResults.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500">No hay coincidencias</li>
            )}
          </ul>
        )}
      </div>
      <button
        type="submit"
        className="rounded bg-gray-900 px-4 py-2 font-bold text-white shadow hover:bg-gray-800"
      >
        Agregar
      </button>
    </form>
  );
}
