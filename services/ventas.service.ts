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
  sucursal_id?: string | null;
  idempotency_key: string;
  pedido_id?: number | string | null;
}) {
  return supabase.rpc('crear_venta_completa', {
    p_venta: payload.venta,
    p_items: payload.items,
    p_pagos: payload.pagos || [],
    p_usuario_id: payload.usuario_id || null,
    p_usuario_email: payload.usuario_email || null,
    p_cashbox_id: payload.cashbox_id || 'main',
    p_sucursal_id: payload.sucursal_id || null,
    p_idempotency_key: payload.idempotency_key,
    p_pedido_id: payload.pedido_id || null,
  });
}

export async function reducirStockCompleto(payload: {
  producto_id: ProductoId; variante_id?: ProductoId | null; cantidad: number;
  unidad?: string | null; motivo: string; usuario_id?: string | null;
  usuario_email?: string | null; sucursal_id?: string | null; correlation_id?: string;
}) {
  return supabase.rpc('reducir_stock_completo', {
    p_producto_id: payload.producto_id, p_variante_id: payload.variante_id || null,
    p_cantidad: payload.cantidad, p_unidad: payload.unidad || null, p_motivo: payload.motivo,
    p_usuario_id: payload.usuario_id || null, p_usuario_email: payload.usuario_email || null,
    p_sucursal_id: payload.sucursal_id || null, p_correlation_id: payload.correlation_id || null,
  });
}

export async function aumentarStockCompleto(payload: {
  producto_id: ProductoId;
  variante_id?: ProductoId | null;
  cantidad: number;
  unidad?: string | null;
  usuario_id?: string | null;
  usuario_email?: string | null;
  sucursal_id?: string | null;
  observaciones?: string | null;
}) {
  return supabase.rpc('aumentar_stock_completo', {
    p_producto_id: payload.producto_id,
    p_variante_id: payload.variante_id || null,
    p_cantidad: payload.cantidad,
    p_unidad: payload.unidad || null,
    p_usuario_id: payload.usuario_id || null,
    p_usuario_email: payload.usuario_email || null,
    p_sucursal_id: payload.sucursal_id || null,
    p_observaciones: payload.observaciones || null,
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
  return {
    data: null,
    error: { message: `descontarStock(${pid}, ${cantidad}) esta bloqueado. Usa crearVentaCompleta para descontar stock con auditoria.` } as ServiceError,
  };
}

export async function establecerStockProducto(pid: ProductoId, stockDecimal: number) {
  return {
    data: null,
    error: { message: `establecerStockProducto(${pid}, ${stockDecimal}) esta bloqueado. Usa aumentarStockCompleto o transferencia con auditoria.` } as ServiceError,
  };
}

export async function descontarStockVariante(varianteId: ProductoId, cantidad: number) {
  return {
    data: null,
    error: { message: `descontarStockVariante(${varianteId}, ${cantidad}) esta bloqueado. Usa crearVentaCompleta para descontar stock con auditoria.` } as ServiceError,
  };
}

export async function establecerStockVariante(varianteId: ProductoId, stockDecimal: number) {
  return {
    data: null,
    error: { message: `establecerStockVariante(${varianteId}, ${stockDecimal}) esta bloqueado. Usa aumentarStockCompleto o transferencia con auditoria.` } as ServiceError,
  };
}

export async function establecerStockLegacyVariante(varianteId: ProductoId, stockLegacy: number) {
  return {
    data: null,
    error: { message: `establecerStockLegacyVariante(${varianteId}, ${stockLegacy}) esta bloqueado. Usa aumentarStockCompleto o transferencia con auditoria.` } as ServiceError,
  };
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
  return supabase.rpc('descartar_pedido_pendiente', { p_pedido_id: id, p_motivo: 'Descartado desde gestión de pedidos' });
}

export async function descartarPedidoPendiente(id: ProductoId, motivo: string) {
  return supabase.rpc('descartar_pedido_pendiente', { p_pedido_id: id, p_motivo: motivo });
}
