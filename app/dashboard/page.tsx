import { createClient } from "@/lib/supabase/server";
import PageShell from "@/components/PageShell";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Dashboard</h1>
        <p>Not logged in.</p>
        <Link href="/login">Go to login</Link>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, email")
    .eq("id", user.id)
    .single();

  const { count: productCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true });

  const { count: poCount } = await supabase
    .from("purchase_orders")
    .select("*", { count: "exact", head: true });

  const { count: submittedCount } = await supabase
    .from("purchase_orders")
    .select("*", { count: "exact", head: true })
    .eq("status", "submitted");

  const { count: approvedCount } = await supabase
    .from("purchase_orders")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved");

  return (
    <PageShell
      title="Dashboard"
      subtitle="Overview of products, purchase orders, and approvals."
    >
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          marginBottom: 24,
        }}
      >
        <InfoCard
          label="Logged In As"
          value={profile?.full_name ?? user.email ?? "Unknown User"}
          subvalue={profile?.role ? `Role: ${profile.role}` : ""}
        />
        <StatCard label="Products" value={String(productCount ?? 0)} />
        <StatCard label="Purchase Orders" value={String(poCount ?? 0)} />
        <StatCard label="Pending Approval" value={String(submittedCount ?? 0)} />
        <StatCard label="Approved Orders" value={String(approvedCount ?? 0)} />
      </div>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        <QuickLinkCard
          title="Inventory"
          description="Review live products, on-hand counts, and par levels."
          href="/inventory"
        />
        <QuickLinkCard
          title="Orders"
          description="Build reorder drafts, submit them, and export by distro."
          href="/orders"
        />
        <QuickLinkCard
          title="Order History"
          description="Review past drafts, approvals, and line-item details."
          href="/order-history"
        />
        {profile?.role === "manager" || profile?.role === "admin" ? (
          <QuickLinkCard
            title="Approvals"
            description="Approve or reject submitted purchase orders."
            href="/approvals"
          />
        ) : null}
        <QuickLinkCard
          title="Product Import"
          description="Load product and menu data without touching inventory counts."
          href="/import"
        />
        <QuickLinkCard
          title="Inventory Import"
          description="Update inventory counts and review unmatched inventory rows."
          href="/inventory-import"
        />
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

function InfoCard({
  label,
  value,
  subvalue,
}: {
  label: string;
  value: string;
  subvalue?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 18,
        background: "#eff6ff",
      }}
    >
      <div style={{ color: "#1d4ed8", fontSize: 14, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>{value}</div>
      {subvalue ? (
        <div style={{ marginTop: 8, color: "#475569", fontSize: 14 }}>{subvalue}</div>
      ) : null}
    </div>
  );
}

function QuickLinkCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 18,
        background: "#fff",
        textDecoration: "none",
        color: "#0f172a",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ color: "#64748b", fontSize: 14 }}>{description}</div>
    </Link>
  );
}
