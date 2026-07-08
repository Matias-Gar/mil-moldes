"use client";
import React from 'react';
import Image from 'next/image';
import { PrecioConPromocion, calcularPrecioConPromocion } from '../../lib/promociones';
import { calcularDescuentoPack } from '../../lib/packs';
import { CartItem, Pack, PackProduct } from '../../hooks/useCarrito';
import { getOptimizedImageUrl } from '../../lib/imageOptimization';
import CantidadConUnidadInput from '../CantidadConUnidadInput';

interface Props {
  carrito: CartItem[];
  imagenes: Record<string, string[]>;
  quitar: (user_id: string | number) => void;
  cambiarCantidad: (user_id: string | number, cant: number) => void;
  cambiarUnidadYCantidad: (user_id: string | number, cantBase: number, unidad?: string, cantidadDisplay?: number) => void;
  subtotal: number;
  totalDescuento: number;
  total: number;
  envio?: number;
  comision?: number;
  publicidad?: number;
  rebajas?: number;
  impuestos?: number;
  totalCobrar?: number;
  modoPago: string;
  pago: number;
  cambio: number;
  packs: Pack[];
  promociones: any[];
}


export default function CarritoPanel({
  carrito,
  imagenes,
  quitar,
  cambiarCantidad,
  cambiarUnidadYCantidad,
  subtotal,
  totalDescuento,
  total,
  envio = 0,
  comision = 0,
  publicidad = 0,
  rebajas = 0,
  impuestos = 0,
  totalCobrar = total,
  packs,
  promociones
}: Props) {
  const getBaseQuantity = (item: CartItem) => Number(item.cantidad_base ?? item.cantidad ?? 0);
  const getDisplayQuantity = (item: CartItem) => Number(item.cantidad_display ?? item.cantidad ?? 0);

  return (
    <div>
      {carrito.length === 0 ? (
        <div className="text-gray-900">No hay productos en el carrito.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm md:text-base bg-white rounded-xl shadow-xl border border-gray-900 text-center">
            <thead>
              <tr className="bg-gray-200 text-gray-900">
                <th className="w-20 p-2">Imagen</th>
                <th className="p-2">Nombre</th>
                <th className="w-48 p-2">Cantidad</th>
                <th className="w-28 p-2">Precio</th>
                <th className="w-28 p-2">Descuento</th>
                <th className="w-28 p-2">Subtotal</th>
                <th className="w-24 p-2">Quitar</th>
              </tr>
            </thead>
            <tbody>
              {carrito.map(item => {
                if (item.tipo === 'pack') {
                  const pack = item.pack_data || packs.find((p) => p.id === item.pack_id);
                  if (!pack) return null;
                  const packKey = item.cart_key || `pack:${String(item.pack_id ?? item.user_id)}`;
                  const { descuentoPorcentaje, descuentoAbsoluto } = calcularDescuentoPack(pack);
                  return (
                    <tr key={packKey} className="bg-purple-50 border-2 border-purple-200">
                      <td className="p-2 text-center align-middle">
                        <div className="h-14 w-14 mx-auto bg-purple-100 rounded-lg border-2 border-purple-300 flex items-center justify-center shadow-sm">
                          <span className="text-2xl">📦</span>
                        </div>
                      </td>
                      <td className="p-2 text-left font-bold text-gray-900">
                        <div className="font-bold text-purple-800">📦 {pack.nombre}</div>
                        <div className="text-xs text-purple-600">{pack.descripcion || 'Pack especial'}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          Incluye: {pack.pack_productos?.map((packItem: PackProduct) =>
                            `${packItem.cantidad}x ${packItem.productos.nombre}`
                          ).join(', ') || 'Productos del pack'}
                        </div>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={1}
                          value={item.cantidad}
                          onChange={e => cambiarCantidad(packKey, Number(e.target.value))}
                          className="w-16 border border-gray-900 rounded px-2 py-1 text-gray-900"
                        />
                      </td>
                      <td className="p-2">
                        <div className="text-center">
                          <div className="line-through text-gray-500 text-sm">Bs {pack.precio_individual?.toFixed(2)}</div>
                          <div className="text-purple-700 font-bold text-lg">Bs {pack.precio_pack?.toFixed(2)}</div>
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="text-center">
                          <div className="text-red-600 font-bold">-Bs {(descuentoAbsoluto * item.cantidad).toFixed(2)}</div>
                          <div className="text-red-600 text-sm font-bold">-{descuentoPorcentaje.toFixed(0)}% PACK</div>
                        </div>
                      </td>
                      <td className="p-2 text-purple-700 font-bold text-lg">
                        Bs {(pack.precio_pack * item.cantidad).toFixed(2)}
                      </td>
                      <td className="p-2">
                        <button onClick={() => quitar(packKey)} className="bg-red-700 hover:bg-red-800 text-white px-3 py-1 rounded font-bold">Quitar</button>
                      </td>
                    </tr>
                  );
                }
                const precioInfo = calcularPrecioConPromocion(item, promociones);
                const itemKey = item.cart_key || `prod:${String(item.user_id)}:${String(item.variante_id ?? 'default')}`;
                // Lógica para imagen: variante > item.imagen_url > imagenes[1] > imagenes[0]
                let imagenUrl = null;
                if (item.variante_id && item.variantes) {
                  const variante = item.variantes.find(v => String(v.id || v.variante_id) === String(item.variante_id));
                  if (variante && variante.imagen_url) imagenUrl = variante.imagen_url;
                }
                if (!imagenUrl && item.imagen_url) imagenUrl = item.imagen_url;
                if (!imagenUrl && imagenes[String(item.user_id)]?.[1]) imagenUrl = imagenes[String(item.user_id)][1];
                if (!imagenUrl && imagenes[String(item.user_id)]?.[0]) imagenUrl = imagenes[String(item.user_id)][0];
                const unidadesDisponibles = Array.isArray(item.unidades_disponibles) && item.unidades_disponibles.length > 0
                  ? item.unidades_disponibles
                  : (item.unidad_base && item.unidades_alternativas)
                    ? [item.unidad_base, ...(item.unidades_alternativas || []).filter((u) => u !== item.unidad_base)]
                    : [item.unidad_base].filter(Boolean);
                const hasUnitConversion = unidadesDisponibles.length > 0 && item.factor_conversion && Number(item.factor_conversion) > 0;
                return (
                  <tr key={itemKey}>
                    <td className="p-2 text-center align-middle">
                      {imagenUrl ? (
                        <Image
                          src={getOptimizedImageUrl(imagenUrl, 120, { quality: 94, format: 'origin' })}
                          alt="img"
                          width={56}
                          height={56}
                          quality={94}
                          sizes="56px"
                          className="object-cover rounded-lg border mx-auto shadow-sm"
                          style={{ maxWidth: '56px', maxHeight: '56px' }}
                        />
                      ) : (
                        <span className="text-gray-400">Sin imagen</span>
                      )}
                    </td>
                    <td className="p-2 text-left font-bold text-gray-900">
                      <div>{item.nombre}</div>
                      {item.color && <div className="text-xs font-semibold text-blue-700">Color: {item.color}</div>}
                    </td>
                    <td className="p-2">
                      {hasUnitConversion ? (
                        <CantidadConUnidadInput
                          unidadBase={item.unidad_base}
                          factorConversion={Number(item.factor_conversion) || 1}
                          initialUnidad={item.unidad || item.unidad_base}
                          initialCantidad={getDisplayQuantity(item)}
                          unidadesDisponibles={unidadesDisponibles}
                          stockBase={Number(item.stock) || 0}
                          onChange={(valorBase: number, unidad: string, cantidad: number) => {
                            cambiarUnidadYCantidad(itemKey, valorBase, unidad, cantidad);
                          }}
                          min={0.01}
                          precision={3}
                        />
                      ) : (
                        <input
                          type="number"
                          min={1}
                          max={Number.isFinite(Number(item.stock)) ? Math.max(1, Number(item.stock)) : undefined}
                          value={getDisplayQuantity(item)}
                          onChange={e => cambiarCantidad(itemKey, Number(e.target.value))}
                          className="w-16 border border-gray-900 rounded px-2 py-1 text-gray-900"
                        />
                      )}
                    </td>
                    <td className="p-2">
                      <PrecioConPromocion
                        producto={item}
                        promociones={promociones}
                        compact={true}
                        className="text-gray-900 font-bold"
                      />
                    </td>
                    <td className="p-2">
                      {precioInfo.tienePromocion ? (
                        <div className="text-center">
                          <div className="text-red-600 font-bold">-Bs {((precioInfo?.descuento||0) * getBaseQuantity(item)).toFixed(2)}</div>

                          <div className="text-red-600 text-sm">-{precioInfo.porcentajeDescuento}%</div>
                          {precioInfo.promocion?.descripcion && (
                            <div className="text-[11px] font-semibold text-red-700">
                              {precioInfo.promocion.descripcion}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="p-2 text-gray-900 font-bold">
                      Bs {(precioInfo.precioFinal * getBaseQuantity(item)).toFixed(2)}
                    </td>
                    <td className="p-2">
                      <button
                        onClick={() => quitar(itemKey)}
                        className="bg-red-700 hover:bg-red-800 text-white px-3 py-1 rounded font-bold"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-4 text-right text-xl font-bold text-gray-900">
            <div>Subtotal: Bs {subtotal.toFixed(2)}</div>
            {totalDescuento > 0 && <div className="text-blue-700">Descuentos: -Bs {totalDescuento.toFixed(2)}</div>}
            {Number(envio) > 0 && <div className="text-blue-700">Envio: +Bs {Number(envio).toFixed(2)}</div>}
            {Number(comision) > 0 && <div className="text-blue-700">Comision: +Bs {Number(comision).toFixed(2)}</div>}
            {Number(impuestos) > 0 && <div className="text-blue-700">Impuestos: +Bs {Number(impuestos).toFixed(2)}</div>}
            {Number(publicidad) > 0 && <div className="text-blue-700">Publicidad: -Bs {Number(publicidad).toFixed(2)}</div>}
            {Number(rebajas) > 0 && <div className="text-blue-700">Rebajas: -Bs {Number(rebajas).toFixed(2)}</div>}
            <div className="text-2xl">Total a cobrar: Bs {Number(totalCobrar).toFixed(2)}</div>
          </div>
          {!carrito.length && null}
        </div>
      )}
    </div>
  );
}
