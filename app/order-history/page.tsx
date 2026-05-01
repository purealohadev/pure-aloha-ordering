import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PageShell from "@/components/PageShell";
import { cn } from "@/lib/utils";

function getStatusClass(status: string) {
  if (status === "approved") {
    return "border-green-500/35 bg-green-500/10 text-green-700 dark:text-green-300";
  }

  if (status === "rejected") {
    return "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300";
  }

  return "border-yellow-500/35 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300";
}

export default async function OrderHistoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-screen bg-background p-6 text-foreground">
        <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Order History</h1>
          <p className="mt-2 text-sm text-muted-foreground">Not logged in.</p>
          <Link className="mt-4 inline-flex text-sm font-medium text-blue-600 dark:text-blue-400" href="/login">
            Go to login
          </Link>
        </div>
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
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Role" value={profile?.role ?? "unknown"} />
        <StatCard label="Submitted" value={String(submittedCount)} />
        <StatCard label="Approved" value={String(approvedCount)} />
        <StatCard label="Rejected" value={String(rejectedCount)} />
      </div>

      {error ? (
        <div className="mb-5 rounded-lg border border-red-500/35 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          <pre className="m-0 whitespace-pre-wrap">{JSON.stringify(error, null, 2)}</pre>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className={thClass}>Order ID</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Created</th>
              <th className={thClass}>Approved</th>
              <th className={thClass}>Manager Note</th>
              <th className={thClass}>Open</th>
              <th className={thClass}>Export</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(orders ?? []).map((order) => (
              <tr key={order.id} className="transition hover:bg-muted/40">
                <td className={tdClass}>{order.id}</td>
                <td className={tdClass}>
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2 py-1 text-xs font-bold",
                      getStatusClass(order.status)
                    )}
                  >
                    {order.status}
                  </span>
                </td>
                <td className={tdClass}>{order.created_at}</td>
                <td className={tdClass}>{order.approved_at ?? "-"}</td>
                <td className={tdClass}>{order.manager_note ?? "-"}</td>
                <td className={tdClass}>
                  <Link className="font-medium text-blue-600 hover:underline dark:text-blue-400" href={`/order-history/${order.id}`}>
                    View
                  </Link>
                </td>
                <td className={tdClass}>
                  {order.status === "approved" ? (
                    <a className="font-medium text-blue-600 hover:underline dark:text-blue-400" href={`/api/export-order/${order.id}`}>
                      Export CSV
                    </a>
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
    <div className="rounded-xl border border-border bg-background/60 p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}

const thClass = "border-b border-border px-3 py-3 text-left font-semibold";
const tdClass = "px-3 py-3 text-foreground";
