import { supabase } from "./SupabaseClient";

export async function registrarMovimientoStock({
  producto_id,
  tipo,
  cantidad,
  usuario_id,
  usuario_email,
  observaciones = ""
}) {
  return supabase.from("stock_movimientos").insert([
    {
      producto_id,
      tipo,
      cantidad,
      usuario_id,
      usuario_email,
      observaciones
    }
  ]);
}
