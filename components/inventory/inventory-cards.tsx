"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
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
import {
  DISTRIBUTOR_ORDER_INDEX,
  getDisplayDistributorName,
} from "@/lib/inventory/distributors"
import { cn } from "@/lib/utils"

export type InventoryItem = {
  id: string
  name: string
  brand: string | null
  distributor: string | null
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

type BrandGroup = {
  name: string
  items: InventoryItem[]
}

type DistributorGroup = {
  name: string
  itemsCount: number
  brands: BrandGroup[]
}

const UNKNOWN_BRAND = "Unknown Brand"

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function displayGroupName(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

function getCompactDisplayName(productName: string, brandName: string) {
  const normalizedBrandName = brandName.trim()

  if (!normalizedBrandName) {
    return productName
  }

  const normalizedProductName = productName.trimStart()
  const lowerProductName = normalizedProductName.toLowerCase()
  const lowerBrandName = normalizedBrandName.toLowerCase()
  const brandPrefixes = [
    `${lowerBrandName} | `,
    `${lowerBrandName} - `,
    `${lowerBrandName} `,
  ]

  const matchedPrefix = brandPrefixes.find((prefix) => lowerProductName.startsWith(prefix))

  return matchedPrefix
    ? normalizedProductName.slice(matchedPrefix.length).trimStart()
    : productName
}

function groupItemsByDistributorAndBrand(items: InventoryItem[]): DistributorGroup[] {
  const distributorMap = new Map<string, Map<string, InventoryItem[]>>()

  for (const item of items) {
    const distributorName = getDisplayDistributorName(item)
    const brandName = displayGroupName(item.brand, UNKNOWN_BRAND)
    const brandMap = distributorMap.get(distributorName) ?? new Map<string, InventoryItem[]>()
    const brandItems = brandMap.get(brandName) ?? []

    brandItems.push(item)
    brandMap.set(brandName, brandItems)
    distributorMap.set(distributorName, brandMap)
  }

  return Array.from(distributorMap.entries())
    .map(([name, brandMap]) => {
      const brands = Array.from(brandMap.entries())
        .map(([brandName, brandItems]) => ({
          name: brandName,
          items: brandItems.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return {
        name,
        itemsCount: brands.reduce((total, brand) => total + brand.items.length, 0),
        brands,
      }
    })
    .sort((a, b) => {
      const aOrder = DISTRIBUTOR_ORDER_INDEX.get(a.name)
      const bOrder = DISTRIBUTOR_ORDER_INDEX.get(b.name)

      if (aOrder != null && bOrder != null) {
        return aOrder - bOrder
      }

      if (aOrder != null) return -1
      if (bOrder != null) return 1

      return a.name.localeCompare(b.name)
    })
}

function stockTone(inventory: number, threshold: number) {
  if (inventory <= 0) {
    return {
      label: "Out of stock",
      badgeClass: "border-red-500/40 bg-red-500/10 text-red-400",
      textClass: "text-red-400",
      panelClass: "border-zinc-700 bg-zinc-900",
    }
  }

  if (inventory < threshold) {
    return {
      label: "Low stock",
      badgeClass: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
      textClass: "text-yellow-400",
      panelClass: "border-zinc-700 bg-zinc-900",
    }
  }

  if (inventory > threshold) {
    return {
      label: "In stock",
      badgeClass: "border-green-500/40 bg-green-500/10 text-green-400",
      textClass: "text-green-400",
      panelClass: "border-zinc-700 bg-zinc-900",
    }
  }

  return {
    label: "At par",
    badgeClass: "border-zinc-600 bg-zinc-900 text-zinc-300",
    textClass: "text-zinc-300",
    panelClass: "border-zinc-700 bg-zinc-900",
  }
}

export default function InventoryCards({ items }: Props) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "low" | "out">("all")
  const [viewMode, setViewMode] = useState<ViewMode>("compact")
  const [collapsedDistributors, setCollapsedDistributors] = useState<Record<string, boolean>>({})
  const [collapsedBrands, setCollapsedBrands] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groupItemsByDistributorAndBrand(items).flatMap((distributorGroup) =>
        distributorGroup.brands.map((brandGroup) => [
          `${distributorGroup.name}::${brandGroup.name}`,
          true,
        ])
      )
    )
  )
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
        item.distributor?.toLowerCase().includes(q) ||
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

  const groupedItems = useMemo(() => {
    return groupItemsByDistributorAndBrand(filteredItems)
  }, [filteredItems])

  function matchesStockFilter(item: InventoryItem, value: typeof stockFilter) {
    const inventory = item.inventory ?? 0
    const threshold = item.low_stock_threshold ?? 5
    const isLow = inventory > 0 && inventory <= threshold
    const isOut = inventory <= 0
    const isIn = inventory > threshold

    return (
      value === "all" ||
      (value === "in" && isIn) ||
      (value === "low" && isLow) ||
      (value === "out" && isOut)
    )
  }

  function getBrandKeyForItem(item: InventoryItem) {
    return `${getDisplayDistributorName(item)}::${displayGroupName(item.brand, UNKNOWN_BRAND)}`
  }

  function getMatchingBrandKeys({
    queryValue = query,
    categoryValue = category,
    stockValue = stockFilter,
  }: {
    queryValue?: string
    categoryValue?: string
    stockValue?: typeof stockFilter
  }) {
    const q = queryValue.trim().toLowerCase()

    return Array.from(
      new Set(
        items
          .filter((item) => {
            const matchesQuery =
              q.length === 0 ||
              item.name?.toLowerCase().includes(q) ||
              item.brand?.toLowerCase().includes(q) ||
              item.distributor?.toLowerCase().includes(q) ||
              item.category?.toLowerCase().includes(q) ||
              item.sku?.toLowerCase().includes(q)

            const matchesCategory = categoryValue === "all" || item.category === categoryValue

            return matchesQuery && matchesCategory && matchesStockFilter(item, stockValue)
          })
          .map(getBrandKeyForItem)
      )
    )
  }

  function expandBrandKeys(brandKeys: string[]) {
    if (brandKeys.length === 0) return

    setCollapsedBrands((prev) => ({
      ...prev,
      ...Object.fromEntries(brandKeys.map((key) => [key, false])),
    }))
  }

  function expandBrandForItem(productId: string) {
    const item = items.find((candidate) => candidate.id === productId)
    if (item) {
      expandBrandKeys([getBrandKeyForItem(item)])
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    expandBrandKeys(getMatchingBrandKeys({ queryValue: value }))
  }

  function handleCategoryChange(value: string) {
    setCategory(value)
    expandBrandKeys(getMatchingBrandKeys({ categoryValue: value }))
  }

  function handleStockFilterChange(value: typeof stockFilter) {
    setStockFilter(value)
    expandBrandKeys(getMatchingBrandKeys({ stockValue: value }))
  }

  function handleExpandedView() {
    setViewMode("expanded")
    expandBrandKeys(
      groupedItems.flatMap((distributorGroup) =>
        distributorGroup.brands.map((brandGroup) => `${distributorGroup.name}::${brandGroup.name}`)
      )
    )
  }

  function getQty(productId: string) {
    return quantities[productId] ?? 1
  }

  function setQty(productId: string, value: string) {
    const parsed = Number(value)

    expandBrandForItem(productId)
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

  function toggleDistributor(distributorName: string) {
    setCollapsedDistributors((prev) => ({
      ...prev,
      [distributorName]: !prev[distributorName],
    }))
  }

  function toggleBrand(distributorName: string, brandName: string) {
    const key = `${distributorName}::${brandName}`

    setCollapsedBrands((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
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

  function renderInventoryItem(item: InventoryItem, brandName: string) {
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
          className="h-[80px] rounded-lg border border-zinc-700 bg-zinc-800 p-2 font-sans shadow-sm transition hover:bg-zinc-700"
        >
          <div className="flex h-full min-h-0 flex-col justify-between gap-1">
            <div className="flex min-w-0 items-start justify-between gap-1.5">
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm font-semibold leading-tight text-zinc-100">
                  {getCompactDisplayName(item.name, brandName)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => toggleItemExpansion(item.id)}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-600 hover:text-white"
                aria-expanded={isExpanded}
                aria-label={`Expand details for ${item.name}`}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex min-w-0 items-center justify-between gap-1.5 text-xs leading-tight text-zinc-400">
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
          "rounded-[1.5rem] border border-zinc-700 bg-zinc-800 font-sans shadow-sm"
        )}
      >
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="line-clamp-2 text-sm font-semibold leading-tight text-zinc-100">
                  {item.name}
                </h2>
                {needsReorder ? (
                  <Badge
                    variant="outline"
                    className="rounded-full border-yellow-500/40 bg-yellow-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-yellow-400"
                  >
                    Low
                  </Badge>
                ) : null}
                <Badge variant="outline" className={cn("rounded-full", tone.badgeClass)}>
                  {tone.label}
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-tight text-zinc-400">
                {item.brand || UNKNOWN_BRAND}
              </p>
            </div>

            <button
              type="button"
              onClick={() => toggleItemExpansion(item.id)}
              className="inline-flex items-center gap-2 self-start rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700 hover:text-white"
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
            <div className={cn("rounded-2xl border px-4 py-3", tone.panelClass)}>
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-zinc-400 uppercase">
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
            <div className="rounded-[1.35rem] border border-zinc-700 bg-zinc-900 p-4 sm:p-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <DetailPanelItem label="Brand" value={item.brand || UNKNOWN_BRAND} />
                <DetailPanelItem label="Category" value={item.category || "—"} />
                <DetailPanelItem label="SKU" value={item.sku || "—"} />
                <DetailPanelItem
                  label="Price"
                  value={item.price != null ? currencyFormatter.format(item.price) : "—"}
                />
                <DetailPanelItem
                  label="Inventory"
                  value={String(inventory)}
                  valueClassName={tone.textClass}
                />
                <DetailPanelItem label="Reorder Threshold" value={String(threshold)} />

                <div className="rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 md:col-span-2 xl:col-span-2">
                  <div className="text-[11px] font-semibold tracking-[0.08em] text-zinc-400 uppercase">
                    Add to order
                  </div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="sm:w-32">
                      <label className="mb-1 block text-xs uppercase tracking-[0.04em] text-zinc-400">
                        Qty to order
                      </label>
                      <Input
                        type="number"
                        min={1}
                        value={getQty(item.id)}
                        onChange={(event) => setQty(item.id, event.target.value)}
                        className="border-zinc-700 bg-zinc-900 font-sans text-white focus-visible:border-zinc-500"
                      />
                    </div>

                    <Button
                      type="button"
                      onClick={() => addToOrder(item)}
                      disabled={isOut || addingId === item.id}
                      className="border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-700 hover:text-white sm:min-w-40"
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      {addingId === item.id ? "Adding..." : "Add to Order"}
                    </Button>
                  </div>

                  {message[item.id] ? (
                    <p className="mt-3 text-xs leading-tight text-zinc-400">{message[item.id]}</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </article>
    )
  }

  return (
    <div className="space-y-6 font-sans">
      <Card className="rounded-[1.75rem] border border-zinc-700 bg-zinc-800 font-sans text-white shadow-sm">
        <CardHeader className="gap-4 border-b border-zinc-700 pb-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <CardTitle className="font-sans text-2xl font-semibold tracking-tight text-blue-400">
                Inventory Workspace
              </CardTitle>
              <p className="font-sans text-sm text-zinc-400">
                Scan the essentials in compact mode and open a single product only when you need
                the extra details or actions.
              </p>
            </div>

            <div className="inline-flex rounded-full border border-zinc-700 bg-zinc-900 p-1">
              <ViewModeButton
                active={viewMode === "compact"}
                onClick={() => setViewMode("compact")}
              >
                Compact View
              </ViewModeButton>
              <ViewModeButton
                active={viewMode === "expanded"}
                onClick={handleExpandedView}
              >
                Expanded View
              </ViewModeButton>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                placeholder="Search name, distributor, brand, category, or SKU"
                className="border-zinc-700 bg-zinc-900 pl-9 font-sans text-white placeholder:text-zinc-500 focus-visible:border-zinc-500"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {categories.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={category === value ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleCategoryChange(value)}
                  className={cn(
                    "rounded-full border-zinc-700",
                    category === value
                      ? "bg-zinc-700 text-white hover:bg-zinc-600"
                      : "bg-zinc-900 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                  )}
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
              onClick={() => handleStockFilterChange("all")}
              className={cn(
                "rounded-full border-zinc-700",
                stockFilter === "all"
                  ? "bg-zinc-700 text-white hover:bg-zinc-600"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-700 hover:text-white"
              )}
            >
              All stock
            </Button>
            <Button
              type="button"
              variant={stockFilter === "in" ? "default" : "outline"}
              size="sm"
              onClick={() => handleStockFilterChange("in")}
              className={cn(
                "rounded-full border-zinc-700",
                stockFilter === "in"
                  ? "bg-zinc-700 text-white hover:bg-zinc-600"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-700 hover:text-white"
              )}
            >
              In stock
            </Button>
            <Button
              type="button"
              variant={stockFilter === "low" ? "default" : "outline"}
              size="sm"
              onClick={() => handleStockFilterChange("low")}
              className={cn(
                "rounded-full border-zinc-700",
                stockFilter === "low"
                  ? "bg-zinc-700 text-white hover:bg-zinc-600"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-700 hover:text-white"
              )}
            >
              Low stock
            </Button>
            <Button
              type="button"
              variant={stockFilter === "out" ? "default" : "outline"}
              size="sm"
              onClick={() => handleStockFilterChange("out")}
              className={cn(
                "rounded-full border-zinc-700",
                stockFilter === "out"
                  ? "bg-zinc-700 text-white hover:bg-zinc-600"
                  : "bg-zinc-900 text-zinc-300 hover:bg-zinc-700 hover:text-white"
              )}
            >
              Out of stock
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {groupedItems.length > 0 ? (
            groupedItems.map((distributorGroup) => {
              const distributorCollapsed = collapsedDistributors[distributorGroup.name] ?? false

              return (
                <section
                  key={distributorGroup.name}
                  className="overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900/60"
                >
                  <button
                    type="button"
                    onClick={() => toggleDistributor(distributorGroup.name)}
                    className="flex w-full items-center justify-between gap-3 border-b border-zinc-700 bg-zinc-800 px-4 py-3 text-left transition hover:bg-zinc-700"
                    aria-expanded={!distributorCollapsed}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {distributorCollapsed ? (
                        <ChevronRight className="h-5 w-5 shrink-0 text-blue-300" />
                      ) : (
                        <ChevronDown className="h-5 w-5 shrink-0 text-blue-300" />
                      )}
                      <span className="truncate text-lg font-semibold tracking-tight text-blue-300">
                        {distributorGroup.name}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-zinc-600 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300">
                      {distributorGroup.itemsCount} items
                    </span>
                  </button>

                  {!distributorCollapsed ? (
                    <div className="space-y-3 p-3 sm:p-4">
                      {distributorGroup.brands.map((brandGroup) => {
                        const brandKey = `${distributorGroup.name}::${brandGroup.name}`
                        const brandCollapsed = collapsedBrands[brandKey] ?? true

                        return (
                          <section
                            key={brandKey}
                            className="rounded-xl border border-zinc-700 bg-zinc-900"
                          >
                            <button
                              type="button"
                              onClick={() => toggleBrand(distributorGroup.name, brandGroup.name)}
                              className="flex w-full items-center justify-between gap-3 border-b border-zinc-700 px-3 py-2.5 text-left transition hover:bg-zinc-800"
                              aria-expanded={!brandCollapsed}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                {brandCollapsed ? (
                                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
                                )}
                                <span className="truncate text-sm font-semibold text-zinc-100">
                                  {brandGroup.name}
                                </span>
                              </span>
                              <span className="shrink-0 text-xs text-zinc-400">
                                {brandGroup.items.length} items
                              </span>
                            </button>

                            {!brandCollapsed ? (
                              <div
                                className={cn(
                                  "p-3",
                                  viewMode === "compact"
                                    ? "grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                                    : "space-y-3"
                                )}
                              >
                                {brandGroup.items.map((item) => renderInventoryItem(item, brandGroup.name))}
                              </div>
                            ) : null}
                          </section>
                        )
                      })}
                    </div>
                  ) : null}
                </section>
              )
            })
          ) : null}

          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center text-sm text-zinc-400">
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
        active ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
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
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3">
      <div className="text-[11px] font-semibold tracking-[0.08em] text-zinc-400 uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 text-base font-semibold tracking-tight text-white",
          emphasized && "text-lg",
          toneClass
        )}
      >
        {value}
      </div>
    </div>
  )
}

function DetailPanelItem({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3">
      <div className="text-[11px] font-semibold tracking-[0.08em] text-zinc-400 uppercase">
        {label}
      </div>
      <div className={cn("mt-1 text-sm font-medium text-white", valueClassName)}>{value}</div>
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
    <span className="inline-flex items-center gap-1 align-middle text-xs text-white">
      <button
        type="button"
        onClick={onDecrease}
        className="inline-flex size-5 items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
        aria-label={`Decrease quantity for ${productName}`}
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="min-w-4 text-center text-xs font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        onClick={onIncrease}
        className="inline-flex size-5 items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
        aria-label={`Increase quantity for ${productName}`}
      >
        <Plus className="h-3 w-3" />
      </button>
    </span>
  )
}
