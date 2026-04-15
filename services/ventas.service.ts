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

export async function insertarVentaDetalle(item: GenericPayload) {
  return supabase.from('ventas_detalle').insert([item]);
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
