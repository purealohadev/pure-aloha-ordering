import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PageShell from "@/components/PageShell";

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
      <PageShell title="Order Detail" subtitle="Order not found.">
        <p><Link href="/order-history">← Back to Order History</Link></p>
      </PageShell>
    );
  }

  if (profile?.role === "buyer" && order.created_by !== user.id) {
    return (
      <PageShell title="Order Detail" subtitle="You do not have access to this order.">
        <p><Link href="/order-history">← Back to Order History</Link></p>
      </PageShell>
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
    <PageShell
      title="Order Detail"
      subtitle="Review line items, status, approval history, and export approved orders."
    >
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Link href="/order-history" style={secondaryBtn}>
          ← Back to Order History
        </Link>

        {order.status === "approved" ? (
          <a
            href={`/api/export-order/${order.id}`}
            style={primaryBtn}
          >
            Export Approved Order
          </a>
        ) : (
          <span style={disabledBtn}>Export available after approval</span>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          marginBottom: 24,
        }}
      >
        <InfoCard label="Order ID" value={order.id} />
        <InfoCard label="Status" value={order.status} />
        <InfoCard label="Created" value={order.created_at} />
        <InfoCard label="Approved" value={order.approved_at ?? "-"} />
        <InfoCard label="Total Value" value={`$${totalValue.toFixed(2)}`} />
      </div>

      <div style={noteCard}>
        <strong>Manager Note:</strong> {order.manager_note ?? "-"}
      </div>

      {linesError ? (
        <div style={errorBox}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(linesError, null, 2)}
          </pre>
        </div>
      ) : null}

      <h2 style={sectionTitle}>Line Items</h2>
      <div style={tableWrap}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
          <thead style={{ background: "#f8fafc" }}>
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

      <h2 style={sectionTitle}>Approval History</h2>
      <div style={tableWrap}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
          <thead style={{ background: "#f8fafc" }}>
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
    </PageShell>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 18,
        background: "#f8fafc",
      }}
    >
      <div style={{ color: "#64748b", fontSize: 14 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>{value}</div>
    </div>
  );
}

const tableWrap = {
  overflowX: "auto" as const,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
};

const sectionTitle = {
  marginTop: 24,
  marginBottom: 12,
};

const noteCard = {
  marginBottom: 18,
  padding: 12,
  borderRadius: 10,
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
};

const errorBox = {
  marginBottom: 18,
  padding: 12,
  borderRadius: 10,
  background: "#fee2e2",
  border: "1px solid #fecaca",
  color: "#991b1b",
};

const th = {
  borderBottom: "1px solid #ddd",
  textAlign: "left" as const,
  padding: "12px 10px",
  fontSize: 14,
};

const td = {
  borderBottom: "1px solid #eee",
  padding: "10px",
  fontSize: 14,
};

const primaryBtn = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #0f172a",
  background: "#0f172a",
  color: "#fff",
  textDecoration: "none",
};

const secondaryBtn = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  textDecoration: "none",
};

const disabledBtn = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
  color: "#64748b",
};

