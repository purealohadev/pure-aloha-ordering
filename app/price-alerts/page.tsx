import Link from "next/link";
import type { ComponentType } from "react";
import { ArrowLeft, ArrowRight, BellRing, TrendingDown, TrendingUp } from "lucide-react";
import NavBar from "@/components/NavBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PriceAlertsTable, { type PriceAlertRow } from "@/components/price-alerts/price-alerts-table";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export default async function PriceAlertsPage() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-screen bg-background px-6 py-10 text-foreground">
        <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-8 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Price Alerts</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            You need to sign in to view pricing alerts.
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
  const canReviewAlerts = role === "manager" || role === "admin";
  const displayName = profile?.full_name ?? profile?.email ?? user.email ?? "Team Member";
  const supabase = createServiceRoleClient();

  const { data: alerts, error } = await supabase
    .from("price_alerts")
    .select(
      "id, sku, brand_name, product_name, distributor, old_price, new_price, change_amount, change_percent, change_direction, status, created_at"
    )
    .eq("status", "open")
    .order("created_at", { ascending: false });

  const openAlerts = (alerts ?? []) as PriceAlertRow[];
  const increaseCount = openAlerts.filter((alert) => alert.change_direction === "increase").length;
  const decreaseCount = openAlerts.filter((alert) => alert.change_direction === "decrease").length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />

      <main className="px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5">
          <section className="flex flex-col gap-4 border-b border-border/70 pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Price Alerts
                </h1>
                <Badge variant="outline" className="text-xs">
                  {role ? `Role: ${role}` : "Signed in"}
                </Badge>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Track price increases and decreases from imported product costs.
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
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <AlertStatCard
              icon={BellRing}
              label="Open Price Alerts"
              value={String(openAlerts.length)}
              detail="Awaiting review"
            />
            <AlertStatCard
              icon={TrendingUp}
              label="Price Increases"
              value={String(increaseCount)}
              detail="Costs up"
            />
            <AlertStatCard
              icon={TrendingDown}
              label="Price Decreases"
              value={String(decreaseCount)}
              detail="Costs down"
            />
          </section>

          <Card className="border border-border/80 bg-card/95 shadow-sm">
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="text-base font-semibold">Open Alerts</CardTitle>
              <CardDescription className="text-sm">
                Review price changes and mark alerts once they have been handled.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {error ? (
                <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
                  {error.message}
                </div>
              ) : (
                <PriceAlertsTable alerts={openAlerts} canReview={canReviewAlerts} />
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
            <span>Open alert review and dashboard summary live here.</span>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">
                Back to Dashboard
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function AlertStatCard({
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
