import NavBar from "@/components/NavBar"
import InventoryCards, { type InventoryItem } from "@/components/inventory/inventory-cards"
import { loadSuggestedParSummary, type SalesParSummary } from "@/lib/sales/par"
import { createServiceRoleClient } from "@/lib/supabase/service"

const EMPTY_SALES_SUMMARY: SalesParSummary = {
  window_days: 30,
  target_days_of_stock: 14,
  total_sales_quantity: 0,
  matched_sales_rows: 0,
  metrics: [],
}

export default async function InventoryPage() {
  const supabase = createServiceRoleClient()

  // 1. get products
  const { data: products, error: productError } = await supabase
    .from("products")
    .select(
      "id, product_name, brand_name, category, distro, sku, current_price, distributor_locked"
    )
    .order("product_name", { ascending: true })

  if (productError) {
    return <div className="min-h-screen bg-background p-6 text-red-500">{productError.message}</div>
  }

  // 2. get inventory
  const { data: inventory, error: inventoryError } = await supabase
    .from("inventory")
    .select("product_id, on_hand, par_level")

  if (inventoryError) {
    return <div className="min-h-screen bg-background p-6 text-red-500">{inventoryError.message}</div>
  }

  const salesSummary = await loadSuggestedParSummary(supabase, {
    windowDays: 30,
    targetDaysOfStock: 14,
  }).catch(() => EMPTY_SALES_SUMMARY)

  const salesMetricsMap = new Map(
    salesSummary.metrics.map((metric) => [metric.product_id, metric])
  )

  // 3. map inventory by product_id
  const inventoryMap = new Map(
    (inventory ?? []).map((i) => [i.product_id, i])
  )

  // 4. combine data
  const items: InventoryItem[] = (products ?? []).map((product) => {
    const inv = inventoryMap.get(product.id)
    const salesMetric = salesMetricsMap.get(product.id)

    return {
      id: product.id,
      name: product.product_name,
      brand: product.brand_name,
      distributor: product.distro,
      category: product.category,
      sku: product.sku,
      price: product.current_price,
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
        <div>
          <h1 className="font-sans text-3xl font-bold tracking-tight text-blue-600 dark:text-blue-400">Inventory</h1>
          <p className="mt-1 font-sans text-sm text-muted-foreground">
            Browse current products, inventory counts, and low-stock status in compact or expanded
            views.
          </p>
        </div>

        <InventoryCards
          items={items}
          salesSummary={salesSummary}
        />
      </main>
    </div>
  )
}
