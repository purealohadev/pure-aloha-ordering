import Link from "next/link"
import { ArrowLeft, ArrowRight, History, TrendingDown, TrendingUp } from "lucide-react"
import NavBar from "@/components/NavBar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase/service"

type PriceHistoryRow = {
  id: string
  product_id: string
  old_cost: number | string | null
  new_cost: number | string | null
  changed_at: string | null
  source: string | null
  products?: {
    product_name: string | null
    brand_name: string | null
    distro: string | null
    current_price: number | string | null
    sku?: string | null
  } | null
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function toNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function getPercentChange(oldCost: number | string | null, newCost: number | string | null) {
  const oldValue = toNumber(oldCost)
  const newValue = toNumber(newCost)

  if (!oldValue || oldValue <= 0) return null

  return ((newValue - oldValue) / oldValue) * 100
}

function formatMoney(value: number | string | null | undefined) {
  return currencyFormatter.format(toNumber(value))
}

function formatPercent(value: number | null) {
  if (value === null) return "—"
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→"
  return `${arrow} ${Math.abs(value).toFixed(1)}%`
}

export default async function PriceHistoryPage() {
  const authClient = await createClient()

  const {
    data: { user },
  } = await authClient.auth.getUser()

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
    )
  }

  const { data: profile } = await authClient
    .from("profiles")
    .select("full_name, role, email")
    .eq("id", user.id)
    .single()

  const role = profile?.role ?? ""
  const displayName = profile?.full_name ?? profile?.email ?? user.email ?? "Team Member"
  const supabase = createServiceRoleClient()

  const { data: history, error } = await supabase
    .from("price_history")
    .select(
      `
      id,
      product_id,
      old_cost,
      new_cost,
      changed_at,
      source,
      products (
        product_name,
        brand_name,
        distro,
        current_price,
        sku
      )
    `
    )
    .order("changed_at", { ascending: false })
    .limit(250)

  const rows = ((history ?? []) as unknown as PriceHistoryRow[]).map((row) => {
    const percentChange = getPercentChange(row.old_cost, row.new_cost)

    return {
      ...row,
      percentChange,
      direction:
        percentChange === null
          ? "same"
          : percentChange > 0
            ? "increase"
            : percentChange < 0
              ? "decrease"
              : "same",
    }
  })

  const increaseCount = rows.filter((row) => row.direction === "increase").length
  const decreaseCount = rows.filter((row) => row.direction === "decrease").length
  const noChangeCount = rows.filter((row) => row.direction === "same").length
  const latestChangedAt = rows[0]?.changed_at ?? null

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
                Review saved wholesale cost changes over time.
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
            <MetricCard icon={History} label="Recent Changes" value={String(rows.length)} detail="Latest 250 rows" />
            <MetricCard icon={TrendingUp} label="Price Increases" value={String(increaseCount)} detail="Cost moved up" />
            <MetricCard icon={TrendingDown} label="Price Decreases" value={String(decreaseCount)} detail="Cost moved down" />
            <MetricCard icon={History} label="No Change" value={String(noChangeCount)} detail="Stable changes" />
          </section>

          <Card className="border border-border/80 bg-card/95 shadow-sm">
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle className="text-base font-semibold">Price Change Log</CardTitle>
              <CardDescription className="text-sm">
                Newest saved cost changes appear first.
                {latestChangedAt ? ` Latest change: ${new Date(latestChangedAt).toLocaleString()}.` : ""}
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
  )
}

function PriceHistoryTable({
  rows,
}: {
  rows: Array<PriceHistoryRow & { percentChange: number | null; direction: string }>
}) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-8 text-sm text-muted-foreground">
        No price history has been saved yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground max-lg:hidden">
        <span>Product</span>
        <span>Distributor</span>
        <span className="text-right">Previous</span>
        <span className="text-right">New</span>
        <span className="text-right">Change</span>
        <span>Date</span>
      </div>

      <div className="divide-y divide-border">
        {rows.map((row) => {
          const product = row.products
          const isIncrease = row.direction === "increase"
          const isDecrease = row.direction === "decrease"

          return (
            <div
              key={row.id}
              className="grid gap-3 px-3 py-4 text-sm transition hover:bg-muted/25 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr] lg:items-center"
            >
              <div className="min-w-0">
                <div className="font-medium text-foreground">
                  {product?.brand_name || "Unknown Brand"}
                </div>
                <div className="truncate text-muted-foreground">
                  {product?.product_name || "Unknown Product"}
                </div>
                {product?.sku ? (
                  <div className="text-xs text-muted-foreground">SKU {product.sku}</div>
                ) : null}
              </div>

              <div className="text-muted-foreground">
                {product?.distro || "Unknown Distributor"}
              </div>

              <div className="lg:text-right">{formatMoney(row.old_cost)}</div>

              <div className="lg:text-right">{formatMoney(row.new_cost)}</div>

              <div
                className={
                  isIncrease
                    ? "font-semibold text-red-400 lg:text-right"
                    : isDecrease
                      ? "font-semibold text-green-400 lg:text-right"
                      : "font-semibold text-muted-foreground lg:text-right"
                }
              >
                {formatPercent(row.percentChange)}
              </div>

              <div className="text-xs text-muted-foreground">
                {row.changed_at ? new Date(row.changed_at).toLocaleString() : "—"}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  detail: string
}) {
  return (
    <Card className="border border-border/80 bg-card/95 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}