export async function insertarVentaPago(pago: GenericPayload) {
  // Limpiar claves undefined o null
  const cleanPago: GenericPayload = { ...pago };
  Object.keys(cleanPago).forEach(k => {
    if (cleanPago[k] === undefined || cleanPago[k] === null) delete cleanPago[k];
  });
  return supabase.from('ventas_pagos').insert([cleanPago]);
}
import { supabase } from '../lib/SupabaseClient';

type GenericPayload = Record<string, unknown>;
type ProductoId = string | number;
type ServiceError = { message: string };

export async function crearVenta(data: GenericPayload) {
  // remove keys undefined to avoid supabase column errors
  const payload: GenericPayload = { ...data };
  Object.keys(payload).forEach(k => {
    if (payload[k] === undefined) delete payload[k];
  });
  return supabase.from('ventas').insert([payload]).select().single();
}

export async function crearVentaCompleta(payload: {
  venta: GenericPayload;
  items: GenericPayload[];
  pagos?: GenericPayload[];
  usuario_id?: string | null;
  usuario_email?: string | null;
  cashbox_id?: string;
}) {
  return supabase.rpc('crear_venta_completa', {
    p_venta: payload.venta,
    p_items: payload.items,
    p_pagos: payload.pagos || [],
    p_usuario_id: payload.usuario_id || null,
    p_usuario_email: payload.usuario_email || null,
    p_cashbox_id: payload.cashbox_id || 'main',
  });
}

export async function eliminarVentaConRestock(payload: {
  venta_id: ProductoId;
  admin_id?: string | null;
  admin_email?: string | null;
  motivo?: string | null;
}) {
  return supabase.rpc('eliminar_venta_con_restock', {
    p_venta_id: payload.venta_id,
    p_admin_id: payload.admin_id || null,
    p_admin_email: payload.admin_email || null,
    p_motivo: payload.motivo || null,
  });
}

export async function insertarVentaDetalle(item: GenericPayload) {
  // Limpiar claves undefined o null
  const cleanItem: GenericPayload = { ...item };
  Object.keys(cleanItem).forEach(k => {
    if (cleanItem[k] === undefined || cleanItem[k] === null) delete cleanItem[k];
  });
  return supabase.from('ventas_detalle').insert([cleanItem]);
}

export async function descontarStock(pid: ProductoId, cantidad: number) {
  const rpcResult = await supabase.rpc('descontar_stock', { pid, cantidad_desc: cantidad });
  if (!rpcResult.error) return rpcResult;

  // Fallback defensivo cuando la RPC no existe o tiene firma ambigua.
  const { data: product, error: fetchError } = await supabase
    .from('productos')
    .select('stock')
    .eq('user_id', pid)
    .maybeSingle();

  if (fetchError) return { data: null, error: fetchError };
  if (!product) return { data: null, error: { message: `Producto no encontrado: ${pid}` } as ServiceError };

  const currentStock = Number(product.stock || 0);
  const nextStock = Math.max(0, currentStock - Number(cantidad || 0));

  const { error: updateError } = await supabase
    .from('productos')
    .update({ stock: nextStock })
    .eq('user_id', pid);

  return { data: null, error: updateError };
}

export async function establecerStockProducto(pid: ProductoId, stockDecimal: number) {
  const nextStock = Math.max(0, Number(stockDecimal || 0));
  const { error: updateError } = await supabase
    .from('productos')
    .update({ stock: nextStock })
    .eq('user_id', pid);

  return { data: null, error: updateError };
}

export async function descontarStockVariante(varianteId: ProductoId, cantidad: number) {
  const { data: variant, error: fetchError } = await supabase
    .from('producto_variantes')
    .select('stock, stock_decimal')
    .eq('id', varianteId)
    .maybeSingle();

  if (fetchError) return { data: null, error: fetchError };
  if (!variant) return { data: null, error: { message: `Variante no encontrada: ${varianteId}` } as ServiceError };

  const currentDecimal = Number((variant as GenericPayload).stock_decimal ?? (variant as GenericPayload).stock ?? 0);
  const nextDecimal = Math.max(0, currentDecimal - Number(cantidad || 0));
  const nextLegacyStock = Math.floor(nextDecimal);

  const { error: updateError } = await supabase
    .from('producto_variantes')
    .update({
      stock_decimal: nextDecimal,
      stock: nextLegacyStock,
    })
    .eq('id', varianteId);

  return { data: null, error: updateError };
}

export async function establecerStockVariante(varianteId: ProductoId, stockDecimal: number) {
  const nextDecimal = Math.max(0, Number(stockDecimal || 0));
  const nextLegacyStock = Math.floor(nextDecimal);

  const { error: updateError } = await supabase
    .from('producto_variantes')
    .update({
      stock_decimal: nextDecimal,
      stock: nextLegacyStock,
    })
    .eq('id', varianteId);

  return { data: null, error: updateError };
}

export async function establecerStockLegacyVariante(varianteId: ProductoId, stockLegacy: number) {
  const nextLegacyStock = Math.max(0, Math.floor(Number(stockLegacy || 0)));

  const { error: updateError } = await supabase
    .from('producto_variantes')
    .update({ stock: nextLegacyStock })
    .eq('id', varianteId);

  return { data: null, error: updateError };
}

export async function guardarCarritoPendiente(payload: GenericPayload) {
  return supabase.from('carritos_pendientes').insert([payload]);
}

export async function fetchCarritosPendientes() {
  return supabase
    .from('carritos_pendientes')
    .select('id, cliente_nombre, cliente_telefono, productos, fecha')
    .order('fecha', { ascending: false });
}

export async function eliminarCarritoPendiente(id: ProductoId) {
  return supabase.from('carritos_pendientes').delete().eq('id', id);
}
