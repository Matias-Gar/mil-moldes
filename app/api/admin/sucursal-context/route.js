import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/SupabaseAdminClient";
import { getUserIdFromRequest } from "@/lib/authUserFromRequest";

const ADMIN_ROLES = new Set(["admin", "administracion", "vendedor", "almacen"]);

export async function GET(request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("perfiles")
    .select("id, email, nombre, rol")
    .eq("id", userId)
    .single();

  const role = String(profile?.rol || "").toLowerCase();
  if (profileError || !ADMIN_ROLES.has(role)) {
    return NextResponse.json({ success: false, error: "Sin acceso al panel" }, { status: 403 });
  }

  if (role === "admin") {
    const { data, error } = await supabaseAdmin
      .from("sucursales")
      .select("id, nombre, slug, direccion, telefono, activa")
      .eq("activa", true)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

    return NextResponse.json({
      success: true,
      perfil: profile,
      sucursales: data || [],
    });
  }

  const { data, error } = await supabaseAdmin
    .from("usuario_sucursales")
    .select(
      `
        rol,
        activo,
        sucursal:sucursales (
          id,
          nombre,
          slug,
          direccion,
          telefono,
          activa
        )
      `
    )
    .eq("usuario_id", userId)
    .eq("activo", true);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  const sucursales = (data || [])
    .map((row) => ({ ...row.sucursal, rol_sucursal: row.rol }))
    .filter((branch) => branch?.id && branch.activa !== false);

  return NextResponse.json({
    success: true,
    perfil: profile,
    sucursales,
  });
}
