import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  ClipboardCheck,
  FileSpreadsheet,
  PackageSearch,
  RefreshCcw,
  Sparkles,
  TriangleAlert,
  Warehouse,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="dark min-h-screen bg-zinc-900 px-6 py-10 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-3 text-sm text-muted-foreground">You need to sign in to access the ordering home screen.</p>
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

  const role = profile?.role ?? "";
  const canAccessApprovals = role === "manager" || role === "admin";
  const displayName = profile?.full_name ?? profile?.email ?? user.email ?? "Team Member";

  return (
    <div className="dark min-h-screen bg-zinc-900 text-white">
      <NavBar />

      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8">
          <section className="rounded-[1.75rem] border border-border/80 bg-card/85 p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center rounded-full border border-border/80 bg-background/80 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  Quick Navigation
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">
                    Keep the import workflow visible from home
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    The top navigation stays active on every screen, and these shortcuts open each import tool directly from the dashboard.
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
                <div className="rounded-2xl border border-foreground bg-foreground px-4 py-3 text-background shadow-lg shadow-foreground/10">
                  <div className="text-sm font-semibold">Dashboard</div>
                  <div className="text-xs text-background/80">You are here</div>
                </div>
                <Button asChild variant="outline" className="h-auto justify-between rounded-2xl px-4 py-3">
                  <Link href="/import">
                    <span className="text-left">
                      <span className="block text-sm font-semibold">Product Import</span>
                      <span className="block text-xs text-muted-foreground">Open step one</span>
                    </span>
                    <FileSpreadsheet className="size-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-auto justify-between rounded-2xl px-4 py-3">
                  <Link href="/inventory-import">
                    <span className="text-left">
                      <span className="block text-sm font-semibold">Inventory Import</span>
                      <span className="block text-xs text-muted-foreground">Open step two</span>
                    </span>
                    <Warehouse className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[2rem] border border-border/80 bg-card/90 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
            <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:px-10 lg:py-10">
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="rounded-full bg-foreground px-3 py-1 text-[11px] tracking-[0.08em] text-background uppercase">
                    Main Home
                  </Badge>
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                    {role ? `Role: ${role}` : "Signed in"}
                  </Badge>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Welcome back, {displayName}</p>
                    <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                      Ordering Home Screen
                    </h1>
                  </div>
                  <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                    Start imports, monitor ordering activity, and keep the product-to-inventory workflow in the right order from one place.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button asChild size="lg" className="rounded-full px-5">
                    <Link href="/import">
                      Open Product Import
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="rounded-full px-5">
                    <Link href="/inventory-import">
                      Open Inventory Import
                      <RefreshCcw className="size-4" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="ghost" className="rounded-full px-5">
                    <Link href="/orders">
                      Review Orders
                      <ClipboardCheck className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                <HeroMetric
                  label="Products loaded"
                  value={formatNumber(productCount)}
                  detail="Current catalog rows available before the next import."
                />
                <HeroMetric
                  label="Orders in system"
                  value={formatNumber(poCount)}
                  detail="Draft, submitted, and approved purchase orders."
                />
                <HeroMetric
                  label={canAccessApprovals ? "Needs approval" : "Approved orders"}
                  value={formatNumber(canAccessApprovals ? submittedCount : approvedCount)}
                  detail={
                    canAccessApprovals
                      ? "Submitted orders waiting for manager review."
                      : "Approved orders available in history."
                  }
                />
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <ActionCard
              href="/import"
              icon={FileSpreadsheet}
              eyebrow="Start here"
              title="Product Import"
              description="Refresh product, menu, and SKU data before any inventory updates."
              summary={`${formatNumber(productCount)} products currently loaded`}
              cta="Open Product Import"
            />
            <ActionCard
              href="/inventory-import"
              icon={Warehouse}
              eyebrow="Step two"
              title="Inventory Import"
              description="Update on-hand quantities after the product catalog is current."
              summary="Includes unmatched row review and follow-up tools"
              cta="Open Inventory Import"
            />
            <ActionCard
              href="/orders"
              icon={canAccessApprovals ? ClipboardCheck : Boxes}
              eyebrow={canAccessApprovals ? "Orders and approvals" : "Ordering"}
              title={canAccessApprovals ? "Orders & Approvals" : "Orders Workspace"}
              description={
                canAccessApprovals
                  ? "Build orders, then switch into approvals when submitted POs need review."
                  : "Create draft orders, submit them, and review history from the ordering workspace."
              }
              summary={
                canAccessApprovals
                  ? `${formatNumber(submittedCount)} submitted orders are waiting for approval`
                  : `${formatNumber(poCount)} purchase orders are available in the system`
              }
              cta="Open Orders"
              secondaryHref={canAccessApprovals ? "/approvals" : undefined}
              secondaryLabel={canAccessApprovals ? "Go to Approvals" : undefined}
            />
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              icon={FileSpreadsheet}
              title="Product Import"
              value={formatNumber(productCount)}
              detail="Refresh products first whenever vendor files change so inventory rows have a clean catalog to match against."
            />
            <SummaryCard
              icon={RefreshCcw}
              title="Inventory Import"
              value="Step 2"
              detail="Run inventory after products to update counts and carry the latest SKU mapping into the import flow."
            />
            <SummaryCard
              icon={PackageSearch}
              title="Unmatched Guidance"
              value="Review"
              detail="If rows do not match during inventory import, use the unmatched tools on that screen before moving into orders."
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <Card className="border border-border/80 bg-card/95 shadow-sm">
              <CardHeader className="gap-3 border-b border-border/70 pb-5">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] tracking-[0.08em] uppercase">
                    Workflow Help
                  </Badge>
                  <Sparkles className="size-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-2xl font-semibold tracking-tight">
                  Recommended import order
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6">
                  Keep the existing import tools doing the heavy lifting. The home screen just clarifies which screen to open next.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 py-6 md:grid-cols-3">
                <WorkflowStep
                  step="01"
                  title="Import products first"
                  description="Use Product Import to refresh catalog structure, new items, and product metadata before any inventory file is uploaded."
                  href="/import"
                  cta="Open Product Import"
                />
                <WorkflowStep
                  step="02"
                  title="Import inventory second"
                  description="Once products are current, upload the inventory file to update counts and keep reorder inputs aligned to the latest catalog."
                  href="/inventory-import"
                  cta="Open Inventory Import"
                />
                <WorkflowStep
                  step="03"
                  title="Use unmatched tools if needed"
                  description="If the inventory import reports unmatched rows, stay on that screen to download the unmatched CSV or create products from unmatched items."
                  href="/inventory-import"
                  cta="Review Unmatched Tools"
                />
              </CardContent>
            </Card>

            <Card className="border border-amber-200/80 bg-amber-50/70 shadow-sm">
              <CardHeader className="gap-3 border-b border-amber-200/80 pb-5">
                <div className="flex items-center gap-2 text-amber-900">
                  <TriangleAlert className="size-4" />
                  <CardTitle className="text-xl font-semibold tracking-tight">
                    Import guardrails
                  </CardTitle>
                </div>
                <CardDescription className="text-amber-900/80">
                  This dashboard does not change import logic. It only routes the team into the right working screen.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 py-6">
                <GuidanceItem
                  title="Do product updates before inventory updates"
                  description="That keeps inventory matching tied to the most current product list."
                />
                <GuidanceItem
                  title="Resolve unmatched inventory on the import screen"
                  description="Use the built-in unmatched CSV export and product creation tools when rows need attention."
                />
                <GuidanceItem
                  title="Move to orders after imports are clean"
                  description="Build or review purchase orders only after the import steps above are complete."
                />
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-3xl border border-border/80 bg-background/85 p-5 shadow-sm backdrop-blur">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

