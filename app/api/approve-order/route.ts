import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { order_id } = await request.json();

  const { error } = await supabase
    .from("purchase_orders")
    .update({ status: "approved" })
    .eq("id", order_id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message });
  }

  return NextResponse.json({ success: true });
}