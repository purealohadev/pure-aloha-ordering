import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const orderId = body.order_id;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "Missing order ID." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("purchase_orders")
      .update({
        status: "submitted",
      })
      .eq("id", orderId);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Unknown error." },
      { status: 500 }
    );
  }
}