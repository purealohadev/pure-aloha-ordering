import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Order History</h1>
      <p><Link href="/dashboard">← Back to Dashboard</Link></p>
      <p><strong>Role:</strong> {profile?.role ?? "unknown"}</p>

      {error ? (
        <pre style={{ color: "red" }}>{JSON.stringify(error, null, 2)}</pre>
      ) : null}

      <div style={{ marginTop: 24, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Order ID</th>
              <th style={th}>Status</th>
              <th style={th}>Created</th>
              <th style={th}>Approved</th>
              <th style={th}>Manager Note</th>
              <th style={th}>Open</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((order) => (
              <tr key={order.id}>
                <td style={td}>{order.id}</td>
                <td style={td}>{order.status}</td>
                <td style={td}>{order.created_at}</td>
                <td style={td}>{order.approved_at ?? "-"}</td>
                <td style={td}>{order.manager_note ?? "-"}</td>
                <td style={td}>
                  <Link href={`/order-history/${order.id}`}>View</Link>
                </td>
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

