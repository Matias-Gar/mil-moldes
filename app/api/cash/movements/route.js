import { NextResponse } from "next/server";
import { getSupabaseServerClientFromRequest } from "@/lib/supabaseServer";
import { createCashMovement, listCashMovements, deleteCashMovement } from "@/services/cash.service";
import { getUserIdFromRequest } from "@/lib/authUserFromRequest";

export async function GET(request) {
  try {
    const loggedUserId = await getUserIdFromRequest(request);
    if (!loggedUserId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const movements = await listCashMovements(getSupabaseServerClientFromRequest(request), {
      start_date: searchParams.get("start_date"),
      end_date: searchParams.get("end_date"),
      limit: searchParams.get("limit"),
      cashbox_id: searchParams.get("cashbox_id") || "main",
      sucursal_id: searchParams.get("sucursal_id"),
    });

    return NextResponse.json({ success: true, data: movements });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to list cash movements",
      },
      { status: 400 }
    );
  }
}

export async function POST(request) {
  try {
    const loggedUserId = await getUserIdFromRequest(request);
    if (!loggedUserId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const movement = await createCashMovement(getSupabaseServerClientFromRequest(request), {
      ...body,
      user_id: loggedUserId,
    });
    return NextResponse.json({ success: true, data: movement }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create cash movement",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request) {
  try {
    const loggedUserId = await getUserIdFromRequest(request);
    if (!loggedUserId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const movementId = searchParams.get("id");
    
    if (!movementId) {
      return NextResponse.json(
        { success: false, error: "Movement ID is required" },
        { status: 400 }
      );
    }

    await deleteCashMovement(getSupabaseServerClientFromRequest(request), movementId);
    return NextResponse.json({ success: true, message: "Movement deleted successfully" });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to delete cash movement",
      },
      { status: 400 }
    );
  }
}

export async function PATCH(request) {
  try {
    const loggedUserId = await getUserIdFromRequest(request);
    if (!loggedUserId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, date, type, payment_method, amount, description, sucursal_id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Movement ID is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClientFromRequest(request);
    let query = supabase
      .from("cash_movements")
      .update({
        date: date || null,
        type: type || null,
        payment_method: payment_method || null,
        amount: amount ? Number(amount) : null,
        description: description || null,
      })
      .eq("id", id);
    if (sucursal_id) query = query.eq("sucursal_id", sucursal_id);
    const { error } = await query;

    if (error) {
      throw new Error(error.message || "Failed to update movement");
    }

    return NextResponse.json({ success: true, message: "Movement updated successfully" });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to update cash movement",
      },
      { status: 400 }
    );
  }
}
