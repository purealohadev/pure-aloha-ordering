import { createClient } from "@/lib/supabase/server"
import InventoryCards, { type InventoryItem } from "@/components/inventory/inventory-cards"

export default async function InventoryPage() {
  const supabase = await createClient()

  // 1. get products
  const { data: products, error: productError } = await supabase
    .from("products")
    .select("id, product_name, brand_name, category, sku, current_price")
    .order("product_name", { ascending: true })

  if (productError) {
    return <div className="p-6 text-red-600">{productError.message}</div>
  }

  // 2. get inventory
  const { data: inventory, error: inventoryError } = await supabase
    .from("inventory")
    .select("product_id, on_hand, par_level")

  if (inventoryError) {
    return <div className="p-6 text-red-600">{inventoryError.message}</div>
  }

  // 3. map inventory by product_id
  const inventoryMap = new Map(
    (inventory ?? []).map((i) => [i.product_id, i])
  )

  // 4. combine data
  const items: InventoryItem[] = (products ?? []).map((product) => {
    const inv = inventoryMap.get(product.id)

    return {
      id: product.id,
      name: product.product_name,
      brand: product.brand_name,
      category: product.category,
      sku: product.sku,
      price: product.current_price,
      inventory: inv?.on_hand ?? 0,
      low_stock_threshold: inv?.par_level ?? 5,
      image_url: null,
    }
  })

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
        <p className="text-muted-foreground">
          Browse current products, inventory counts, and low-stock status.
        </p>
      </div>

      <InventoryCards items={items} />
    </div>
  )
}