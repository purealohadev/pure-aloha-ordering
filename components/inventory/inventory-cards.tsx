"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Package2, Search, ShoppingCart } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type InventoryItem = {
  id: string
  name: string
  brand: string | null
  category: string | null
  sku: string | null
  price: number | null
  inventory: number | null
  low_stock_threshold?: number | null
  image_url?: string | null
}

type Props = {
  items: InventoryItem[]
}

function stockTone(inventory: number, threshold: number) {
  if (inventory <= 0) {
    return {
      label: "Out of stock",
      badgeClass: "bg-red-100 text-red-700 border-red-200",
      textClass: "text-red-600",
    }
  }

  if (inventory <= threshold) {
    return {
      label: "Low stock",
      badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
      textClass: "text-amber-600",
    }
  }

  return {
    label: "In stock",
    badgeClass: "bg-green-100 text-green-700 border-green-200",
    textClass: "text-green-600",
  }
}

export default function InventoryCards({ items }: Props) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "low" | "out">("all")
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [addingId, setAddingId] = useState<string | null>(null)
  const [message, setMessage] = useState<Record<string, string>>({})

  const categories = useMemo(() => {
    return [
      "all",
      ...Array.from(
        new Set(items.map((item) => item.category).filter(Boolean) as string[])
      ).sort(),
    ]
  }, [items])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()

    return items.filter((item) => {
      const inventory = item.inventory ?? 0
      const threshold = item.low_stock_threshold ?? 5
      const isLow = inventory > 0 && inventory <= threshold
      const isOut = inventory <= 0
      const isIn = inventory > threshold

      const matchesQuery =
        q.length === 0 ||
        item.name?.toLowerCase().includes(q) ||
        item.brand?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q)

      const matchesCategory = category === "all" || item.category === category

      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "in" && isIn) ||
        (stockFilter === "low" && isLow) ||
        (stockFilter === "out" && isOut)

      return matchesQuery && matchesCategory && matchesStock
    })
  }, [items, query, category, stockFilter])

  function getQty(productId: string) {
    return quantities[productId] ?? 1
  }

  function setQty(productId: string, value: string) {
    const parsed = Number(value)
    setQuantities((prev) => ({
      ...prev,
      [productId]: Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1,
    }))
  }

  async function addToOrder(item: InventoryItem) {
    const qty = getQty(item.id)

    try {
      setAddingId(item.id)
      setMessage((prev) => ({ ...prev, [item.id]: "" }))

      const response = await fetch("/api/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [
            {
              product_id: item.id,
              sku: item.sku,
              name: item.name,
              quantity: qty,
              unit_price: item.price ?? 0,
            },
          ],
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result?.error || "Failed to add item to order.")
      }

      setMessage((prev) => ({
        ...prev,
        [item.id]: "Added to order",
      }))
    } catch (error) {
      setMessage((prev) => ({
        ...prev,
        [item.id]:
          error instanceof Error ? error.message : "Failed to add item to order.",
      }))
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, brand, category, or SKU"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((value) => (
            <Button
              key={value}
              type="button"
              variant={category === value ? "default" : "outline"}
              size="sm"
              onClick={() => setCategory(value)}
              className="rounded-full"
            >
              {value === "all" ? "All categories" : value}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={stockFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setStockFilter("all")}
          className="rounded-full"
        >
          All stock
        </Button>
        <Button
          type="button"
          variant={stockFilter === "in" ? "default" : "outline"}
          size="sm"
          onClick={() => setStockFilter("in")}
          className="rounded-full"
        >
          In stock
        </Button>
        <Button
          type="button"
          variant={stockFilter === "low" ? "default" : "outline"}
          size="sm"
          onClick={() => setStockFilter("low")}
          className="rounded-full"
        >
          Low stock
        </Button>
        <Button
          type="button"
          variant={stockFilter === "out" ? "default" : "outline"}
          size="sm"
          onClick={() => setStockFilter("out")}
          className="rounded-full"
        >
          Out of stock
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filteredItems.map((item) => {
          const inventory = item.inventory ?? 0
          const threshold = item.low_stock_threshold ?? 5
          const tone = stockTone(inventory, threshold)
          const isOut = inventory <= 0

          return (
            <Card
              key={item.id}
              className="overflow-hidden rounded-2xl border shadow-sm transition hover:shadow-md"
            >
              <CardHeader className="space-y-3 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="line-clamp-2 text-base font-semibold">
                      {item.name}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.brand || "Unknown brand"}
                    </p>
                  </div>

                  <Badge variant="outline" className={cn("shrink-0", tone.badgeClass)}>
                    {tone.label}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-muted/50 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Category
                    </div>
                    <div className="mt-1 font-medium">{item.category || "—"}</div>
                  </div>

                  <div className="rounded-xl bg-muted/50 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      SKU
                    </div>
                    <div className="mt-1 truncate font-medium">{item.sku || "—"}</div>
                  </div>

                  <div className="rounded-xl bg-muted/50 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Price
                    </div>
                    <div className="mt-1 font-medium">
                      {item.price != null ? `$${item.price.toFixed(2)}` : "—"}
                    </div>
                  </div>

                  <div className="rounded-xl bg-muted/50 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Inventory
                    </div>
                    <div className={cn("mt-1 flex items-center gap-2 font-semibold", tone.textClass)}>
                      {inventory <= threshold && <AlertTriangle className="h-4 w-4" />}
                      <span>{inventory}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Package2 className="h-4 w-4" />
                    Reorder threshold
                  </div>
                  <div className="font-semibold">{threshold}</div>
                </div>

                <div className="rounded-xl border p-3 space-y-3">
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                        Qty to order
                      </label>
                      <Input
                        type="number"
                        min={1}
                        value={getQty(item.id)}
                        onChange={(e) => setQty(item.id, e.target.value)}
                      />
                    </div>

                    <Button
                      type="button"
                      onClick={() => addToOrder(item)}
                      disabled={isOut || addingId === item.id}
                      className="shrink-0"
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      {addingId === item.id ? "Adding..." : "Add to Order"}
                    </Button>
                  </div>

                  {message[item.id] ? (
                    <p className="text-sm text-muted-foreground">{message[item.id]}</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {filteredItems.length === 0 && (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No inventory items match your filters.
        </div>
      )}
    </div>
  )
}