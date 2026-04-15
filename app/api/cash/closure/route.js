import { NextResponse } from "next/server";
import { getSupabaseServerClientFromRequest } from "@/lib/supabaseServer";
import { createCashClosure } from "@/services/cash.service";
import { getUserIdFromRequest } from "@/lib/authUserFromRequest";

export async function POST(request) {
  try {
    const loggedUserId = await getUserIdFromRequest(request);
    if (!loggedUserId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const result = await createCashClosure(getSupabaseServerClientFromRequest(request), {
      ...body,
      user_id: loggedUserId,
    });
    const status = result?.updated ? 200 : 201;
    return NextResponse.json({ success: true, data: result }, { status });
  } catch (error) {
    const status = Number(error?.statusCode || 400);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create cash closure",
      },
      { status }
    );
  }
}
