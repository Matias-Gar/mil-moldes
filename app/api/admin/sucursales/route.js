import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/SupabaseAdminClient";
import { getUserIdFromRequest } from "@/lib/authUserFromRequest";

async function requireAdmin(request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return { error: "Unauthorized", status: 401 };
  }

  const { data: profile, error } = await supabaseAdmin
    .from("perfiles")
    .select("rol")
    .eq("id", userId)
    .single();

  if (error || String(profile?.rol || "").toLowerCase() !== "admin") {
    return { error: "Solo el administrador puede modificar sucursales", status: 403 };
  }

  return { userId };
}

function cleanBranchPayload(body) {
  return {
    nombre: String(body?.nombre || "").trim(),
    slug: String(body?.slug || "").trim(),
    direccion: String(body?.direccion || "").trim() || null,
    telefono: String(body?.telefono || "").trim() || null,
    activa: body?.activa !== false,
    updated_at: new Date().toISOString(),
  };
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  const [branchesResult, profilesResult, assignmentsResult] = await Promise.all([
    supabaseAdmin.from("sucursales").select("*").order("created_at", { ascending: true }),
    supabaseAdmin.from("perfiles").select("id, email, nombre, rol").order("email", { ascending: true }),
    supabaseAdmin
      .from("usuario_sucursales")
      .select("id, usuario_id, sucursal_id, rol, activo, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const error = branchesResult.error || profilesResult.error || assignmentsResult.error;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  return NextResponse.json({
    success: true,
    sucursales: branchesResult.data || [],
    perfiles: profilesResult.data || [],
    asignaciones: assignmentsResult.data || [],
  });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  const body = await request.json();
  const action = body?.action || "save_branch";

  if (action === "save_branch") {
    const payload = cleanBranchPayload(body);
    if (!payload.nombre || !payload.slug) {
      return NextResponse.json({ success: false, error: "Nombre y slug son obligatorios" }, { status: 400 });
    }

    const result = body.id
      ? await supabaseAdmin.from("sucursales").update(payload).eq("id", body.id).select("*").single()
      : await supabaseAdmin.from("sucursales").insert([payload]).select("*").single();

    if (result.error) return NextResponse.json({ success: false, error: result.error.message }, { status: 400 });
    return NextResponse.json({ success: true, sucursal: result.data });
  }

  if (action === "toggle_branch") {
    const { id, activa } = body;
    if (!id) return NextResponse.json({ success: false, error: "Sucursal requerida" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("sucursales")
      .update({ activa: activa !== false, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  if (action === "save_assignment") {
    const { usuario_id, sucursal_id, rol } = body;
    if (!usuario_id || !sucursal_id || !rol) {
      return NextResponse.json({ success: false, error: "Usuario, sucursal y rol son obligatorios" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("usuario_sucursales").upsert(
      {
        usuario_id,
        sucursal_id,
        rol,
        activo: true,
      },
      { onConflict: "usuario_id,sucursal_id" }
    );

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  if (action === "toggle_assignment") {
    const { id, activo } = body;
    if (!id) return NextResponse.json({ success: false, error: "Acceso requerido" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("usuario_sucursales")
      .update({ activo: activo !== false })
      .eq("id", id);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: "Accion no soportada" }, { status: 400 });
}
