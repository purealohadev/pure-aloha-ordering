import NavBar from "@/components/NavBar"
import { createServiceRoleClient } from "@/lib/supabase/service"

type PriceHistoryRow = {
  id: string
  product_id: string
  old_cost: number | null
  new_cost: number
  changed_at: string
  source: string | null
  products?: {
    product_name: string | null
    brand_name: string | null
    distro: string | null
    current_price: number | null
  } | null
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

function getPercentChange(oldCost: number | null, newCost: number) {
  if (!oldCost || oldCost <= 0) return null
  return ((newCost - oldCost) / oldCost) * 100
}

export default async function PriceAlertsPage() {
  const supabase = createServiceRoleClient()

  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

  const { data, error } = await supabase
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
        current_price
      )
    `
    )
    .gte("changed_at", fourteenDaysAgo.toISOString())
    .order("changed_at", { ascending: false })

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <NavBar />
        <main className="mx-auto max-w-7xl px-4 py-6">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {error.message}
          </div>
        </main>
      </div>
    )
  }

  const rows = ((data ?? []) as PriceHistoryRow[])
    .map((row) => {
      const percentChange = getPercentChange(row.old_cost, row.new_cost)

      return {
        ...row,
        percentChange,
        direction:
          percentChange === null
            ? "same"
            : percentChange > 0
              ? "up"
              : percentChange < 0
                ? "down"
                : "same",
      }
    })
    .sort((a, b) => {
      const aValue = a.percentChange ?? 0
      const bValue = b.percentChange ?? 0
      return bValue - aValue
    })

  const increaseCount = rows.filter((row) => row.direction === "up").length
  const decreaseCount = rows.filter((row) => row.direction === "down").length

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <NavBar />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
              Price Alerts
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Recent wholesale cost changes from the last 14 days, sorted by biggest increase.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <div className="text-xs text-muted-foreground">Increases</div>
              <div className="text-2xl font-bold text-red-400">{increaseCount}</div>
            </div>

            <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
              <div className="text-xs text-muted-foreground">Decreases</div>
              <div className="text-2xl font-bold text-green-400">{decreaseCount}</div>
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No price changes found in the last 14 days.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="hidden grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-3 border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
              <div>Product</div>
              <div>Distributor</div>
              <div>Cost Change</div>
              <div>% Change</div>
              <div>Date</div>
            </div>

            <div className="divide-y divide-border">
              {rows.map((row) => {
                const product = row.products
                const oldCost = row.old_cost ?? 0
                const percent = row.percentChange
                const isUp = row.direction === "up"
                const isDown = row.direction === "down"

                return (
                  <div
                    key={row.id}
                    className="grid gap-2 px-4 py-4 text-sm md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] md:items-center md:gap-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold">
                        {product?.product_name ?? "Unknown Product"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {product?.brand_name ?? "Unknown Brand"}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground md:text-sm">
                      {product?.distro ?? "Unknown Distributor"}
                    </div>

                    <div className="font-medium">
                      {currencyFormatter.format(oldCost)} →{" "}
                      {currencyFormatter.format(row.new_cost)}
                    </div>

                    <div
                      className={
                        isUp
                          ? "font-bold text-red-400"
                          : isDown
                            ? "font-bold text-green-400"
                            : "font-bold text-muted-foreground"
                      }
                    >
                      {percent === null
                        ? "—"
                        : `${isUp ? "↑" : isDown ? "↓" : "→"} ${Math.abs(
                            percent
                          ).toFixed(1)}%`}
                    </div>

                    <div className="text-xs text-muted-foreground md:text-sm">
                      {dateFormatter.format(new Date(row.changed_at))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}