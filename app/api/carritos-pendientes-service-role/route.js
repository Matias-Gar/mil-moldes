import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Faltan variables de entorno para Supabase Service Role");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request) {
  try {
    const supabase = getServiceRoleClient();
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Payload invalido" }, { status: 400 });
    }

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
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
