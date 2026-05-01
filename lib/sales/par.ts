import type { SupabaseClient } from "@supabase/supabase-js"
import { asNumber, asString, makeProductKey } from "@/lib/import/shared"

type ProductRow = {
  id: string
  sku: string | null
  brand_name: string | null
  product_name: string
}

type InventoryRow = {
  product_id: string
  on_hand: number | string | null
  par_level: number | string | null
  last_counted_at?: string | null
}

type SalesHistoryRow = {
  sku: string | null
  product_name: string
  brand_name: string | null
  quantity_sold: number | string | null
  sale_date: string
}

export type SalesImportRow = {
  sku: string | null
  product_name: string
  brand_name: string | null
  quantity_sold: number
  sale_date: string
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

export type SalesParSummary = {
  window_days: number
  target_days_of_stock: number
  total_sales_quantity: number
  matched_sales_rows: number
  metrics: SalesParMetric[]
}

export type SuggestedParUpdate = {
  product_id: string
  on_hand: number
  par_level: number
  last_counted_at: string
}

type SalesProductLookup = {
  productBySku: Map<string, string>
  productByBrandAndName: Map<string, string>
}

const SALES_WINDOW_OPTIONS = [7, 14, 30, 60, 90]
const TARGET_DAYS_OPTIONS = [7, 14, 21, 30]

export function getSalesWindowOptions() {
  return SALES_WINDOW_OPTIONS
}

export function getTargetDaysOptions() {
  return TARGET_DAYS_OPTIONS
}

export function normalizeSalesSku(value: unknown) {
  return asString(value).toLowerCase()
}

export function toIsoDateString(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  const raw = String(value ?? "").trim()

  if (!raw) return ""

  const directDate = new Date(raw)
  if (!Number.isNaN(directDate.getTime())) {
    return directDate.toISOString().slice(0, 10)
  }

  return raw.replace(/\//g, "-").slice(0, 10)
}

export function cleanSalesImportRow(row: Partial<Record<string, unknown>>): SalesImportRow | null {
  const productName = asString(row.product_name || row.name || row.product || row.item || row.description)
  const quantitySold = asNumber(
    row.quantity_sold || row.qty || row.quantity || row.sold || row.units || row.count
  )
  const saleDate = toIsoDateString(row.sale_date || row.date || row.sold_at || row.transaction_date)

  if (!productName || !saleDate || quantitySold == null || quantitySold <= 0) {
    return null
  }

  return {
    sku: asString(row.sku || row.product_sku || row.item_sku || row.barcode || row.upc) || null,
    product_name: productName,
    brand_name: asString(row.brand_name || row.brand) || null,
    quantity_sold: Math.round(quantitySold),
    sale_date: saleDate,
  }
}

function buildSalesProductLookup(products: ProductRow[]): SalesProductLookup {
  const productBySku = new Map<string, string>()
  const productByBrandAndName = new Map<string, string>()

  for (const product of products) {
    const sku = normalizeSalesSku(product.sku)
    if (sku && !productBySku.has(sku)) {
      productBySku.set(sku, product.id)
    }

    const brandAndName = makeProductKey(product.brand_name, product.product_name)
    if (brandAndName && !productByBrandAndName.has(brandAndName)) {
      productByBrandAndName.set(brandAndName, product.id)
    }
  }

  return {
    productBySku,
    productByBrandAndName,
  }
}

function getMatchedProductId(row: SalesHistoryRow, lookup: SalesProductLookup) {
  const rowSku = normalizeSalesSku(row.sku)
  if (rowSku) {
    const skuMatch = lookup.productBySku.get(rowSku)
    if (skuMatch) return skuMatch
  }

  return lookup.productByBrandAndName.get(makeProductKey(row.brand_name, row.product_name)) ?? null
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getWindowStartDate(windowDays: number) {
  const today = new Date()
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))

  utcToday.setUTCDate(utcToday.getUTCDate() - Math.max(0, windowDays - 1))

  return utcToday
}

export function getWindowDateRange(windowDays: number) {
  const startDate = getWindowStartDate(windowDays)
  const endDate = new Date()
  const utcEndDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()))

  return {
    startDate: formatDateOnly(startDate),
    endDate: formatDateOnly(utcEndDate),
  }
}

