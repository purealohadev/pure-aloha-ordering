"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Minus,
  Package2,
  Plus,
  Search,
  ShoppingCart,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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

type ViewMode = "compact" | "expanded"

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function stockTone(inventory: number, threshold: number) {
  if (inventory <= 0) {
    return {
      label: "Out of stock",
      badgeClass: "bg-red-100 text-red-700 border-red-200",
      textClass: "text-red-600",
      panelClass: "border-red-200/70 bg-red-50/60",
    }
  }

  if (inventory <= threshold) {
    return {
      label: "Low stock",
      badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
      textClass: "text-amber-700",
      panelClass: "border-amber-200/70 bg-amber-50/60",
    }
  }

  return {
    label: "In stock",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    textClass: "text-emerald-700",
    panelClass: "border-emerald-200/70 bg-emerald-50/60",
  }
}

export default function InventoryCards({ items }: Props) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "low" | "out">("all")
  const [viewMode, setViewMode] = useState<ViewMode>("compact")
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
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

  function isItemExpanded(itemId: string) {
    return expandedItems[itemId] ?? viewMode === "expanded"
  }

  function toggleItemExpansion(itemId: string) {
    setExpandedItems((prev) => ({
      ...prev,
      [itemId]: !isItemExpanded(itemId),
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
      <Card className="rounded-[1.75rem] border border-border/80 bg-white/95 shadow-sm">
        <CardHeader className="gap-4 border-b border-border/70 pb-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-2xl font-semibold tracking-tight">
                Inventory Workspace
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Scan the essentials in compact mode and open a single product only when you need
                the extra details or actions.
              </p>
            </div>

            <div className="inline-flex rounded-full border border-border bg-muted/50 p-1">
              <ViewModeButton
                active={viewMode === "compact"}
                onClick={() => setViewMode("compact")}
              >
                Compact View
              </ViewModeButton>
              <ViewModeButton
                active={viewMode === "expanded"}
                onClick={() => setViewMode("expanded")}
              >
                Expanded View
              </ViewModeButton>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
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
        </CardHeader>

        <CardContent className="space-y-3 pt-4">
          {filteredItems.length > 0 ? (
            <div
              className={cn(
                viewMode === "compact"
                  ? "grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                  : "space-y-3"
              )}
            >
              {filteredItems.map((item) => {
                const inventory = item.inventory ?? 0
                const threshold = item.low_stock_threshold ?? 5
                const tone = stockTone(inventory, threshold)
                const isOut = inventory <= 0
                const isExpanded = isItemExpanded(item.id)
                const needsReorder = inventory < threshold

                if (!isExpanded) {
                  return (
                    <article
                      key={item.id}
                      className={cn(
                        "h-[80px] rounded-lg border border-border/70 bg-background p-2 shadow-sm",
                        needsReorder && "bg-amber-50/25"
                      )}
                    >
                      <div className="flex h-full min-h-0 flex-col justify-between gap-1">
                        <div className="flex min-w-0 items-start justify-between gap-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="overflow-hidden text-sm font-medium leading-4 text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                              {item.name}
                            </div>
                            <div className="truncate text-xs leading-3 text-muted-foreground">
                              {[item.brand || "Unknown brand", item.category].filter(Boolean).join(" · ")}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleItemExpansion(item.id)}
                            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                            aria-expanded={isExpanded}
                            aria-label={`Expand details for ${item.name}`}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex min-w-0 items-center justify-between gap-1.5 text-xs leading-3 text-muted-foreground">
                          <div className="flex min-w-0 items-center gap-x-1.5 whitespace-nowrap">
                            <span className={tone.textClass}>Inv {inventory}</span>
                            <span aria-hidden="true">·</span>
                            <span>Par {threshold}</span>
                          </div>
                          <CompactQuantityStepper
                            value={getQty(item.id)}
                            onDecrease={() => setQty(item.id, String(getQty(item.id) - 1))}
                            onIncrease={() => setQty(item.id, String(getQty(item.id) + 1))}
                            productName={item.name}
                          />
                        </div>
                      </div>
                    </article>
                  )
                }

                return (
                  <article
                    key={item.id}
                    className={cn(
                      viewMode === "compact"
                        ? "sm:col-span-2 md:col-span-4 xl:col-span-5 2xl:col-span-6"
                        : "",
                      "rounded-[1.5rem] border bg-white shadow-sm",
                      needsReorder
                        ? "border-amber-200/80 bg-amber-50/30"
                        : "border-border/80"
                    )}
                  >
                    <div className="flex flex-col gap-4 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                          {item.name}
                        </h2>
                        {needsReorder ? (
                          <Badge
                            variant="outline"
                            className="rounded-full border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700"
                          >
                            Low
                          </Badge>
                        ) : null}
                        <Badge variant="outline" className={cn("rounded-full", tone.badgeClass)}>
                          {tone.label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.brand || "Unknown brand"}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleItemExpansion(item.id)}
                      className="inline-flex items-center gap-2 self-start rounded-full border border-border/80 bg-muted/20 px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted/40"
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} details for ${item.name}`}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {isExpanded ? "Collapse" : "Expand"}
                    </button>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_170px_170px]">
                    <SummaryPanel
                      label="Current Inventory"
                      value={String(inventory)}
                      toneClass={tone.textClass}
                      emphasized
                    />
                    <SummaryPanel label="Reorder Threshold" value={String(threshold)} />
                    <div
                      className={cn(
                        "rounded-2xl border px-4 py-3",
                        tone.panelClass
                      )}
                    >
                      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                        <Package2 className="h-3.5 w-3.5" />
                        Stock status
                      </div>
                      <div className={cn("mt-2 flex items-center gap-2 text-sm font-semibold", tone.textClass)}>
                        {inventory <= threshold ? <AlertTriangle className="h-4 w-4" /> : null}
                        <span>{tone.label}</span>
                      </div>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="rounded-[1.35rem] border border-border/80 bg-muted/20 p-4 sm:p-5">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <DetailPanelItem label="Brand" value={item.brand || "Unknown brand"} />
                        <DetailPanelItem label="Category" value={item.category || "—"} />
                        <DetailPanelItem label="SKU" value={item.sku || "—"} />
                        <DetailPanelItem
                          label="Price"
                          value={item.price != null ? currencyFormatter.format(item.price) : "—"}
                        />
                        <DetailPanelItem label="Inventory" value={String(inventory)} />
                        <DetailPanelItem label="Reorder Threshold" value={String(threshold)} />

                        <div className="rounded-2xl border border-border/80 bg-background px-4 py-3 md:col-span-2 xl:col-span-2">
                          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                            Add to order
                          </div>
                          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                            <div className="sm:w-32">
                              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                                Qty to order
                              </label>
                              <Input
                                type="number"
                                min={1}
                                value={getQty(item.id)}
                                onChange={(event) => setQty(item.id, event.target.value)}
                              />
                            </div>

                            <Button
                              type="button"
                              onClick={() => addToOrder(item)}
                              disabled={isOut || addingId === item.id}
                              className="sm:min-w-40"
                            >
                              <ShoppingCart className="mr-2 h-4 w-4" />
                              {addingId === item.id ? "Adding..." : "Add to Order"}
                            </Button>
                          </div>

                          {message[item.id] ? (
                            <p className="mt-3 text-sm text-muted-foreground">{message[item.id]}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : null}

          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No inventory items match your filters.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function ViewModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-medium transition",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function SummaryPanel({
  label,
  value,
  toneClass,
  emphasized = false,
}: {
  label: string
  value: string
  toneClass?: string
  emphasized?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-muted/20 px-4 py-3">
      <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 text-base font-semibold tracking-tight text-foreground",
          emphasized && "text-lg",
          toneClass
        )}
      >
        {value}
      </div>
    </div>
  )
}

function DetailPanelItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-background px-4 py-3">
      <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}

function CompactQuantityStepper({
  onDecrease,
  onIncrease,
  productName,
  value,
}: {
  onDecrease: () => void
  onIncrease: () => void
  productName: string
  value: number
}) {
  return (
    <span className="inline-flex items-center gap-1 align-middle text-foreground">
      <button
        type="button"
        onClick={onDecrease}
        className="inline-flex size-5 items-center justify-center rounded border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-label={`Decrease quantity for ${productName}`}
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="min-w-4 text-center text-xs font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        onClick={onIncrease}
        className="inline-flex size-5 items-center justify-center rounded border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-label={`Increase quantity for ${productName}`}
      >
        <Plus className="h-3 w-3" />
      </button>
    </span>
  )
}
