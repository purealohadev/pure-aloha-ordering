import { createClient } from "@/lib/supabase/server";

function csvEscape(value: unknown) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Not logged in", { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .select("id, created_by, status, created_at, approved_at, manager_note")
    .eq("id", id)
    .single();

  if (orderError || !order) {
    return new Response("Order not found", { status: 404 });
  }

  if (profile?.role === "buyer" && order.created_by !== user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  if (order.status !== "approved") {
    return new Response("Only approved orders can be exported", { status: 400 });
  }

  const { data: lines, error: linesError } = await supabase
    .from("purchase_order_lines")
    .select(`
      id,
      order_qty,
      unit_price,
      products (
        brand_name,
        product_name,
        category,
        distro
      )
    `)
    .eq("purchase_order_id", id);

  if (linesError) {
    return new Response(linesError.message, { status: 500 });
  }

  const headers = [
    "order_id",
    "status",
    "created_at",
    "approved_at",
    "manager_note",
    "brand_name",
    "product_name",
    "category",
    "distro",
    "order_qty",
    "unit_price",
    "line_total",
  ];

  const rows = (lines ?? []).map((line: any) => [
    order.id,
    order.status,
    order.created_at,
    order.approved_at ?? "",
    order.manager_note ?? "",
    line.products?.brand_name ?? "",
    line.products?.product_name ?? "",
    line.products?.category ?? "",
    line.products?.distro ?? "",
    line.order_qty ?? 0,
    Number(line.unit_price ?? 0).toFixed(2),
    (Number(line.order_qty ?? 0) * Number(line.unit_price ?? 0)).toFixed(2),
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="approved-order-${order.id}.csv"`,
    },
  });
}

