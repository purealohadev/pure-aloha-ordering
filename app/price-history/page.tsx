import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { ArrowLeft, ArrowRight, History, TrendingDown, TrendingUp } from "lucide-react";
import NavBar from "@/components/NavBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

type PriceHistoryRow = {
  id: string;
  sku: string | null;
  brand_name: string | null;
  product_name: string | null;
  distributor: string | null;
  unit_cost: number | string | null;
  previous_unit_cost: number | string | null;
  change_amount: number | string | null;
  change_percent: number | string | null;
  change_direction: string | null;
  imported_at: string | null;
  source: string | null;
};

export default async function PriceHistoryPage() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-screen bg-background px-6 py-10 text-foreground">
        <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-8 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Price History</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            You need to sign in to view pricing history.
          </p>
          <Button asChild className="mt-6">
            <Link href="/login">Go to login</Link>
          </Button>
        </div>
      </main>
    );
  }

  const { data: profile } = await authClient
    .from("profiles")
    .select("full_name, role, email")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "";
  const displayName = profile?.full_name ?? profile?.email ?? user.email ?? "Team Member";
  const supabase = createServiceRoleClient();

  const { data: history, error } = await supabase
    .from("price_history")
    .select(
      "id, sku, brand_name, product_name, distributor, unit_cost, previous_unit_cost, change_amount, change_percent, change_direction, imported_at, source"
    )
    .order("imported_at", { ascending: false })
    .limit(250);

  const rows = (history ?? []) as PriceHistoryRow[];
  const increaseCount = rows.filter((row) => row.change_direction === "increase").length;
  const decreaseCount = rows.filter((row) => row.change_direction === "decrease").length;
  const noChangeCount = rows.filter((row) => row.change_direction === "no_change").length;
  const latestImportedAt = rows[0]?.imported_at ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />

      <main className="px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5">
          <section className="flex flex-col gap-4 border-b border-border/70 pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Price History
                </h1>
                <Badge variant="outline" className="text-xs">
                  {role ? `Role: ${role}` : "Signed in"}
                </Badge>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Review imported price snapshots over time, including prior cost comparisons.
              </p>
              <p className="text-xs text-muted-foreground">{displayName}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard">
                  <ArrowLeft className="size-3.5" />
                  Dashboard
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/price-alerts">
                  Price Alerts
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-4">
            <MetricCard
              icon={History}
              label="Recent Snapshots"
              value={String(rows.length)}
              detail="Latest 250 rows"
            />
            <MetricCard
              icon={TrendingUp}
              label="Price Increases"
              value={String(increaseCount)}
              detail="Change direction: up"
            />
            <MetricCard
              icon={TrendingDown}
              label="Price Decreases"
              value={String(decreaseCount)}
              detail="Change direction: down"
            />
            <MetricCard
              icon={History}
              label="No Change"
              value={String(noChangeCount)}
              detail="Stable imports"
            />
          </section>

          <Card className="border border-border/80 bg-card/95 shadow-sm">
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="text-base font-semibold">Snapshot Log</CardTitle>
              <CardDescription className="text-sm">
                Newest imported cost changes appear first.
                {latestImportedAt ? ` Latest import: ${new Date(latestImportedAt).toLocaleString()}.` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {error ? (
                <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
                  {error.message}
                </div>
              ) : (
                <PriceHistoryTable rows={rows} />
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function PriceHistoryTable({ rows }: { rows: PriceHistoryRow[] }) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-8 text-sm text-muted-foreground">
        No price history has been imported yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-[minmax(0,1.2fr)_120px_180px_120px_120px_120px_120px_120px_140px_180px] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground max-2xl:hidden">
        <span>Product</span>
        <span>SKU</span>
        <span>Distributor</span>
        <span className="text-right">Previous</span>
        <span className="text-right">New</span>
        <span className="text-right">Delta</span>
        <span className="text-right">Percent</span>
        <span className="text-right">Direction</span>
        <span>Imported</span>
        <span>Source</span>
      </div>

      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid gap-3 px-3 py-4 text-sm transition hover:bg-muted/25 max-2xl:grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_120px_180px_120px_120px_120px_120px_120px_140px_180px]"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium text-foreground">{row.brand_name || "Unknown Brand"}</div>
                <DirectionBadge direction={row.change_direction} />
              </div>
              <div className="text-muted-foreground">{row.product_name || "Unknown Product"}</div>
              <div className="text-xs text-muted-foreground xl:hidden">
                SKU {row.sku || "—"} | {row.distributor || "—"}
              </div>
            </div>

            <Cell label="SKU">{row.sku || "—"}</Cell>
            <Cell label="Distributor">{row.distributor || "—"}</Cell>
            <Cell className="text-right" label="Previous">
              {formatMoney(row.previous_unit_cost)}
            </Cell>
            <Cell className="text-right" label="New">
              {formatMoney(row.unit_cost)}
            </Cell>
            <Cell className="text-right" label="Delta">
              {formatDelta(row.change_amount)}
            </Cell>
            <Cell className="text-right" label="Percent">
              {formatPercent(row.change_percent)}
            </Cell>
            <Cell className="text-right" label="Direction">
              <DirectionBadge direction={row.change_direction} />
            </Cell>
            <Cell label="Imported">
              {row.imported_at ? new Date(row.imported_at).toLocaleString() : "—"}
            </Cell>
            <Cell label="Source">{row.source || "—"}</Cell>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="border border-border/80 bg-card/95 shadow-sm">
      <CardContent className="flex items-start justify-between gap-3 pt-4">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
        </div>
        <div className="rounded-full border border-border bg-muted p-2 text-muted-foreground">
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function Cell({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground xl:hidden">{label}</div>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

function DirectionBadge({ direction }: { direction: string | null }) {
  if (direction === "increase") {
    return (
      <Badge variant="outline" className="border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300">
        Up
      </Badge>
    );
  }

  if (direction === "decrease") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      >
        Down
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-border bg-background text-muted-foreground">
      No Change
    </Badge>
  );
}

function formatMoney(value: number | string | null) {
  const numberValue = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numberValue) ? numberValue : 0);
}

function formatDelta(value: number | string | null) {
  const numberValue = Number(value ?? 0);
  const formatted = formatMoney(value);

  return numberValue > 0 ? `+${formatted}` : formatted;
}

function formatPercent(value: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return "—";
  }

  return `${numberValue > 0 ? "+" : ""}${numberValue.toFixed(2)}%`;
}
