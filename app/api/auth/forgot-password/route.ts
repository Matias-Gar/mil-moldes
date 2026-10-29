import { NextResponse } from "next/server";

// Recovery is handled by GoTrue email links in RecuperarContrasenaForm.
// Never accept a replacement password, email/CI or a legacy code here.
export async function POST() {
  return NextResponse.json(
    { error: "Este metodo de recuperacion fue retirado. Solicita un enlace desde Iniciar sesion.", recoveryUrl: "/login" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
