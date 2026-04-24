import { getSupabaseClient } from '../lib/SupabaseClient';

type GenericPayload = Record<string, unknown>;
type ProductoId = string | number;
type ServiceError = { message: string };

function getVentasSupabaseClient() {
  return getSupabaseClient();
}

export async function insertarVentaPago(pago: GenericPayload) {
  const cleanPago: GenericPayload = { ...pago };
  Object.keys(cleanPago).forEach((k) => {
    if (cleanPago[k] === undefined || cleanPago[k] === null) delete cleanPago[k];
  });
  const supabase = getVentasSupabaseClient();
  return supabase.from('ventas_pagos').insert([cleanPago]);
}

export async function crearVenta(data: GenericPayload) {
  const payload: GenericPayload = { ...data };
  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined) delete payload[k];
  });
  const supabase = getVentasSupabaseClient();
  return supabase.from('ventas').insert([payload]).select().single();
}

export async function insertarVentaDetalle(item: GenericPayload) {
  const cleanItem: GenericPayload = { ...item };
  Object.keys(cleanItem).forEach((k) => {
    if (cleanItem[k] === undefined || cleanItem[k] === null) delete cleanItem[k];
  });
  const supabase = getVentasSupabaseClient();
  return supabase.from('ventas_detalle').insert([cleanItem]);
}

export async function descontarStock(pid: ProductoId, cantidad: number) {
  const supabase = getVentasSupabaseClient();
  const rpcResult = await supabase.rpc('descontar_stock', { pid, cantidad_desc: cantidad });
  if (!rpcResult.error) return rpcResult;

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

export async function guardarCarritoPendiente(payload: GenericPayload) {
  const supabase = getVentasSupabaseClient();
  return supabase.from('carritos_pendientes').insert([payload]);
}

export async function fetchCarritosPendientes() {
  const supabase = getVentasSupabaseClient();
  return supabase
    .from('carritos_pendientes')
    .select('id, cliente_nombre, cliente_telefono, productos, fecha')
    .order('fecha', { ascending: false });
}

export async function eliminarCarritoPendiente(id: ProductoId) {
  const supabase = getVentasSupabaseClient();
  return supabase.from('carritos_pendientes').delete().eq('id', id);
}
