import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PageShell from "@/components/PageShell";

function getStatusStyle(status: string) {
  if (status === "approved") {
    return {
      background: "#dcfce7",
      color: "#166534",
      padding: "4px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      display: "inline-block",
    };
  }

  if (status === "rejected") {
    return {
      background: "#fee2e2",
      color: "#991b1b",
      padding: "4px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      display: "inline-block",
    };
  }

  return {
    background: "#fef3c7",
    color: "#92400e",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    display: "inline-block",
  };
}

export default async function OrderHistoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Order History</h1>
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

  let query = supabase
    .from("purchase_orders")
    .select("id, created_by, status, manager_note, created_at, approved_at")
    .order("created_at", { ascending: false });

  if (profile?.role === "buyer") {
    query = query.eq("created_by", user.id);
  }

  const { data: orders, error } = await query;

  const approvedCount = (orders ?? []).filter((o) => o.status === "approved").length;
  const submittedCount = (orders ?? []).filter((o) => o.status === "submitted").length;
  const rejectedCount = (orders ?? []).filter((o) => o.status === "rejected").length;

  return (
    <PageShell
      title="Order History"
      subtitle="Review all saved orders, statuses, timestamps, and approved exports."
    >
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          marginBottom: 24,
        }}
      >
        <StatCard label="Role" value={profile?.role ?? "unknown"} />
        <StatCard label="Submitted" value={String(submittedCount)} />
        <StatCard label="Approved" value={String(approvedCount)} />
        <StatCard label="Rejected" value={String(rejectedCount)} />
      </div>

      {error ? (
        <div
          style={{
            marginBottom: 18,
            padding: 12,
            borderRadius: 10,
            background: "#fee2e2",
            border: "1px solid #fecaca",
            color: "#991b1b",
          }}
        >
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(error, null, 2)}
          </pre>
        </div>
      ) : null}

      <div
        style={{
          overflowX: "auto",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th style={th}>Order ID</th>
              <th style={th}>Status</th>
              <th style={th}>Created</th>
              <th style={th}>Approved</th>
              <th style={th}>Manager Note</th>
              <th style={th}>Open</th>
              <th style={th}>Export</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((order) => (
              <tr key={order.id}>
                <td style={td}>{order.id}</td>
                <td style={td}>
                  <span style={getStatusStyle(order.status)}>
                    {order.status}
                  </span>
                </td>
                <td style={td}>{order.created_at}</td>
                <td style={td}>{order.approved_at ?? "-"}</td>
                <td style={td}>{order.manager_note ?? "-"}</td>
                <td style={td}>
                  <Link href={`/order-history/${order.id}`}>View</Link>
                </td>
                <td style={td}>
                  {order.status === "approved" ? (
                    <a href={`/api/export-order/${order.id}`}>Export CSV</a>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
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
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 8 }}>{value}</div>
    </div>
  );
}

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