function ActionCard({
  href,
  icon: Icon,
  eyebrow,
  title,
  description,
  summary,
  cta,
  secondaryHref,
  secondaryLabel,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  description: string;
  summary: string;
  cta: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <Card className="border border-border/80 bg-card/95 shadow-sm">
      <CardHeader className="gap-3 pb-2">
        <div className="flex items-center justify-between gap-4">
          <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] tracking-[0.08em] uppercase">
            {eyebrow}
          </Badge>
          <div className="rounded-2xl border border-border/80 bg-muted/50 p-2">
            <Icon className="size-5 text-foreground" />
          </div>
        </div>
        <CardTitle className="text-2xl font-semibold tracking-tight">{title}</CardTitle>
        <CardDescription className="text-sm leading-6">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pb-6">
        <div className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">{summary}</div>
        <div className="flex flex-wrap gap-3">
          <Button asChild className="rounded-full">
            <Link href={href}>
              {cta}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          {secondaryHref && secondaryLabel ? (
            <Button asChild variant="outline" className="rounded-full">
              <Link href={secondaryHref}>{secondaryLabel}</Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="border border-border/80 bg-card/90 shadow-sm">
      <CardContent className="flex h-full flex-col gap-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="rounded-2xl border border-border/80 bg-muted/60 p-2.5">
            <Icon className="size-5 text-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
        </div>
        <div>
          <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkflowStep({
  step,
  title,
  description,
  href,
  cta,
}: {
  step: string;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-3xl border border-border/80 bg-background/80 p-5 shadow-sm">
      <div className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{step}</div>
      <div className="mt-4 space-y-3">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        <Button asChild variant="ghost" className="-ml-2 h-auto rounded-full px-2 py-1.5">
          <Link href={href}>
            {cta}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function GuidanceItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-200/80 bg-background/75 p-4">
      <h3 className="text-sm font-semibold text-amber-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-amber-950/80">{description}</p>
    </div>
  );
}

function formatNumber(value: number | null) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}
