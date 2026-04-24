import { getSupabaseClient } from "./SupabaseClient";

export async function registrarHistorialProducto({
  producto_id,
  accion,
  datos_anteriores,
  datos_nuevos,
  usuario_email
}) {
  const supabase = getSupabaseClient();
  return supabase.from("productos_historial").insert([
    {
      producto_id,
      accion,
      datos_anteriores,
      datos_nuevos,
      usuario_email
    }
  ]);
}
