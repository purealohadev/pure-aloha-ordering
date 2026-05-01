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
      <main className="min-h-screen bg-background p-6 text-foreground">
        <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Order Detail</h1>
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

  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .select("id, created_by, status, manager_note, created_at, approved_at")
    .eq("id", id)
    .single();

  if (orderError || !order) {
    return (
      <PageShell title="Order Detail" subtitle="Order not found.">
        <p>
          <Link className="font-medium text-blue-600 hover:underline dark:text-blue-400" href="/order-history">
            Back to Order History
          </Link>
        </p>
      </PageShell>
    );
  }

  if (profile?.role === "buyer" && order.created_by !== user.id) {
    return (
      <PageShell title="Order Detail" subtitle="You do not have access to this order.">
        <p>
          <Link className="font-medium text-blue-600 hover:underline dark:text-blue-400" href="/order-history">
            Back to Order History
          </Link>
        </p>
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
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/order-history" className={secondaryBtnClass}>
          Back to Order History
        </Link>

        {order.status === "approved" ? (
          <a href={`/api/export-order/${order.id}`} className={primaryBtnClass}>
            Export Approved Order
          </a>
        ) : (
          <span className={disabledBtnClass}>Export available after approval</span>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <InfoCard label="Order ID" value={order.id} />
        <InfoCard label="Status" value={order.status} />
        <InfoCard label="Created" value={order.created_at} />
        <InfoCard label="Approved" value={order.approved_at ?? "-"} />
        <InfoCard label="Total Value" value={`$${totalValue.toFixed(2)}`} />
      </div>

      <div className="mb-5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <strong>Manager Note:</strong> {order.manager_note ?? "-"}
      </div>

      {linesError ? (
        <div className="mb-5 rounded-lg border border-red-500/35 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          <pre className="m-0 whitespace-pre-wrap">{JSON.stringify(linesError, null, 2)}</pre>
        </div>
      ) : null}

      <h2 className={sectionTitleClass}>Line Items</h2>
      <div className={tableWrapClass}>
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className={thClass}>Brand</th>
              <th className={thClass}>Product</th>
              <th className={thClass}>Category</th>
              <th className={thClass}>Distro</th>
              <th className={thClass}>Qty</th>
              <th className={thClass}>Unit Price</th>
              <th className={thClass}>Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(lines ?? []).map((line: any) => (
              <tr key={line.id} className="transition hover:bg-muted/40">
                <td className={tdClass}>{line.products?.brand_name ?? "-"}</td>
                <td className={tdClass}>{line.products?.product_name ?? "-"}</td>
                <td className={tdClass}>{line.products?.category ?? "-"}</td>
                <td className={tdClass}>{line.products?.distro ?? "-"}</td>
                <td className={tdClass}>{line.order_qty}</td>
                <td className={tdClass}>${Number(line.unit_price ?? 0).toFixed(2)}</td>
                <td className={tdClass}>
                  ${(Number(line.order_qty ?? 0) * Number(line.unit_price ?? 0)).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={sectionTitleClass}>Approval History</h2>
      <div className={tableWrapClass}>
        <table className="w-full min-w-[700px] border-collapse text-sm">
          <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className={thClass}>Action</th>
              <th className={thClass}>Note</th>
              <th className={thClass}>When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(history ?? []).map((item) => (
              <tr key={item.id} className="transition hover:bg-muted/40">
                <td className={tdClass}>{item.action}</td>
                <td className={tdClass}>{item.note ?? "-"}</td>
                <td className={tdClass}>{item.created_at}</td>
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
    <div className="rounded-xl border border-border bg-background/60 p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}

const tableWrapClass = "overflow-x-auto rounded-xl border border-border";
const sectionTitleClass = "mb-3 mt-6 text-base font-semibold text-foreground";
const thClass = "border-b border-border px-3 py-3 text-left font-semibold";
const tdClass = "px-3 py-3 text-foreground";
const primaryBtnClass =
  "inline-flex items-center rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90";
const secondaryBtnClass =
  "inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted";
const disabledBtnClass =
  "inline-flex items-center rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium text-muted-foreground";
