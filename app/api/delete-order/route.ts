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
    const orderId = body.order_id;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "Missing order ID." },
        { status: 400 }
      );
    }

    const { data: order, error: orderFetchError } = await supabase
      .from("purchase_orders")
      .select("id, status")
      .eq("id", orderId)
      .single();

    if (orderFetchError || !order) {
      return NextResponse.json(
        { success: false, error: orderFetchError?.message || "Order not found." },
        { status: 404 }
      );
    }

    const { error: lineDeleteError } = await supabase
      .from("purchase_order_lines")
      .delete()
      .eq("purchase_order_id", orderId);

    if (lineDeleteError) {
      return NextResponse.json(
        { success: false, error: lineDeleteError.message },
        { status: 500 }
      );
    }

    const { error: orderDeleteError } = await supabase
      .from("purchase_orders")
      .delete()
      .eq("id", orderId);

    if (orderDeleteError) {
      return NextResponse.json(
        { success: false, error: orderDeleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Unknown error." },
      { status: 500 }
    );
  }
}
