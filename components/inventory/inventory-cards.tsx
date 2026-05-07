"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CheckCheck,
  Minus,
  Package2,
  Plus,
  Search,
  RefreshCw,
  ShoppingCart,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import SuggestedDistributor from "@/components/SuggestedDistributor"
import { createClient } from "@/lib/supabase/client"
import {
  ACCESSORIES_GROUP_NAME,
  DISTRIBUTOR_ORDER_INDEX,
  UNKNOWN_DISTRIBUTOR,
  isNonConsumableCategory,
  resolveDistributorBrand,
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
  cost?: number | null
  previous_cost?: number | null
  cost_change_percent?: number | null
  cost_change_direction?: "up" | "down" | "same" | null
  inventory: number | null
  low_stock_threshold?: number | null
  current_par?: number | null
  suggested_par?: number | null
  avg_daily_sales?: number | null
  window_sales?: number | null
  sales_window_days?: number | null
  target_days_of_stock?: number | null
  distributor_locked?: boolean | null
  image_url?: string | null
}

export type SalesParSummary = {
  window_days: number
  target_days_of_stock: number
  total_sales_quantity: number
  matched_sales_rows: number
  metrics: SalesParMetric[]
}

export type SalesParMetric = {
  product_id: string
  sku: string | null
  product_name: string
  brand_name: string | null
  current_par: number
  suggested_par: number
  avg_daily_sales: number
  window_sales: number
  matched_sales_rows: number
}

type Props = {
  items: InventoryItem[]
  salesSummary: SalesParSummary
}

type ViewMode = "compact" | "expanded"

type BrandGroup = {
  name: string
  items: InventoryItem[]
}

type ProductTypeGroup = {
  name: string
  items: InventoryItem[]
}

type DistributorGroup = {
  name: string
  itemsCount: number
  brands: BrandGroup[]
}

type AcceptedBrandDistributorMap = Record<string, string>
type LockedBrandMap = Record<string, boolean>
type SaveStatusTone = "success" | "error"
type SaveStatus = {
  tone: SaveStatusTone
  text: string
} | null

