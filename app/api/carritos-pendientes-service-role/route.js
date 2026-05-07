import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Usa la Service Role Key SOLO en el backend
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Faltan variables de entorno para Supabase Service Role");
}

export async function POST(request) {
  try {
    const body = await request.json();
    // Valida el payload mínimamente
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Payload inválido" }, { status: 400 });
    }

    // Crea el cliente con la Service Role Key
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Inserta en carritos_pendientes
    const { data, error } = await supabase
      .from("carritos_pendientes")
      .insert([body])
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
