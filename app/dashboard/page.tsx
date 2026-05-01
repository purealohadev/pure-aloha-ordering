import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ListChecks,
  ShoppingCart,
  TrendingDown,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  UNKNOWN_DISTRIBUTOR,
  isNonConsumableCategory,
  resolveDistributorBrand,
} from "@/lib/inventory/distributors";
import { createClient } from "@/lib/supabase/server";

const ORDER_DISTRIBUTORS = [
  "KSS",
  "Nabis",
  "Kindhouse",
  "UpNorth",
  "Big Oil",
  "Self Distro",
  "Other",
  UNKNOWN_DISTRIBUTOR,
];

const LOW_STOCK_FALLBACK_THRESHOLD = 5;

type ProductInventory = {
  on_hand: number | string | null;
  par_level: number | string | null;
};

type ProductOrderNeedRecord = {
  id: string;
  brand_name: string | null;
  category: string | null;
  distro: string | null;
  inventory: ProductInventory[] | null;
};

type SuggestedOrderDistributor = {
  name: string;
  itemCount: number;
  suggestedQuantity: number;
};

type RecentOrder = {
  id: string;
  status: string | null;
  created_at: string | null;
  approved_at: string | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-screen bg-background px-6 py-10 text-foreground">
        <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-8 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-3 text-sm text-muted-foreground">You need to sign in to access the ordering dashboard.</p>
          <Button asChild className="mt-6">
            <Link href="/login">Go to login</Link>
          </Button>
        </div>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, email")
    .eq("id", user.id)
    .single();

  const { count: draftCount } = await supabase
    .from("purchase_orders")
    .select("*", { count: "exact", head: true })
    .eq("status", "draft");

  const { count: pendingCount } = await supabase
    .from("purchase_orders")
    .select("*", { count: "exact", head: true })
    .eq("status", "submitted");

  const { count: approvedCount } = await supabase
    .from("purchase_orders")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved");

  const { data: productsForOrdering } = await supabase
    .from("products")
    .select("id, brand_name, category, distro, inventory (on_hand, par_level)");

  const { data: recentOrders } = await supabase
    .from("purchase_orders")
    .select("id, status, created_at, approved_at")
    .order("created_at", { ascending: false })
    .limit(4);

  const role = profile?.role ?? "";
  const canAccessApprovals = role === "manager" || role === "admin";
  const displayName = profile?.full_name ?? profile?.email ?? user.email ?? "Team Member";
  const suggestedOrders = getSuggestedOrderDistributors(
    (productsForOrdering as ProductOrderNeedRecord[] | null) ?? []
  );
  const pendingApprovals = pendingCount ?? 0;
  const approvedOrders = approvedCount ?? 0;
  const drafts = draftCount ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />

      <main className="px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5">
          <section className="flex flex-col gap-3 border-b border-border/70 pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Ordering Command Center
                </h1>
                <Badge variant="outline" className="text-xs">
                  {role ? `Role: ${role}` : "Signed in"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Drafts, approvals, and suggested distributor orders.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{displayName}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/orders">
                  Create / Review Orders
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/order-history">
                  Order History
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <StatusCard
              icon={Clock3}
              label="Draft orders"
              value={formatNumber(drafts)}
              detail="In progress"
            />
            <StatusCard
              icon={ClipboardCheck}
              label="Pending approvals"
              value={formatNumber(pendingApprovals)}
              detail="Submitted"
            />
            <StatusCard
              icon={CheckCircle2}
              label="Approved orders"
              value={formatNumber(approvedOrders)}
              detail="Ready to export"
            />
          </section>

          <section className="grid gap-2 sm:grid-cols-2">
            <ActionButton href="/orders" icon={ShoppingCart} label="Create / Review Orders" />
            <ActionButton href="/order-history" icon={ListChecks} label="Order History" />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="border border-border/80 bg-card/95 shadow-sm">
              <CardHeader className="border-b border-border/70 pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <TrendingDown className="size-4 text-muted-foreground" />
                  Suggested Orders
                </CardTitle>
                <CardDescription className="text-sm">
                  Distributors ranked by inventory items at or below par.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="overflow-hidden rounded-lg border border-border/70">
                  <div className="grid grid-cols-[minmax(0,1fr)_110px_120px_100px] gap-3 border-b border-border/70 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground max-md:hidden">
                    <span>Distributor</span>
                    <span className="text-right">Items</span>
                    <span className="text-right">Suggested qty</span>
                    <span className="text-right">Review</span>
                  </div>
                  <div className="divide-y divide-border/70">
                    {suggestedOrders.map((distributor) => (
                      <SuggestedOrderRow key={distributor.name} distributor={distributor} />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border/80 bg-card/95 shadow-sm">
              <CardHeader className="border-b border-border/70 pb-4">
                <CardTitle className="text-base font-semibold">Approval Queue</CardTitle>
                <CardDescription className="text-sm">
                  Submitted orders waiting for manager review.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-4 py-3">
                  <span className="text-sm text-muted-foreground">Pending approvals</span>
                  <span className="text-2xl font-semibold text-foreground">
                    {formatNumber(pendingApprovals)}
                  </span>
                </div>
                <Button asChild variant={canAccessApprovals ? "default" : "outline"} className="w-full">
                  <Link href={canAccessApprovals ? "/approvals" : "/orders"}>
                    {canAccessApprovals ? "Open Approvals" : "Open Orders"}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </section>

          <Card className="border border-border/80 bg-card/95 shadow-sm">
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="text-base font-semibold">Recent Order Activity</CardTitle>
              <CardDescription className="text-sm">Last few saved purchase orders.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {(recentOrders ?? []).length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-border/70">
                  <div className="grid grid-cols-[minmax(0,1fr)_120px_150px_90px] gap-3 border-b border-border/70 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground max-md:hidden">
                    <span>Order</span>
                    <span>Status</span>
                    <span>Created</span>
                    <span className="text-right">Open</span>
                  </div>
                  <div className="divide-y divide-border/70">
                    {((recentOrders as RecentOrder[] | null) ?? []).map((order) => (
                      <RecentOrderRow key={order.id} order={order} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/80 bg-background/50 px-4 py-5 text-sm text-muted-foreground">
                  No purchase orders yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function StatusCard({
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
    <Card className="border border-border bg-card shadow-sm" size="sm">
      <CardContent className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/50 p-2">
          <Icon className="size-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

function ActionButton({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Button asChild variant="outline" className="h-11 justify-between px-4">
      <Link href={href}>
        <span className="inline-flex items-center gap-2">
          <Icon className="size-4" />
          {label}
        </span>
        <ArrowRight className="size-4 text-muted-foreground" />
      </Link>
    </Button>
  );
}

function SuggestedOrderRow({ distributor }: { distributor: SuggestedOrderDistributor }) {
  const hasNeeds = distributor.itemCount > 0;

  return (
    <div
      className={`grid gap-2 px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_110px_120px_100px] md:items-center ${
        hasNeeds ? "bg-background/55" : "bg-background/25 text-muted-foreground"
      }`}
    >
      <div className="min-w-0">
        <p className={`truncate font-medium ${hasNeeds ? "text-foreground" : "text-muted-foreground"}`}>
          {distributor.name}
        </p>
        <p className="text-xs text-muted-foreground md:hidden">
          {formatNumber(distributor.itemCount)} items · {formatNumber(distributor.suggestedQuantity)} suggested
        </p>
      </div>
      <div className="text-right font-semibold text-foreground max-md:hidden">
        {formatNumber(distributor.itemCount)}
      </div>
      <div className="text-right text-muted-foreground max-md:hidden">
        {formatNumber(distributor.suggestedQuantity)}
      </div>
      <div className="md:text-right">
        <Button asChild variant={hasNeeds ? "outline" : "ghost"} size="sm" disabled={!hasNeeds}>
          <Link href={`/orders?distributor=${encodeURIComponent(distributor.name)}`}>
            Review Order
          </Link>
        </Button>
      </div>
    </div>
  );
}

function RecentOrderRow({ order }: { order: RecentOrder }) {
  return (
    <div className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_120px_150px_90px] md:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{order.id}</p>
        {order.approved_at ? (
          <p className="text-xs text-muted-foreground md:hidden">
            Approved {formatDate(order.approved_at)}
          </p>
        ) : null}
      </div>
      <div>
        <StatusBadge status={order.status} />
      </div>
      <div className="text-sm text-muted-foreground">{formatDate(order.created_at)}</div>
      <div className="md:text-right">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/order-history/${order.id}`}>Open</Link>
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const normalized = (status || "unknown").toLowerCase();
  const className =
    normalized === "approved"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : normalized === "rejected"
        ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
        : normalized === "submitted"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-border bg-muted text-muted-foreground";

  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${className}`}>
      {normalized}
    </span>
  );
}

function getSuggestedOrderDistributors(products: ProductOrderNeedRecord[]) {
  const summaries = new Map<string, SuggestedOrderDistributor>(
    ORDER_DISTRIBUTORS.map((distributor) => [
      distributor,
      {
        name: distributor,
        itemCount: 0,
        suggestedQuantity: 0,
      },
    ])
  );

  for (const product of products) {
    if (isNonConsumableCategory(product.category)) continue;

    const inventory = product.inventory?.[0];
    const currentQuantity = parseQuantity(inventory?.on_hand);
    const par = parseQuantity(inventory?.par_level);
    const suggestedQuantity = Math.max(par - currentQuantity, 0);
    const isAtOrBelowPar = par > 0 && currentQuantity <= par;
    const isLow = currentQuantity > 0 && currentQuantity <= LOW_STOCK_FALLBACK_THRESHOLD;

    if (!isAtOrBelowPar && !isLow && suggestedQuantity <= 0) continue;

    const distributor = getOrderDistributorName(product.brand_name, product.distro);
    const summaryKey = ORDER_DISTRIBUTORS.includes(distributor) ? distributor : "Other";
    const summary = summaries.get(summaryKey);

    if (!summary) continue;

    summary.itemCount += 1;
    summary.suggestedQuantity += suggestedQuantity;
  }

  return Array.from(summaries.values()).sort((a, b) => {
    if (a.itemCount !== b.itemCount) return b.itemCount - a.itemCount;
    if (a.suggestedQuantity !== b.suggestedQuantity) {
      return b.suggestedQuantity - a.suggestedQuantity;
    }

    return ORDER_DISTRIBUTORS.indexOf(a.name) - ORDER_DISTRIBUTORS.indexOf(b.name);
  });
}

function getOrderDistributorName(brandName: string | null, distributorName: string | null) {
  const resolution = resolveDistributorBrand(brandName, distributorName);

  if (
    !distributorName?.trim() &&
    resolution?.match_type === "soft" &&
    resolution.confidence === "medium"
  ) {
    return UNKNOWN_DISTRIBUTOR;
  }

  if (resolution?.review_required) return UNKNOWN_DISTRIBUTOR;

  return resolution?.distributor ?? UNKNOWN_DISTRIBUTOR;
}

function parseQuantity(value: number | string | null | undefined) {
  const quantity = Number(value ?? 0);
  return Number.isFinite(quantity) ? quantity : 0;
}

function formatNumber(value: number | null) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function formatDate(value: string | null) {
  if (!value) return "Not set";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
