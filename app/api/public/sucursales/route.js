import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/SupabaseAdminClient";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("sucursales")
    .select("id, nombre, slug, direccion, telefono")
    .eq("activa", true)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, sucursales: data || [] });
}
