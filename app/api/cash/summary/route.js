import { NextResponse } from "next/server";
import { getSupabaseServerClientFromRequest } from "@/lib/supabaseServer";
import { getCashSummary } from "@/services/cash.service";
import { getUserIdFromRequest } from "@/lib/authUserFromRequest";

export async function GET(request) {
  try {
    const loggedUserId = await getUserIdFromRequest(request);
    if (!loggedUserId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const summary = await getCashSummary(getSupabaseServerClientFromRequest(request), {
      start_date: searchParams.get("start_date"),
      end_date: searchParams.get("end_date"),
      opening_balance: searchParams.get("opening_balance"),
      opening_qr: searchParams.get("opening_qr"),
      cashbox_id: searchParams.get("cashbox_id") || "main",
      sucursal_id: searchParams.get("sucursal_id"),
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to generate cash summary",
      },
      { status: 400 }
    );
  }
}
