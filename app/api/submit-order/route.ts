import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("Not logged in");

    const { data: latestDraft, error: draftError } = await supabase
      .from("purchase_orders")
      .select("*")
      .eq("created_by", user.id)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (draftError || !latestDraft) {
      throw new Error("No draft order found");
    }

    const { error: updateError } = await supabase
      .from("purchase_orders")
      .update({ status: "submitted" })
      .eq("id", latestDraft.id);

    if (updateError) throw updateError;

    const { error: historyError } = await supabase
      .from("approval_history")
      .insert({
        purchase_order_id: latestDraft.id,
        action: "submitted",
        actor_id: user.id,
        note: "Submitted for manager approval",
      });

    if (historyError) throw historyError;

    return NextResponse.json({ success: true, order: latestDraft });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}