const DISTRIBUTOR_OPTIONS = [
  "KSS",
  "Nabis",
  "Kindhouse",
  "UpNorth",
  "Big Oil",
  "Self Distro",
  "Other",
  UNKNOWN_DISTRIBUTOR,
]
const SUMMARY_DISTRIBUTORS = DISTRIBUTOR_OPTIONS
const UNKNOWN_BRAND = "Unknown Brand"
const INFUSED_BEVERAGES_TYPE = "INFUSED BEVERAGES"
const INFUSED_BEVERAGES_FILTER = "Infused Beverages"
const PRODUCT_TYPE_ORDER = [
  INFUSED_BEVERAGES_TYPE,
  "Edibles",
  "Badder",
  "Sauce & Diamonds",
  "Live Resin",
  "Rosin",
  "Other",
]

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function displayGroupName(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

function getNormalizedBrandName(value: string | null | undefined) {
  const normalized = (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[™®©]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

  return normalized || null
}

function preferDisplayName(current: string | undefined, candidate: string) {
  if (!current) return candidate
  if (current === current.toUpperCase() && candidate !== candidate.toUpperCase()) return candidate
  return current
}

function getSummaryDistributorName(distributorName: string) {
  return SUMMARY_DISTRIBUTORS.includes(distributorName)
    ? distributorName
    : "Other"
}

function getCategoryFilterLabel(value: string) {
  if (value === "all") {
    return "All categories"
  }

  if (value === INFUSED_BEVERAGES_TYPE) {
    return INFUSED_BEVERAGES_FILTER
  }

  return value
}

function itemMatchesCategoryFilter(item: InventoryItem, categoryFilter: string) {
  if (categoryFilter === "all") {
    return true
  }

  const productType = getProductType(item.name, item.brand)

  if (categoryFilter === INFUSED_BEVERAGES_TYPE) {
    return productType === INFUSED_BEVERAGES_TYPE
  }

  return item.category === categoryFilter || productType === categoryFilter
}

function getInitialLockedBrands(items: InventoryItem[]) {
  const lockedBrands: LockedBrandMap = {}

  for (const item of items) {
    const brandKey = getNormalizedBrandName(item.brand)

    if (brandKey) {
      lockedBrands[brandKey] = lockedBrands[brandKey] || Boolean(item.distributor_locked)
    }
  }

  return lockedBrands
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

function getProductType(productName: string, brandName: string | null | undefined) {
  const normalizedName = productName.toLowerCase()
  const normalizedBrand = brandName?.trim().toLowerCase() ?? ""
  const detectionText = `${normalizedName} ${normalizedBrand}`.trim()

  if (normalizedBrand === "cann" || normalizedBrand === "lagunitas hi-fi sessions") {
    return INFUSED_BEVERAGES_TYPE
  }

  if (
    /\b(drink|drinks|beverage|beverages|soda|tonic|can|cans|elixir)\b/.test(detectionText) ||
    /\bhi[-\s]?fi sessions?\b/.test(detectionText)
  ) {
    return INFUSED_BEVERAGES_TYPE
  }

  if (
    /\b(gummy|gummies|edible|edibles|chocolate|cookie|cookies|candy|mints|tablet|tablets)\b/.test(
      detectionText
    )
  ) {
    return "Edibles"
  }

  if (normalizedName.includes("badder")) {
    return "Badder"
  }

  if (normalizedName.includes("sauce") || normalizedName.includes("diamonds")) {
    return "Sauce & Diamonds"
  }

  if (normalizedName.includes("live")) {
    return "Live Resin"
  }

  if (normalizedName.includes("rosin")) {
    return "Rosin"
  }

  return "Other"
}

function groupItemsByProductType(items: InventoryItem[]): ProductTypeGroup[] {
  const productTypeMap = new Map<string, InventoryItem[]>()

  for (const item of items) {
    const productType = getProductType(item.name, item.brand)
    const productTypeItems = productTypeMap.get(productType) ?? []

    productTypeItems.push(item)
    productTypeMap.set(productType, productTypeItems)
  }

  return Array.from(productTypeMap.entries())
    .map(([name, productTypeItems]) => ({
      name,
      items: productTypeItems.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const aOrder = PRODUCT_TYPE_ORDER.indexOf(a.name)
      const bOrder = PRODUCT_TYPE_ORDER.indexOf(b.name)

      return aOrder - bOrder
    })
}

function getEffectiveDistributorName(
  item: InventoryItem,
  acceptedBrandDistributors: AcceptedBrandDistributorMap
) {
  const brandKey = getNormalizedBrandName(item.brand)
  const acceptedDistributor = brandKey ? acceptedBrandDistributors[brandKey]?.trim() : null

  if (acceptedDistributor) {
    return acceptedDistributor
  }

  if (isNonConsumableCategory(item.category)) {
    return ACCESSORIES_GROUP_NAME
  }

  const resolution = resolveDistributorBrand(item.brand, item.distributor)

  if (
    !item.distributor?.trim() &&
    resolution?.match_type === "soft" &&
    resolution.confidence === "medium"
  ) {
    return UNKNOWN_DISTRIBUTOR
  }

  if (resolution?.review_required) return UNKNOWN_DISTRIBUTOR

  return resolution?.distributor ?? UNKNOWN_DISTRIBUTOR
}

function getSuggestedDistributor(
  item: InventoryItem,
  acceptedBrandDistributors: AcceptedBrandDistributorMap,
  lockedBrands: LockedBrandMap
) {
  const brandKey = getNormalizedBrandName(item.brand)

  if (brandKey && lockedBrands[brandKey]) {
    return null
  }

  if ((brandKey && acceptedBrandDistributors[brandKey]?.trim()) || item.distributor?.trim()) {
    return null
  }

  const resolution = resolveDistributorBrand(item.brand, null)

  return resolution?.match_type === "soft" &&
    resolution.confidence === "medium" &&
    resolution.distributor
    ? resolution.distributor
    : null
}

function getEditableDistributorValue(
  item: InventoryItem,
  acceptedBrandDistributors: AcceptedBrandDistributorMap
) {
  const brandKey = getNormalizedBrandName(item.brand)
  const acceptedDistributor = brandKey ? acceptedBrandDistributors[brandKey]?.trim() : null

  if (acceptedDistributor) {
    return acceptedDistributor
  }

  const savedDistributor = item.distributor?.trim()

  if (savedDistributor) {
    return savedDistributor
  }

  const resolution = resolveDistributorBrand(item.brand, null)

  if (
    resolution &&
    !resolution.review_required &&
    !(resolution.match_type === "soft" && resolution.confidence === "medium")
  ) {
    return resolution.distributor
  }

  return ""
}

function groupItemsByDistributorAndBrand(
  items: InventoryItem[],
  acceptedBrandDistributors: AcceptedBrandDistributorMap
): DistributorGroup[] {
  const distributorMap = new Map<
    string,
    { displayName: string; brands: Map<string, { displayName: string; items: InventoryItem[] }> }
  >()

  for (const item of items) {
    const distributorName = getEffectiveDistributorName(item, acceptedBrandDistributors)
    const brandName = displayGroupName(item.brand, UNKNOWN_BRAND)
    const distributorKey = distributorName.trim().toLowerCase().replace(/\s+/g, " ")
    const brandKey = getNormalizedBrandName(brandName) ?? UNKNOWN_BRAND.toLowerCase()

    if (!distributorMap.has(distributorKey)) {
      distributorMap.set(distributorKey, { displayName: distributorName, brands: new Map() })
    }

    const distributorGroup = distributorMap.get(distributorKey)
    if (!distributorGroup) continue

    distributorGroup.displayName = preferDisplayName(distributorGroup.displayName, distributorName)

    if (!distributorGroup.brands.has(brandKey)) {
      distributorGroup.brands.set(brandKey, { displayName: brandName, items: [] })
    }

    const brandGroup = distributorGroup.brands.get(brandKey)
    if (!brandGroup) continue

    brandGroup.displayName = preferDisplayName(brandGroup.displayName, brandName)
    brandGroup.items.push(item)
  }

  return Array.from(distributorMap.values())
    .map((distributorGroup) => {
      const brands = Array.from(distributorGroup.brands.values())
        .map((brandGroup) => ({
          name: brandGroup.displayName,
          items: brandGroup.items.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return {
        name: distributorGroup.displayName,
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
      panelClass: "border-border bg-background",
    }
  }

  if (inventory < threshold) {
    return {
      label: "Low stock",
      badgeClass: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
      textClass: "text-yellow-400",
      panelClass: "border-border bg-background",
    }
  }

  if (inventory > threshold) {
    return {
      label: "In stock",
      badgeClass: "border-green-500/40 bg-green-500/10 text-green-400",
      textClass: "text-green-400",
      panelClass: "border-border bg-background",
    }
  }

  return {
    label: "At par",
    badgeClass: "border-border bg-background text-foreground",
    textClass: "text-foreground",
    panelClass: "border-border bg-background",
  }
}

export default function InventoryCards({ items, salesSummary }: Props) {
  const [salesWindowDays, setSalesWindowDays] = useState(salesSummary.window_days)
  const [targetDaysOfStock, setTargetDaysOfStock] = useState(
    salesSummary.target_days_of_stock
  )
  const [salesSummaryState, setSalesSummaryState] = useState<SalesParSummary>(salesSummary)
  const [salesMetrics, setSalesMetrics] = useState<SalesParMetric[]>(salesSummary.metrics)
  const [salesActionStatus, setSalesActionStatus] = useState<{
    tone: "success" | "error" | "progress"
    text: string
  } | null>(null)
  const [isRecalculating, setIsRecalculating] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "low" | "out">("all")
  const [viewMode, setViewMode] = useState<ViewMode>("compact")
  const [collapsedDistributors, setCollapsedDistributors] = useState<Record<string, boolean>>({})
  const [collapsedBrands, setCollapsedBrands] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groupItemsByDistributorAndBrand(items, {}).flatMap((distributorGroup) =>
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
  const [acceptedBrandDistributors, setAcceptedBrandDistributors] =
    useState<AcceptedBrandDistributorMap>({})
  const [lockedBrands, setLockedBrands] = useState<LockedBrandMap>(() =>
    getInitialLockedBrands(items)
  )
  const [savingBrandKeys, setSavingBrandKeys] = useState<Record<string, boolean>>({})
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null)

  const supabase = useMemo(() => createClient(), [])
  const salesMetricsMap = useMemo(
    () => new Map(salesMetrics.map((metric) => [metric.product_id, metric])),
    [salesMetrics]
  )
  const salesWindowLabel = `${salesWindowDays}-Day Sales`

  const categories = useMemo(() => {
    const savedCategories = Array.from(
      new Set(items.map((item) => item.category).filter(Boolean) as string[])
    )
      .filter(
        (savedCategory) =>
          savedCategory !== INFUSED_BEVERAGES_TYPE &&
          savedCategory !== INFUSED_BEVERAGES_FILTER
      )
      .sort()

    return [
      "all",
      INFUSED_BEVERAGES_TYPE,
      ...savedCategories,
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
        getEffectiveDistributorName(item, acceptedBrandDistributors).toLowerCase().includes(q) ||
        getSuggestedDistributor(item, acceptedBrandDistributors, lockedBrands)
          ?.toLowerCase()
          .includes(q) ||
        item.category?.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q)

      const matchesCategory = itemMatchesCategoryFilter(item, category)

      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "in" && isIn) ||
        (stockFilter === "low" && isLow) ||
        (stockFilter === "out" && isOut)

      return matchesQuery && matchesCategory && matchesStock
    })
  }, [items, query, category, stockFilter, acceptedBrandDistributors, lockedBrands])

  const groupedItems = useMemo(() => {
    return groupItemsByDistributorAndBrand(filteredItems, acceptedBrandDistributors)
  }, [filteredItems, acceptedBrandDistributors])

  const distributorSummary = useMemo(() => {
    const summary = new Map(SUMMARY_DISTRIBUTORS.map((distributor) => [distributor, 0]))

    for (const item of filteredItems) {
      const distributorName = getSummaryDistributorName(
        getEffectiveDistributorName(item, acceptedBrandDistributors)
      )

      summary.set(distributorName, (summary.get(distributorName) ?? 0) + 1)
    }

    return SUMMARY_DISTRIBUTORS.map((name) => ({
      name,
      count: summary.get(name) ?? 0,
    }))
  }, [filteredItems, acceptedBrandDistributors])

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
    return `${getEffectiveDistributorName(item, acceptedBrandDistributors)}::${displayGroupName(
      item.brand,
      UNKNOWN_BRAND
    )}`
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
              getEffectiveDistributorName(item, acceptedBrandDistributors)
                .toLowerCase()
                .includes(q) ||
              getSuggestedDistributor(item, acceptedBrandDistributors, lockedBrands)
                ?.toLowerCase()
                .includes(q) ||
              item.category?.toLowerCase().includes(q) ||
              item.sku?.toLowerCase().includes(q)

            const matchesCategory = itemMatchesCategoryFilter(item, categoryValue)

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

  async function recalculateSuggestedPars() {
    setIsRecalculating(true)
    setSalesActionStatus({
      tone: "progress",
      text: "Recalculating suggested pars...",
    })

    try {
      const response = await fetch(
        `/api/sales-pars?window_days=${salesWindowDays}&target_days=${targetDaysOfStock}`
      )
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data?.error || "Could not recalculate suggested pars.")
      }

      setSalesSummaryState({
        window_days: data.window_days ?? salesWindowDays,
        target_days_of_stock: data.target_days_of_stock ?? targetDaysOfStock,
        total_sales_quantity: data.total_sales_quantity ?? 0,
        matched_sales_rows: data.matched_sales_rows ?? 0,
        metrics: data.metrics ?? [],
      })
      setSalesMetrics(data.metrics ?? [])
      setSalesActionStatus({
        tone: "success",
        text: `Recalculated ${data.metrics?.length ?? 0} suggested pars.`,
      })
    } catch (error) {
      setSalesActionStatus({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Could not recalculate suggested pars.",
      })
    } finally {
      setIsRecalculating(false)
    }
  }

  async function applySuggestedPars() {
    setIsApplying(true)
    setSalesActionStatus({
      tone: "progress",
      text: "Applying suggested pars...",
    })

    try {
      const response = await fetch("/api/sales-pars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          window_days: salesWindowDays,
          target_days_of_stock: targetDaysOfStock,
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data?.error || "Could not apply suggested pars.")
      }

      setSalesSummaryState({
        window_days: data.window_days ?? salesWindowDays,
        target_days_of_stock: data.target_days_of_stock ?? targetDaysOfStock,
        total_sales_quantity: data.total_sales_quantity ?? 0,
        matched_sales_rows: data.matched_sales_rows ?? 0,
        metrics: data.metrics ?? [],
      })
      setSalesMetrics(data.metrics ?? [])
      setSalesActionStatus({
        tone: "success",
        text: `Applied suggested pars to ${data.updated_count ?? data.metrics?.length ?? 0} products.`,
      })
    } catch (error) {
      setSalesActionStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not apply suggested pars.",
      })
    } finally {
      setIsApplying(false)
    }
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

  async function toggleBrandLock(brandGroup: BrandGroup, locked: boolean) {
    const sampleItem = brandGroup.items[0]
    const brandKey = getNormalizedBrandName(sampleItem?.brand ?? brandGroup.name)

    if (!brandKey) return

    const brandName = displayGroupName(sampleItem?.brand ?? brandGroup.name, UNKNOWN_BRAND)
    const affectedProductIds = items
      .filter((candidate) => getNormalizedBrandName(candidate.brand) === brandKey)
      .map((candidate) => candidate.id)

    if (affectedProductIds.length === 0) return

    const previousLocked = lockedBrands[brandKey] ?? false

    setSaveStatus(null)
    setSavingBrandKeys((prev) => ({
      ...prev,
      [brandKey]: true,
    }))
    setLockedBrands((prev) => ({
      ...prev,
      [brandKey]: locked,
    }))

    try {
      const { error } = await supabase
        .from("products")
        .update({ distributor_locked: locked })
        .in("id", affectedProductIds)

      if (error) {
        throw error
      }

      setSaveStatus({
        tone: "success",
        text: `${locked ? "Locked" : "Unlocked"} distributor for ${brandName}.`,
      })
    } catch (error) {
      console.error("Failed to save distributor lock state", error)

      setLockedBrands((prev) => ({
        ...prev,
        [brandKey]: previousLocked,
      }))
      setSaveStatus({
        tone: "error",
        text:
          error instanceof Error
            ? `Could not ${locked ? "lock" : "unlock"} distributor for ${brandName}: ${error.message}`
            : `Could not ${locked ? "lock" : "unlock"} distributor for ${brandName}.`,
      })
    } finally {
      setSavingBrandKeys((prev) => ({
        ...prev,
        [brandKey]: false,
      }))
    }
  }

  async function acceptSuggestedDistributorForBrand(item: InventoryItem, distributor: string) {
    const brandKey = getNormalizedBrandName(item.brand)

    if (!brandKey) return

    if (lockedBrands[brandKey]) return

    const brandName = displayGroupName(item.brand, UNKNOWN_BRAND)
    const affectedProductIds = items
      .filter((candidate) => getNormalizedBrandName(candidate.brand) === brandKey)
      .map((candidate) => candidate.id)

    if (affectedProductIds.length === 0) return

    const previousDistributorName = getEffectiveDistributorName(item, acceptedBrandDistributors)
    const previousAcceptedDistributor = acceptedBrandDistributors[brandKey]
    const previousBrandKey = `${previousDistributorName}::${brandName}`
    const nextBrandKey = `${distributor}::${brandName}`

    setSaveStatus(null)
    setSavingBrandKeys((prev) => ({
      ...prev,
      [brandKey]: true,
    }))
    setAcceptedBrandDistributors((prev) => ({
      ...prev,
      [brandKey]: distributor,
    }))
    setCollapsedDistributors((prev) => ({
      ...prev,
      [distributor]: false,
    }))
    setCollapsedBrands((prev) => ({
      ...prev,
      [previousBrandKey]: false,
      [nextBrandKey]: false,
    }))

    try {
      const { error } = await supabase
        .from("products")
        .update({ distro: distributor })
        .in("id", affectedProductIds)

      if (error) {
        throw error
      }

      setSaveStatus({
        tone: "success",
        text: `Saved ${distributor} for ${brandName}.`,
      })
    } catch (error) {
      console.error("Failed to save distributor selection", error)

      setAcceptedBrandDistributors((prev) => {
        const next = { ...prev }

        if (previousAcceptedDistributor) {
          next[brandKey] = previousAcceptedDistributor
        } else {
          delete next[brandKey]
        }

        return next
      })
      setSaveStatus({
        tone: "error",
        text:
          error instanceof Error
            ? `Could not save distributor for ${brandName}: ${error.message}`
            : `Could not save distributor for ${brandName}.`,
      })
    } finally {
      setSavingBrandKeys((prev) => ({
        ...prev,
        [brandKey]: false,
      }))
    }
  }

  function handleDistributorChange(item: InventoryItem, distributor: string) {
    if (!distributor) return

    void acceptSuggestedDistributorForBrand(item, distributor)
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
    const currentPar = item.current_par ?? threshold
    const salesMetric = salesMetricsMap.get(item.id)
    const suggestedPar = salesMetric?.suggested_par ?? item.suggested_par ?? 0
    const avgDailySales = salesMetric?.avg_daily_sales ?? item.avg_daily_sales ?? 0
    const windowSales = salesMetric?.window_sales ?? item.window_sales ?? 0
    const cost = item.cost ?? 0
    const price = item.price ?? 0
    const margin = price > 0 && cost > 0 ? ((price - cost) / price) * 100 : null
    const percentChange = item.cost_change_percent ?? 0
    const isCostUp = item.cost_change_direction === "up"
    const isCostDown = item.cost_change_direction === "down"
    const hasCostChange = Math.abs(percentChange) > 0
    const previousCostLabel =
      item.previous_cost != null ? `Previous cost: ${currencyFormatter.format(item.previous_cost)}` : undefined
    const tone = stockTone(inventory, threshold)
    const isOut = inventory <= 0
    const isExpanded = isItemExpanded(item.id)
    const needsReorder = inventory < threshold
    const brandKey = getNormalizedBrandName(item.brand)
    const isBrandLocked = brandKey ? lockedBrands[brandKey] ?? false : false
    const isSavingDistributor = brandKey ? savingBrandKeys[brandKey] ?? false : false
    const suggestedDistributor = getSuggestedDistributor(
      item,
      acceptedBrandDistributors,
      lockedBrands
    )
    const selectedDistributor = getEditableDistributorValue(item, acceptedBrandDistributors)
    const distributorControlsDisabled = isSavingDistributor || isBrandLocked
    const showBrandApplyHelper = !isBrandLocked

    if (!isExpanded) {
      return (
        <article
          key={item.id}
          className={cn(
            suggestedDistributor
              ? showBrandApplyHelper
                ? "h-[150px]"
                : "h-[132px]"
              : showBrandApplyHelper
                ? "h-[124px]"
                : "h-[108px]",
            "rounded-lg border border-border bg-card p-2 font-sans shadow-sm transition hover:bg-muted"
          )}
        >
          <div className="flex h-full min-h-0 flex-col justify-between gap-1">
            <div className="flex min-w-0 items-start justify-between gap-1.5">
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
                  {getCompactDisplayName(item.name, brandName)}
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

            <div className="flex min-w-0 items-center justify-between gap-1.5 text-xs leading-tight text-muted-foreground">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 items-center gap-x-1.5 whitespace-nowrap">
                  <span className={tone.textClass}>Inv {inventory}</span>
                  <span aria-hidden="true">·</span>
                  <span>Par {currentPar}</span>
                  <span aria-hidden="true">·</span>
                  <span>Sug {suggestedPar}</span>
                </div>

                <div className="flex min-w-0 items-center gap-x-1.5 whitespace-nowrap text-[10px] font-medium text-emerald-400">
                  <span>Cost: {currencyFormatter.format(cost)}</span>
                  {hasCostChange ? (
                    <span
                      className={cn(
                        isCostUp && "text-red-400",
                        isCostDown && "text-green-400",
                        !isCostUp && !isCostDown && "text-muted-foreground"
                      )}
                      title={previousCostLabel}
                    >
                      {isCostUp ? "↑" : isCostDown ? "↓" : "→"} {Math.abs(percentChange).toFixed(1)}%
                    </span>
                  ) : null}
                </div>

                <div className="flex min-w-0 items-center gap-x-1.5 whitespace-nowrap text-[10px] text-muted-foreground">
                  <span><span
  className={
    margin === null
      ? "text-muted-foreground"
      : margin < 30
      ? "text-red-400"
      : margin < 50
      ? "text-yellow-400"
      : "text-green-400"
  }
>
  Margin: <span
  className={
    margin === null
      ? "text-muted-foreground"
      : margin < 30
      ? "text-red-400"
      : margin < 50
      ? "text-yellow-400"
      : "text-green-400"
  }
>
  {margin !== null ? `${margin.toFixed(1)}%` : "—"}
</span>
{margin !== null && margin < 30 && (
  <div className="text-[10px] text-red-400">
    Low margin — review pricing
  </div>
)}
</span></span>
                </div>
              </div>

              <CompactQuantityStepper
                value={getQty(item.id)}
                onDecrease={() => setQty(item.id, String(getQty(item.id) - 1))}
                onIncrease={() => setQty(item.id, String(getQty(item.id) + 1))}
                productName={item.name}
              />
            </div>
            <DistributorSelect
              value={selectedDistributor}
              disabled={distributorControlsDisabled}
              productName={item.name}
              onChange={(distributor) => handleDistributorChange(item, distributor)}
              compact
            />
            {showBrandApplyHelper ? (
              <p className="truncate text-[10px] leading-none text-muted-foreground">
                Applies to all {brandName} items
              </p>
            ) : null}
            {suggestedDistributor ? (
              <SuggestedDistributor
                distributor={suggestedDistributor}
                disabled={distributorControlsDisabled}
                showDropdown={false}
                className="max-w-full gap-1.5 [&_[data-slot=badge]]:max-w-full [&_[data-slot=badge]]:truncate [&_[data-slot=badge]]:px-2 [&_[data-slot=badge]]:text-[10px]"
              />
            ) : null}
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
          "rounded-[1.5rem] border border-border bg-card font-sans shadow-sm"
        )}
      >
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
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
                {suggestedDistributor ? (
                  <SuggestedDistributor
                    distributor={suggestedDistributor}
                    disabled={distributorControlsDisabled}
                    showDropdown={false}
                  />
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-tight text-muted-foreground">
                {item.brand || UNKNOWN_BRAND}
              </p>
            </div>

            <button
              type="button"
              onClick={() => toggleItemExpansion(item.id)}
              className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted hover:text-foreground"
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? "Collapse" : "Expand"} details for ${item.name}`}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {isExpanded ? "Collapse" : "Expand"}
            </button>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_170px_170px]">
            <div className="rounded-2xl border border-border bg-background px-4 py-3 md:col-span-2 xl:col-span-1">
              <div className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Distributor
              </div>
              <DistributorSelect
                value={selectedDistributor}
                disabled={distributorControlsDisabled}
                productName={item.name}
                onChange={(distributor) => handleDistributorChange(item, distributor)}
                className="mt-2"
              />
              {showBrandApplyHelper ? (
                <p className="mt-2 text-xs leading-tight text-muted-foreground">
                  Applies to all {brandName} items
                </p>
              ) : null}
            </div>
            <SummaryPanel
              label="Current Inventory"
              value={String(inventory)}
              toneClass={tone.textClass}
              emphasized
            />
            <SummaryPanel label="Current Par" value={String(currentPar)} />
            <div className={cn("rounded-2xl border px-4 py-3", tone.panelClass)}>
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
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
            <div className="rounded-[1.35rem] border border-border bg-background p-4 sm:p-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <DetailPanelItem label="Brand" value={item.brand || UNKNOWN_BRAND} />
                <DetailPanelItem label="Category" value={item.category || "—"} />
                <DetailPanelItem label="SKU" value={item.sku || "—"} />
                <DetailPanelItem label="Current Par" value={String(currentPar)} />
                <DetailPanelItem label="Suggested Par" value={String(suggestedPar)} />
                <DetailPanelItem
                  label="Avg Daily Sales"
                  value={formatMetricValue(avgDailySales)}
                />
                <DetailPanelItem
                  label={salesWindowLabel}
                  value={formatMetricValue(windowSales)}
                />
                <DetailPanelItem
                  label="Price"
                  value={item.price != null ? currencyFormatter.format(item.price) : "—"}
                />
                <DetailPanelItem label="Cost" value={currencyFormatter.format(cost)} />
                <DetailPanelItem
                  label="Margin"
                  value={margin != null ? `${margin.toFixed(1)}%` : "—"}
                />
                <DetailPanelItem
                  label="Cost Change"
                  value={
                    hasCostChange
                      ? `${isCostUp ? "↑" : isCostDown ? "↓" : "→"} ${Math.abs(percentChange).toFixed(1)}%`
                      : "—"
                  }
                  valueClassName={cn(isCostUp && "text-red-400", isCostDown && "text-green-400")}
                />
                <DetailPanelItem
                  label="Inventory"
                  value={String(inventory)}
                  valueClassName={tone.textClass}
                />

                <div className="rounded-2xl border border-border bg-card px-4 py-3 md:col-span-2 xl:col-span-2">
                  <div className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                    Add to order
                  </div>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="sm:w-32">
                      <label className="mb-1 block text-xs uppercase tracking-[0.04em] text-muted-foreground">
                        Qty to order
                      </label>
                      <Input
                        type="number"
                        min={1}
                        value={getQty(item.id)}
                        onChange={(event) => setQty(item.id, event.target.value)}
                        className="border-border bg-background font-sans text-foreground focus-visible:border-ring"
                      />
                    </div>

                    <Button
                      type="button"
                      onClick={() => addToOrder(item)}
                      disabled={isOut || addingId === item.id}
                      className="border border-border bg-background text-foreground hover:bg-muted hover:text-foreground sm:min-w-40"
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      {addingId === item.id ? "Adding..." : "Add to Order"}
                    </Button>
                  </div>

                  {message[item.id] ? (
                    <p className="mt-3 text-xs leading-tight text-muted-foreground">{message[item.id]}</p>
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
      <Card className="rounded-[1.75rem] border border-border bg-card font-sans text-foreground shadow-sm">
        <CardHeader className="gap-4 border-b border-border pb-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <CardTitle className="font-sans text-2xl font-semibold tracking-tight text-blue-400">
                Inventory Workspace
              </CardTitle>
              <p className="font-sans text-sm text-muted-foreground">
                Scan the essentials in compact mode and open a single product only when you need
                the extra details or actions.
              </p>
            </div>

            <div className="inline-flex rounded-full border border-border bg-background p-1">
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
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                placeholder="Search name, distributor, brand, category, or SKU"
                className="border-border bg-background pl-9 font-sans text-foreground placeholder:text-muted-foreground focus-visible:border-ring"
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
                    "rounded-full border-border",
                    category === value
                      ? "bg-muted text-foreground hover:bg-muted"
                      : "bg-background text-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {getCategoryFilterLabel(value)}
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
                "rounded-full border-border",
                stockFilter === "all"
                  ? "bg-muted text-foreground hover:bg-muted"
                  : "bg-background text-foreground hover:bg-muted hover:text-foreground"
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
                "rounded-full border-border",
                stockFilter === "in"
                  ? "bg-muted text-foreground hover:bg-muted"
                  : "bg-background text-foreground hover:bg-muted hover:text-foreground"
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
                "rounded-full border-border",
                stockFilter === "low"
                  ? "bg-muted text-foreground hover:bg-muted"
                  : "bg-background text-foreground hover:bg-muted hover:text-foreground"
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
                "rounded-full border-border",
                stockFilter === "out"
                  ? "bg-muted text-foreground hover:bg-muted"
                  : "bg-background text-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              Out of stock
            </Button>
          </div>

          <div className="grid gap-3 rounded-2xl border border-border bg-background/70 p-4 xl:grid-cols-[minmax(0,220px)_minmax(0,220px)_auto_auto_minmax(0,1fr)] xl:items-end">
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Sales window
              </span>
              <select
                value={salesWindowDays}
                onChange={(event) => setSalesWindowDays(Number(event.target.value))}
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring"
              >
                {[7, 14, 30, 60, 90].map((option) => (
                  <option key={option} value={option}>
                    {option} days
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Target stock days
              </span>
              <select
                value={targetDaysOfStock}
                onChange={(event) => setTargetDaysOfStock(Number(event.target.value))}
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring"
              >
                {[7, 14, 21, 30].map((option) => (
                  <option key={option} value={option}>
                    {option} days
                  </option>
                ))}
              </select>
            </label>

            <Button
              type="button"
              variant="outline"
              onClick={() => void recalculateSuggestedPars()}
              disabled={isRecalculating || isApplying}
              className="h-10 justify-center border-border bg-background text-foreground hover:bg-muted hover:text-foreground"
            >
              <RefreshCw className={cn("size-4", isRecalculating && "animate-spin")} />
              Recalculate Suggested Pars
            </Button>

            <Button
              type="button"
              onClick={() => void applySuggestedPars()}
              disabled={isApplying || isRecalculating}
              className="h-10 justify-center"
            >
              <CheckCheck className="size-4" />
              Apply Suggested Pars
            </Button>

            <div className="text-xs leading-5 text-muted-foreground xl:col-span-5">
              Suggested pars are based on {salesWindowDays} days of sales and a {targetDaysOfStock}
              -day stock target.
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatBox label="Products with sales" value={salesMetrics.filter((metric) => metric.window_sales > 0).length} tone="neutral" />
            <StatBox label="Window sales" value={salesSummaryState.total_sales_quantity} tone="neutral" />
            <StatBox label="Matched rows" value={salesSummaryState.matched_sales_rows} tone="neutral" />
            <StatBox label="Suggested pars" value={salesMetrics.filter((metric) => metric.suggested_par > 0).length} tone="neutral" />
          </section>

          {salesActionStatus ? (
            <div
              className={cn(
                "rounded-xl border px-4 py-3 text-sm font-medium",
                salesActionStatus.tone === "success"
                  ? "border-green-500/30 bg-green-500/10 text-green-300"
                  : salesActionStatus.tone === "error"
                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                    : "border-sky-500/30 bg-sky-500/10 text-sky-300"
              )}
            >
              {salesActionStatus.text}
            </div>
          ) : null}

          {saveStatus ? (
            <div
              className={cn(
                "rounded-xl border px-4 py-3 text-sm font-medium",
                saveStatus.tone === "success"
                  ? "border-green-500/30 bg-green-500/10 text-green-300"
                  : "border-red-500/40 bg-red-500/10 text-red-300"
              )}
            >
              {saveStatus.text}
            </div>
          ) : null}

          <section className="rounded-2xl border border-border bg-background/70 p-3 sm:p-4">
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
              {distributorSummary.map((summary) => (
                <div
                  key={summary.name}
                  className="rounded-lg border border-border bg-muted px-3 py-2"
                >
                  <div className="truncate text-[11px] font-semibold text-muted-foreground">
                    {summary.name}
                  </div>
                  <div className="mt-1 text-sm font-bold tabular-nums text-foreground">
                    {summary.count} items
                  </div>
                </div>
              ))}
            </div>
          </section>

          {groupedItems.length > 0 ? (
            groupedItems.map((distributorGroup) => {
              const distributorCollapsed = collapsedDistributors[distributorGroup.name] ?? false

              return (
                <section
                  key={distributorGroup.name}
                  className="overflow-hidden rounded-2xl border border-border bg-background/60"
                >
                  <button
                    type="button"
                    onClick={() => toggleDistributor(distributorGroup.name)}
                    className="flex w-full items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 text-left transition hover:bg-muted"
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
                    <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                      {distributorGroup.itemsCount} items
                    </span>
                  </button>

                  {!distributorCollapsed ? (
                    <div className="space-y-3 p-3 sm:p-4">
                      {distributorGroup.brands.map((brandGroup) => {
                        const brandKey = `${distributorGroup.name}::${brandGroup.name}`
                        const brandCollapsed = collapsedBrands[brandKey] ?? true
                        const productTypeGroups = groupItemsByProductType(brandGroup.items)
                        const normalizedBrandKey = getNormalizedBrandName(
                          brandGroup.items[0]?.brand ?? brandGroup.name
                        )
                        const brandLocked = normalizedBrandKey
                          ? lockedBrands[normalizedBrandKey] ?? false
                          : false
                        const brandSaving = normalizedBrandKey
                          ? savingBrandKeys[normalizedBrandKey] ?? false
                          : false

                        return (
                          <section
                            key={brandKey}
                            className="rounded-xl border border-border bg-background"
                          >
                            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => toggleBrand(distributorGroup.name, brandGroup.name)}
                                className="flex min-w-0 flex-1 items-center gap-2 text-left transition hover:text-foreground"
                                aria-expanded={!brandCollapsed}
                              >
                                {brandCollapsed ? (
                                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                )}
                                <span className="truncate text-sm font-semibold text-foreground">
                                  {brandGroup.name}
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {brandGroup.items.length} items
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  void toggleBrandLock(brandGroup, !brandLocked)
                                }}
                                disabled={brandSaving}
                                className={cn(
                                  "shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold transition",
                                  brandLocked
                                    ? "border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
                                    : "border-border bg-card text-foreground hover:bg-muted hover:text-foreground",
                                  brandSaving && "cursor-not-allowed opacity-60"
                                )}
                                aria-pressed={brandLocked}
                              >
                                {brandLocked ? "🔒 Locked" : "🔓 Unlock"}
                              </button>
                            </div>

                            {!brandCollapsed ? (
                              <div className="space-y-5 p-3">
                                {productTypeGroups.map((productTypeGroup) => (
                                  <section
                                    key={`${brandKey}::${productTypeGroup.name}`}
                                    className="mt-5 first:mt-0"
                                  >
                                    <div className="mb-2 border-b border-orange-500/30 pb-1">
                                      <div className="text-[11px] font-bold uppercase tracking-wide text-orange-400">
                                        {productTypeGroup.name}
                                      </div>
                                    </div>
                                    <div
                                      className={cn(
                                        viewMode === "compact"
                                          ? "grid gap-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-5"
                                          : "space-y-3"
                                      )}
                                    >
                                      {productTypeGroup.items.map((item) =>
                                        renderInventoryItem(item, brandGroup.name)
                                      )}
                                    </div>
                                  </section>
                                ))}
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
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
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
        active ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function StatBox({
  label,
  tone,
  value,
}: {
  label: string
  tone: "neutral" | "success"
  value: number
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-4",
        tone === "neutral" && "border-border bg-background/80",
        tone === "success" && "border-emerald-200 bg-emerald-50/70"
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {formatNumber(value)}
      </div>
    </div>
  )
}

function DistributorSelect({
  className,
  compact = false,
  disabled,
  onChange,
  productName,
  value,
}: {
  className?: string
  compact?: boolean
  disabled?: boolean
  onChange: (distributor: string) => void
  productName: string
  value: string
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={`Distributor for ${productName}`}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "w-full rounded-lg border border-border bg-background font-medium text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60",
        compact ? "h-6 px-2 text-[10px]" : "h-8 px-2.5 text-sm",
        className
      )}
    >
      <option value="">Choose distributor</option>
      {DISTRIBUTOR_OPTIONS.map((distributor) => (
        <option key={distributor} value={distributor}>
          {distributor}
        </option>
      ))}
    </select>
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
    <div className="rounded-2xl border border-border bg-background px-4 py-3">
      <div className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
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
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className={cn("mt-1 text-sm font-medium text-foreground", valueClassName)}>{value}</div>
    </div>
  )
}

function formatMetricValue(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
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
    <span className="inline-flex items-center gap-1 align-middle text-xs text-foreground">
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
