import { NextResponse } from "next/server";
import { getSupabaseServerClientFromRequest } from "@/lib/supabaseServer";
import { listCashClosures } from "@/services/cash.service";
import { getUserIdFromRequest } from "@/lib/authUserFromRequest";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const loggedUserId = await getUserIdFromRequest(request);
    if (!loggedUserId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const closures = await listCashClosures(getSupabaseServerClientFromRequest(request), {
      limit: searchParams.get("limit"),
      cashbox_id: searchParams.get("cashbox_id") || "main",
      sucursal_id: searchParams.get("sucursal_id"),
    });

    return NextResponse.json(
      { success: true, data: closures },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to list cash closures",
      },
      { status: 400 }
    );
  }
}
