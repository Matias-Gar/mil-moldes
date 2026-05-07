"use server";

import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/SupabaseAdminClient";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    const emailNorm = String(email || "").trim().toLowerCase();

    if (!emailNorm) {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("perfiles")
      .select("id")
      .eq("email", emailNorm)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "No se pudo validar el correo" }, { status: 500 });
    }

    return NextResponse.json({ exists: Boolean(data?.id) });
  } catch (error) {
    return NextResponse.json(
      { error: "Error inesperado validando correo", details: String(error) },
      { status: 500 }
    );
  }
}
