import {
  buildNormalizedProductKey,
  normalizeLooseProductName,
  normalizeSku,
} from "@/app/lib/inventoryNormalization"

export type SalesHistoryRow = {
  sku: string | null
  product_name: string
  brand_name: string | null
  quantity_sold: number | string | null
  sale_date: string
}

export type ParCalculatorProductRow = {
  id: string
  sku: string | null
  brand_name: string | null
  product_name: string | null
}

export type SalesVelocityMetric = {
  product_id: string
  sku: string | null
  product_name: string
  brand_name: string | null
  window_sales: number
  daily_velocity: number
  suggested_par: number
  suggested_reorder_point: number
  matched_sales_rows: number
}

export type SalesVelocitySummary = {
  window_days: number
  target_days_of_inventory: number
  lead_time_days: number
  total_sales_quantity: number
  matched_sales_rows: number
  metrics: SalesVelocityMetric[]
}

type ProductLookup = {
  skuMap: Map<string, string>
  brandNameMap: Map<string, string>
  looseNameMap: Map<string, string>
}

const DEFAULT_TARGET_DAYS = 7
const DEFAULT_LEAD_TIME_DAYS = 3
const DEFAULT_WINDOW_DAYS = 30

function asQuantity(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0

  const parsed = Number(String(value ?? "").replace(/[$,]/g, "").trim())
  return Number.isFinite(parsed) ? parsed : 0
}

export function calculateDailyVelocity(windowSales: number, windowDays = DEFAULT_WINDOW_DAYS) {
  const safeWindowDays = Math.max(1, Math.round(windowDays))
  const safeSales = Math.max(0, windowSales)

  return safeSales / safeWindowDays
}

export function calculateSuggestedPar(dailyVelocity: number, targetDays = DEFAULT_TARGET_DAYS) {
  const safeDailyVelocity = Math.max(0, dailyVelocity)
  const safeTargetDays = Math.max(0, Math.round(targetDays))

  return Math.max(0, Math.ceil(safeDailyVelocity * safeTargetDays))
}

export function calculateSuggestedReorderPoint(
  dailyVelocity: number,
  leadTimeDays = DEFAULT_LEAD_TIME_DAYS
) {
  const safeDailyVelocity = Math.max(0, dailyVelocity)
  const safeLeadTimeDays = Math.max(0, Math.round(leadTimeDays))

  return Math.max(0, Math.ceil(safeDailyVelocity * safeLeadTimeDays))
}

function buildProductLookup(products: ParCalculatorProductRow[]): ProductLookup {
  const skuMap = new Map<string, string>()
  const brandNameMap = new Map<string, string>()
  const looseNameMap = new Map<string, string>()

  for (const product of products) {
    const sku = normalizeSku(product.sku)
    const brandNameKey = buildNormalizedProductKey(product.brand_name, product.product_name)
    const looseKey = `${normalizeLooseProductName(product.brand_name)}__${normalizeLooseProductName(
      product.product_name
    )}`

    if (sku && !skuMap.has(sku)) {
      skuMap.set(sku, product.id)
    }

    if (brandNameKey && !brandNameMap.has(brandNameKey)) {
      brandNameMap.set(brandNameKey, product.id)
    }

    if (looseKey && !looseNameMap.has(looseKey)) {
      looseNameMap.set(looseKey, product.id)
    }
  }

  return {
    skuMap,
    brandNameMap,
    looseNameMap,
  }
}

function matchProductId(row: SalesHistoryRow, lookup: ProductLookup) {
  const sku = normalizeSku(row.sku)
  if (sku) {
    const skuMatch = lookup.skuMap.get(sku)
    if (skuMatch) return skuMatch
  }

  const exactKey = buildNormalizedProductKey(row.brand_name, row.product_name)
  if (exactKey) {
    const exactMatch = lookup.brandNameMap.get(exactKey)
    if (exactMatch) return exactMatch
  }

  const looseKey = `${normalizeLooseProductName(row.brand_name)}__${normalizeLooseProductName(
    row.product_name
  )}`
  if (looseKey) {
    const looseMatch = lookup.looseNameMap.get(looseKey)
    if (looseMatch) return looseMatch
  }

  return null
}

export function buildSalesVelocitySummary({
  products,
  salesRows,
  windowDays = DEFAULT_WINDOW_DAYS,
  targetDaysOfInventory = DEFAULT_TARGET_DAYS,
  leadTimeDays = DEFAULT_LEAD_TIME_DAYS,
}: {
  products: ParCalculatorProductRow[]
  salesRows: SalesHistoryRow[]
  windowDays?: number
  targetDaysOfInventory?: number
  leadTimeDays?: number
}): SalesVelocitySummary {
  const lookup = buildProductLookup(products)
  const salesByProductId = new Map<string, { windowSales: number; matchedSalesRows: number }>()

  for (const row of salesRows) {
    const productId = matchProductId(row, lookup)
    if (!productId) continue

    const quantitySold = Math.max(0, Math.round(asQuantity(row.quantity_sold)))
    if (quantitySold <= 0) continue

    const current = salesByProductId.get(productId) ?? { windowSales: 0, matchedSalesRows: 0 }
    current.windowSales += quantitySold
    current.matchedSalesRows += 1
    salesByProductId.set(productId, current)
  }

  const metrics: SalesVelocityMetric[] = products
    .map((product) => {
      const sales = salesByProductId.get(product.id)
      const windowSales = sales?.windowSales ?? 0
      const dailyVelocity = calculateDailyVelocity(windowSales, windowDays)

      return {
        product_id: product.id,
        sku: product.sku,
        product_name: product.product_name || "Unnamed Product",
        brand_name: product.brand_name,
        window_sales: windowSales,
        daily_velocity: dailyVelocity,
        suggested_par: calculateSuggestedPar(dailyVelocity, targetDaysOfInventory),
        suggested_reorder_point: calculateSuggestedReorderPoint(dailyVelocity, leadTimeDays),
        matched_sales_rows: sales?.matchedSalesRows ?? 0,
      }
    })
    .sort((a, b) => {
      const brandCompare = (a.brand_name ?? "").localeCompare(b.brand_name ?? "")
      if (brandCompare !== 0) return brandCompare

      return a.product_name.localeCompare(b.product_name)
    })

  return {
    window_days: windowDays,
    target_days_of_inventory: targetDaysOfInventory,
    lead_time_days: leadTimeDays,
    total_sales_quantity: salesRows.reduce(
      (total, row) => total + Math.max(0, Math.round(asQuantity(row.quantity_sold))),
      0
    ),
    matched_sales_rows: Array.from(salesByProductId.values()).reduce(
      (total, current) => total + current.matchedSalesRows,
      0
    ),
    metrics,
  }
}
