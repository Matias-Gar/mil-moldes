import { supabase } from "./SupabaseClient";

export async function registrarMovimientoStock({
  producto_id,
  variante_id = null,
  tipo,
  cantidad,
  unidad = null,
  cantidad_base = null,
  sucursal_id = null,
  usuario_id,
  usuario_email,
  observaciones = ""
}) {
  // Validación defensiva y log
  if (!producto_id || !tipo || cantidad === undefined || cantidad === null || isNaN(Number(cantidad))) {
    console.error('Movimiento de stock inválido:', { producto_id, variante_id, tipo, cantidad, usuario_id, usuario_email, observaciones });
    throw new Error('Datos inválidos para registrar movimiento de stock');
  }
  return supabase.from("stock_movimientos").insert([
    {
      producto_id,
      variante_id,
      tipo,
      cantidad: Number(cantidad),
      unidad,
      cantidad_base: cantidad_base == null ? Number(cantidad) : Number(cantidad_base),
      sucursal_id,
      usuario_id,
      usuario_email,
      observaciones
    }
  ]);
}
