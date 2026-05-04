import NavBar from "@/components/NavBar"
import ManualInventoryEntryDialog from "@/components/inventory/manual-inventory-entry-dialog"
import InventoryCards, { type InventoryItem } from "@/components/inventory/inventory-cards"
import { loadSuggestedParSummary, type SalesParSummary } from "@/lib/sales/par"
import { createServiceRoleClient } from "@/lib/supabase/service"
import { loadPublicTableColumns } from "@/lib/supabase/table-columns"

const EMPTY_SALES_SUMMARY: SalesParSummary = {
  window_days: 30,
  target_days_of_stock: 14,
  total_sales_quantity: 0,
  matched_sales_rows: 0,
  metrics: [],
}

export default async function InventoryPage() {
  const supabase = createServiceRoleClient()

  const [productColumns, inventoryColumns] = await Promise.all([
    loadPublicTableColumns(supabase, "products"),
    loadPublicTableColumns(supabase, "inventory"),
  ])

  const productSelectFields = [
    "id",
    "product_name",
    "brand_name",
    "category",
    "distro",
    "sku",
    "current_price",
    "distributor_locked",
    productColumns.has("cost") ? "cost" : null,
    productColumns.has("unit_cost") ? "unit_cost" : null,
    productColumns.has("wholesale_price") ? "wholesale_price" : null,
    productColumns.has("current_cost") ? "current_cost" : null,
  ]
    .filter(Boolean)
    .join(", ")

  const [productResult, inventoryResult, priceHistoryResult] = await Promise.all([
    supabase
      .from("products")
      .select(productSelectFields)
      .order("product_name", { ascending: true }),
    supabase.from("inventory").select("product_id, on_hand, par_level"),
    supabase
      .from("price_history")
      .select("product_id, old_cost, new_cost, changed_at")
      .order("changed_at", { ascending: false }),
  ])

  const { data: productsRaw, error: productError } = productResult
const products = (productsRaw ?? []) as any[]

  if (productError) {
    return <div className="min-h-screen bg-background p-6 text-red-500">{productError.message}</div>
  }

  const { data: inventory, error: inventoryError } = inventoryResult

  if (inventoryError) {
    return <div className="min-h-screen bg-background p-6 text-red-500">{inventoryError.message}</div>
  }

  const { data: priceHistory, error: priceHistoryError } = priceHistoryResult

  if (priceHistoryError) {
    return <div className="min-h-screen bg-background p-6 text-red-500">{priceHistoryError.message}</div>
  }

  const salesSummary = await loadSuggestedParSummary(supabase, {
    windowDays: 30,
    targetDaysOfStock: 14,
  }).catch(() => EMPTY_SALES_SUMMARY)

  const salesMetricsMap = new Map(
    salesSummary.metrics.map((metric) => [metric.product_id, metric])
  )

  const inventoryMap = new Map((inventory ?? []).map((i) => [i.product_id, i]))

  const latestPriceHistoryMap = new Map<string, { old_cost: number | null; new_cost: number | null }>()

  for (const row of priceHistory ?? []) {
    if (!latestPriceHistoryMap.has(row.product_id)) {
      latestPriceHistoryMap.set(row.product_id, {
        old_cost: row.old_cost,
        new_cost: row.new_cost,
      })
    }
  }

  const existingBrands = Array.from(
    new Set(
      (products ?? [])
        .map((product) => product.brand_name?.trim() ?? "")
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b))

  const existingDistributors = Array.from(
    new Set((products ?? []).map((product) => product.distro?.trim() ?? "").filter(Boolean))
  ).sort((a, b) => a.localeCompare(b))

  const supportedManualFields = {
    category: productColumns.has("category"),
    sku: productColumns.has("sku"),
    cost:
      productColumns.has("current_price") ||
      productColumns.has("unit_cost") ||
      productColumns.has("cost") ||
      productColumns.has("wholesale_price") ||
      productColumns.has("current_cost"),
    parLevel: inventoryColumns.has("par_level"),
    notes: productColumns.has("notes"),
    unitSize: productColumns.has("unit_size"),
    packageSize: productColumns.has("package_size"),
  }

  const items: InventoryItem[] = (products ?? []).map((product: any) => {
    const inv = inventoryMap.get(product.id)
    const salesMetric = salesMetricsMap.get(product.id)
    const latestPriceChange = latestPriceHistoryMap.get(product.id)
    const currentCost =
      product.cost ??
      product.unit_cost ??
      product.wholesale_price ??
      product.current_cost ??
      0
    const previousCost = latestPriceChange?.old_cost ?? null
    const costChangePercent =
      previousCost && currentCost ? ((currentCost - previousCost) / previousCost) * 100 : 0
    const costChangeDirection =
      costChangePercent > 0 ? "up" : costChangePercent < 0 ? "down" : "same"

    return {
      id: product.id,
      name: product.product_name,
      brand: product.brand_name,
      distributor: product.distro,
      category: product.category,
      sku: product.sku,

      price: product.current_price ?? 0,
      cost: currentCost,
      previous_cost: previousCost,
      cost_change_percent: costChangePercent,
      cost_change_direction: costChangeDirection,

      inventory: inv?.on_hand ?? 0,
      low_stock_threshold: inv?.par_level ?? 5,
      current_par: inv?.par_level ?? 0,
      suggested_par: salesMetric?.suggested_par ?? 0,

      avg_daily_sales: salesMetric?.avg_daily_sales ?? 0,
      window_sales: salesMetric?.window_sales ?? 0,

      sales_window_days: salesSummary.window_days,
      target_days_of_stock: salesSummary.target_days_of_stock,
      distributor_locked: product.distributor_locked ?? false,
      image_url: null,
    }
  })

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <NavBar />

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-sans text-3xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
              Inventory
            </h1>
            <p className="mt-1 font-sans text-sm text-muted-foreground">
              Browse current products, inventory counts, and low-stock status in compact or
              expanded views.
            </p>
          </div>

          <ManualInventoryEntryDialog
            brandOptions={existingBrands}
            distributorOptions={[
              "KSS",
              "Nabis",
              "Kindhouse",
              "UpNorth",
              "Big Oil",
              "Self Distro",
              "Other",
              "Unknown Distributor",
              ...existingDistributors,
            ]}
            supportedFields={supportedManualFields}
          />
        </div>

        <InventoryCards items={items} salesSummary={salesSummary} />
      </main>
    </div>
  )
}
