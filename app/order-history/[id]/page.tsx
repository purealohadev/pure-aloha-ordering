import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Order Detail</h1>
        <p>Not logged in.</p>
        <Link href="/login">Go to login</Link>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .select("id, created_by, status, manager_note, created_at, approved_at")
    .eq("id", id)
    .single();

  if (orderError || !order) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <h1>Order Detail</h1>
        <p>Order not found.</p>
        <p><Link href="/order-history">← Back to Order History</Link></p>
      </main>
    );
  }

  if (profile?.role === "buyer" && order.created_by !== user.id) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <h1>Order Detail</h1>
        <p>You do not have access to this order.</p>
        <p><Link href="/order-history">← Back to Order History</Link></p>
      </main>
    );
  }

  const { data: lines, error: linesError } = await supabase
    .from("purchase_order_lines")
    .select(`
      id,
      order_qty,
      unit_price,
      product_id,
      products (
        brand_name,
        product_name,
        category,
        distro
      )
    `)
    .eq("purchase_order_id", id);

  const { data: history } = await supabase
    .from("approval_history")
    .select("id, action, note, created_at")
    .eq("purchase_order_id", id)
    .order("created_at", { ascending: false });

  const totalValue = (lines ?? []).reduce((sum: number, line: any) => {
    return sum + Number(line.order_qty ?? 0) * Number(line.unit_price ?? 0);
  }, 0);

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Order Detail</h1>
      <p><Link href="/order-history">← Back to Order History</Link></p>

      <div style={{ marginTop: 16 }}>
        <p><strong>Order ID:</strong> {order.id}</p>
        <p><strong>Status:</strong> {order.status}</p>
        <p><strong>Created:</strong> {order.created_at}</p>
        <p><strong>Approved:</strong> {order.approved_at ?? "-"}</p>
        <p><strong>Manager Note:</strong> {order.manager_note ?? "-"}</p>
        <p><strong>Total Value:</strong> ${totalValue.toFixed(2)}</p>
      </div>

      {linesError ? (
        <pre style={{ color: "red" }}>{JSON.stringify(linesError, null, 2)}</pre>
      ) : null}

      <h2 style={{ marginTop: 24 }}>Line Items</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Brand</th>
              <th style={th}>Product</th>
              <th style={th}>Category</th>
              <th style={th}>Distro</th>
              <th style={th}>Qty</th>
              <th style={th}>Unit Price</th>
              <th style={th}>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((line: any) => (
              <tr key={line.id}>
                <td style={td}>{line.products?.brand_name ?? "-"}</td>
                <td style={td}>{line.products?.product_name ?? "-"}</td>
                <td style={td}>{line.products?.category ?? "-"}</td>
                <td style={td}>{line.products?.distro ?? "-"}</td>
                <td style={td}>{line.order_qty}</td>
                <td style={td}>${Number(line.unit_price ?? 0).toFixed(2)}</td>
                <td style={td}>
                  ${(Number(line.order_qty ?? 0) * Number(line.unit_price ?? 0)).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 24 }}>Approval History</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Action</th>
              <th style={th}>Note</th>
              <th style={th}>When</th>
            </tr>
          </thead>
          <tbody>
            {(history ?? []).map((item) => (
              <tr key={item.id}>
                <td style={td}>{item.action}</td>
                <td style={td}>{item.note ?? "-"}</td>
                <td style={td}>{item.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const th = {
  borderBottom: "1px solid #ddd",
  textAlign: "left" as const,
  padding: "10px",
};

const td = {
  borderBottom: "1px solid #eee",
  padding: "10px",
};

