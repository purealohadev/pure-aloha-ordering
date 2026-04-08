import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PageShell from "@/components/PageShell";

export default async function InventoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Inventory</h1>
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

  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      brand_name,
      product_name,
      category,
      distro,
      current_price,
      inventory (
        on_hand,
        par_level,
        last_counted_at
      )
    `)
    .order("brand_name", { ascending: true });

  const rows = (data ?? []).map((row: any) => {
    const inv = row.inventory?.[0];
    const onHand = Number(inv?.on_hand ?? 0);
    const par = Number(inv?.par_level ?? 0);

    const status =
      onHand <= 0 && par > 0
        ? "Out"
        : onHand < par
        ? "Needs Reorder"
        : "Healthy";

    return {
      ...row,
      onHand,
      par,
      status,
    };
  });

  const totalItems = rows.length;
  const reorderCount = rows.filter((row: any) => row.status === "Needs Reorder" || row.status === "Out").length;
  const outCount = rows.filter((row: any) => row.status === "Out").length;

  return (
    <PageShell
      title="Inventory"
      subtitle="Live inventory, par levels, product pricing, and distro assignments."
    >
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          marginBottom: 24,
        }}
      >
        <StatCard label="Products" value={String(totalItems)} />
        <StatCard label="Need Reorder" value={String(reorderCount)} />
        <StatCard label="Out of Stock" value={String(outCount)} />
        <StatCard label="Role" value={profile?.role ?? "unknown"} />
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
          marginTop: 8,
          overflowX: "auto",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th style={th}>Brand</th>
              <th style={th}>Product</th>
              <th style={th}>Category</th>
              <th style={th}>Distro</th>
              <th style={th}>Price</th>
              <th style={th}>On Hand</th>
              <th style={th}>Par</th>
              <th style={th}>Status</th>
              <th style={th}>Last Counted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: any) => (
              <tr key={row.id}>
                <td style={td}>{row.brand_name}</td>
                <td style={td}>{row.product_name}</td>
                <td style={td}>{row.category}</td>
                <td style={td}>{row.distro}</td>
                <td style={td}>${Number(row.current_price ?? 0).toFixed(2)}</td>
                <td style={td}>{row.onHand}</td>
                <td style={td}>{row.par}</td>
                <td style={td}>
                  <span style={getStatusStyle(row.status)}>
                    {row.status}
                  </span>
                </td>
                <td style={td}>{row.inventory?.[0]?.last_counted_at ?? "-"}</td>
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

function getStatusStyle(status: string) {
  if (status === "Out") {
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

  if (status === "Needs Reorder") {
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