export function calculateSuggestedParMetrics({
  products,
  inventoryRows,
  salesRows,
  windowDays,
  targetDaysOfStock,
}: {
  products: ProductRow[]
  inventoryRows: InventoryRow[]
  salesRows: SalesHistoryRow[]
  windowDays: number
  targetDaysOfStock: number
}): SalesParSummary {
  const lookup = buildSalesProductLookup(products)
  const salesByProductId = new Map<string, { windowSales: number; matchedSalesRows: number }>()

  for (const row of salesRows) {
    const productId = getMatchedProductId(row, lookup)
    if (!productId) continue

    const quantitySold = Math.max(0, Math.round(asNumber(row.quantity_sold) ?? 0))
    if (quantitySold <= 0) continue

    const current = salesByProductId.get(productId) ?? { windowSales: 0, matchedSalesRows: 0 }
    current.windowSales += quantitySold
    current.matchedSalesRows += 1
    salesByProductId.set(productId, current)
  }

  const inventoryByProductId = new Map(inventoryRows.map((row) => [row.product_id, row]))
  const metrics: SalesParMetric[] = products
    .map((product) => {
      const sales = salesByProductId.get(product.id)
      const windowSales = sales?.windowSales ?? 0
      const avgDailySales = windowDays > 0 ? windowSales / windowDays : 0
      const suggestedPar = windowSales > 0 ? Math.max(1, Math.ceil(avgDailySales * targetDaysOfStock)) : 0
      const currentPar = Math.max(0, Math.round(asNumber(inventoryByProductId.get(product.id)?.par_level) ?? 0))

      return {
        product_id: product.id,
        sku: product.sku,
        product_name: product.product_name,
        brand_name: product.brand_name,
        current_par: currentPar,
        suggested_par: suggestedPar,
        avg_daily_sales: avgDailySales,
        window_sales: windowSales,
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
    target_days_of_stock: targetDaysOfStock,
    total_sales_quantity: salesRows.reduce(
      (total, row) => total + Math.max(0, Math.round(asNumber(row.quantity_sold) ?? 0)),
      0
    ),
    matched_sales_rows: Array.from(salesByProductId.values()).reduce(
      (total, current) => total + current.matchedSalesRows,
      0
    ),
    metrics,
  }
}

export async function loadSuggestedParSummary(
  supabase: SupabaseClient,
  {
    windowDays,
    targetDaysOfStock,
  }: {
    windowDays: number
    targetDaysOfStock: number
  }
) {
  const { startDate, endDate } = getWindowDateRange(windowDays)

  const [productsResult, inventoryResult, salesResult] = await Promise.all([
    supabase.from("products").select("id, sku, brand_name, product_name"),
    supabase.from("inventory").select("product_id, on_hand, par_level, last_counted_at"),
    supabase
      .from("sales_history")
      .select("sku, product_name, brand_name, quantity_sold, sale_date")
      .gte("sale_date", startDate)
      .lte("sale_date", endDate)
      .order("sale_date", { ascending: true }),
  ])

  if (productsResult.error) throw productsResult.error
  if (inventoryResult.error) throw inventoryResult.error
  if (salesResult.error) throw salesResult.error

  return calculateSuggestedParMetrics({
    products: (productsResult.data ?? []) as ProductRow[],
    inventoryRows: (inventoryResult.data ?? []) as InventoryRow[],
    salesRows: (salesResult.data ?? []) as SalesHistoryRow[],
    windowDays,
    targetDaysOfStock,
  })
}

export function buildSuggestedParUpdates(
  summary: SalesParSummary,
  inventoryRows: InventoryRow[]
): SuggestedParUpdate[] {
  const inventoryByProductId = new Map(inventoryRows.map((row) => [row.product_id, row]))
  const nowIso = new Date().toISOString()

  return summary.metrics.map((metric) => {
    const existing = inventoryByProductId.get(metric.product_id)

    return {
      product_id: metric.product_id,
      on_hand: Math.max(0, Math.round(asNumber(existing?.on_hand) ?? 0)),
      par_level: metric.suggested_par,
      last_counted_at: existing?.last_counted_at ?? nowIso,
    }
  })
}
