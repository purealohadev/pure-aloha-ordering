import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not logged in." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const lines = body.lines ?? [];

    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { success: false, error: "No order lines provided." },
        { status: 400 }
      );
    }

    const { data: order, error: orderError } = await supabase
      .from("purchase_orders")
      .insert({
        status: "draft",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (orderError) {
      return NextResponse.json(
        { success: false, error: orderError.message },
        { status: 500 }
      );
    }

    const orderLines = lines.map((line: any) => ({
  purchase_order_id: order.id,
  product_id: line.product_id,
  order_qty: Number(line.qty ?? 0),
  unit_price: Number(line.price ?? 0),
}));

    const { error: lineError } = await supabase
      .from("purchase_order_lines")
      .insert(orderLines);

    if (lineError) {
      return NextResponse.json(
        { success: false, error: lineError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      order_id: order.id,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Unknown error." },
      { status: 500 }
    );
  }
}