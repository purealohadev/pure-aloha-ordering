import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { orderId, note } = await req.json();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("Not logged in");

    const { error: updateError } = await supabase
      .from("purchase_orders")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        manager_note: note ?? null,
      })
      .eq("id", orderId);

    if (updateError) throw updateError;

    const { error: historyError } = await supabase
      .from("approval_history")
      .insert({
        purchase_order_id: orderId,
        action: "approved",
        actor_id: user.id,
        note: note || "Approved by manager",
      });

    if (historyError) throw historyError;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}

