import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const { lines } = body;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("Not logged in");

    const { data: po, error: poError } = await supabase
      .from("purchase_orders")
      .insert({
        created_by: user.id,
        status: "draft",
      })
      .select()
      .single();

    if (poError) throw poError;

    const rows = lines.map((line: any) => ({
      purchase_order_id: po.id,
      product_id: line.product_id,
      order_qty: line.qty,
      unit_price: line.price,
    }));

    const { error: linesError } = await supabase
      .from("purchase_order_lines")
      .insert(rows);

    if (linesError) throw linesError;

    return NextResponse.json({ success: true, po });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}

