import { chunkArray, asNullableString, asString } from "@/lib/import/shared"
import {
  buildNormalizedProductKey,
  normalizeBarcode,
  normalizeLooseProductName,
  normalizeSku,
} from "@/app/lib/inventoryNormalization"
import { createServiceRoleClient } from "@/lib/supabase/service"
import { loadPublicTableColumns } from "@/lib/supabase/table-columns"

export type PosInventoryInputRow = Record<string, unknown>

export type NormalizedPosInventoryRow = {
  sku: string | null
  barcode: string | null
  product_name: string
  brand: string | null
  category: string | null
  current_inventory: number
  unit_cost: number | null
  vendor: string | null
  distributor: string | null
  raw: PosInventoryInputRow
}

export type PosSyncSource = "mock" | "pos"

export type PosSyncResult = {
  success: boolean
  source: PosSyncSource
  total_rows: number
  matched_count: number
  imported_count: number
  unmatched_count: number
  skipped_count: number
  duplicate_rows_skipped: number
  errors: string[]
}

type ProductLookupRow = {
  id: string
  sku: string | null
  barcode: string | null
  brand_name: string | null
  product_name: string | null
}

const MOCK_POS_INVENTORY_ROWS: PosInventoryInputRow[] = [
  {
    sku: "POS-MOCK-001",
    barcode: "000111222333",
    product_name: "Mock Flower 3.5g",
    brand: "Mock Brand",
    category: "Flower",
    current_inventory: 24,
    unit_cost: 18.5,
    vendor: "Mock Distributor",
  },
  {
    sku: "POS-MOCK-002",
    barcode: "000111222444",
    product_name: "Mock Pre Roll 1g",
    brand: "Mock Brand",
    category: "Pre Roll",
    current_inventory: 8,
    unit_cost: 4.25,
    distributor: "Mock Distributor",
  },
  {
    sku: "POS-MOCK-UNMATCHED",
    barcode: "000111222555",
    product_name: "Unmatched Demo Item",
    brand: "Future POS Brand",
    category: "Accessory",
    current_inventory: 12,
    unit_cost: 2.1,
    vendor: "Future POS Vendor",
  },
]

function parseEnabledFlag(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase())
}

function hasPosCredentials() {
  return Boolean(
    process.env.POS_API_BASE_URL?.trim() &&
      process.env.POS_API_KEY?.trim() &&
      process.env.POS_LOCATION_ID?.trim()
  )
}

function normalizeIdentifier(value: unknown) {
  return normalizeSku(value)
}

function readFirstValue(row: PosInventoryInputRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (value !== null && value !== undefined && value !== "") {
      return value
    }
  }

  return undefined
}

function parseInventoryNumber(value: unknown) {
  const raw = asString(value)

  if (!raw) return 0

  const parsed = Number(raw.replace(/[$,]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

function parseOptionalNumber(value: unknown) {
  const raw = asString(value)

  if (!raw) return null

  const parsed = Number(raw.replace(/[$,]/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

function extractRowsFromPayload(payload: unknown) {
  if (Array.isArray(payload)) return payload as PosInventoryInputRow[]

  if (!payload || typeof payload !== "object") return []

  const record = payload as Record<string, unknown>

  for (const key of ["data", "items", "inventory", "results", "rows"]) {
    if (Array.isArray(record[key])) {
      return record[key] as PosInventoryInputRow[]
    }
  }

  return []
}

function buildProductLookups(products: ProductLookupRow[]) {
  const skuMap = new Map<string, string>()
  const barcodeMap = new Map<string, string>()
  const brandNameMap = new Map<string, string>()
  const looseBrandNameMap = new Map<string, string>()

  for (const product of products) {
    const sku = normalizeIdentifier(product.sku)
    const barcode = normalizeBarcode(product.barcode)
    const brandNameKey = buildNormalizedProductKey(product.brand_name, product.product_name)
    const looseKey = `${normalizeLooseProductName(product.brand_name)}__${normalizeLooseProductName(
      product.product_name
    )}`

    if (sku && !skuMap.has(sku)) {
      skuMap.set(sku, product.id)
    }

    if (barcode && !barcodeMap.has(barcode)) {
      barcodeMap.set(barcode, product.id)
    }

    if (brandNameKey && !brandNameMap.has(brandNameKey)) {
      brandNameMap.set(brandNameKey, product.id)
    }

    if (looseKey && !looseBrandNameMap.has(looseKey)) {
      looseBrandNameMap.set(looseKey, product.id)
    }
  }

  return { skuMap, barcodeMap, brandNameMap, looseBrandNameMap }
}

function normalizePosRow(row: PosInventoryInputRow): NormalizedPosInventoryRow {
  const sku = asNullableString(readFirstValue(row, ["sku", "product_sku", "item_sku", "upc"]))
  const barcode = asNullableString(readFirstValue(row, ["barcode", "upc", "ean", "gtin"]))
  const brand =
    asNullableString(readFirstValue(row, ["brand", "brand_name"])) ||
    asNullableString(readFirstValue(row, ["vendor", "distributor", "distro"]))
  const productNameFallback =
    asNullableString(
      readFirstValue(row, ["product_name", "name", "title", "description", "item_name"])
    ) || sku || barcode || "Unnamed POS Item"

  return {
    sku,
    barcode,
    product_name: productNameFallback,
    brand,
    category: asNullableString(readFirstValue(row, ["category", "product_category", "type"])),
    current_inventory: parseInventoryNumber(
      readFirstValue(row, ["current_inventory", "inventory", "qty", "quantity", "on_hand"])
    ),
    unit_cost: parseOptionalNumber(readFirstValue(row, ["unit_cost", "cost", "price", "wholesale"])),
    vendor:
      asNullableString(readFirstValue(row, ["vendor", "vendor_name", "distributor", "distro"])) ||
      null,
    distributor:
      asNullableString(readFirstValue(row, ["distributor", "vendor", "vendor_name", "distro"])) ||
      null,
    raw: row,
  }
}

function matchProductId(
  row: NormalizedPosInventoryRow,
  lookups: ReturnType<typeof buildProductLookups>
) {
  const sku = normalizeIdentifier(row.sku)
  if (sku) {
    const skuMatch = lookups.skuMap.get(sku)
    if (skuMatch) return skuMatch
  }

  const barcode = normalizeBarcode(row.barcode)
  if (barcode) {
    const barcodeMatch = lookups.barcodeMap.get(barcode)
    if (barcodeMatch) return barcodeMatch
  }

  const brandForMatch = row.brand || row.vendor || row.distributor
  const brandNameKey = buildNormalizedProductKey(brandForMatch, row.product_name)

  if (brandNameKey) {
    const brandNameMatch = lookups.brandNameMap.get(brandNameKey)
    if (brandNameMatch) return brandNameMatch
  }

  const looseKey = `${normalizeLooseProductName(brandForMatch)}__${normalizeLooseProductName(
    row.product_name
  )}`

  if (looseKey) {
    const looseMatch = lookups.looseBrandNameMap.get(looseKey)
    if (looseMatch) return looseMatch
  }

  return null
}

export async function fetchPosInventory() {
  const syncEnabled = parseEnabledFlag(process.env.POS_SYNC_ENABLED)
  const hasConfig = hasPosCredentials()

  if (!syncEnabled || !hasConfig) {
    return {
      source: "mock" as const,
      rows: MOCK_POS_INVENTORY_ROWS,
      errors: [],
    }
  }

  const baseUrl = process.env.POS_API_BASE_URL!.trim().replace(/\/+$/, "")
  const apiKey = process.env.POS_API_KEY!.trim()
  const locationId = process.env.POS_LOCATION_ID!.trim()
  const requestUrl = new URL("/inventory", baseUrl)

  requestUrl.searchParams.set("location_id", locationId)

  const response = await fetch(requestUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      "X-Location-Id": locationId,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`POS API request failed with status ${response.status}.`)
  }

  const payload = await response.json()

  return {
    source: "pos" as const,
    rows: extractRowsFromPayload(payload),
    errors: [],
  }
}

export function normalizePosInventory(rows: PosInventoryInputRow[]) {
  return rows.map((row) => normalizePosRow(row))
}

export async function syncPosInventoryToSupabase(options?: {
  rows?: PosInventoryInputRow[]
  source?: PosSyncSource
}) {
  const fetchedRows = options?.rows ? null : await fetchPosInventory()
  const source = options?.rows ? options?.source ?? "pos" : fetchedRows?.source ?? "mock"
  const inputRows = options?.rows ?? fetchedRows?.rows ?? []
  const normalizedRows = normalizePosInventory(inputRows)
  const errors = fetchedRows?.errors ? [...fetchedRows.errors] : []

  const supabase = createServiceRoleClient()
  const productColumns = await loadPublicTableColumns(supabase, "products")

  const productSelectFields = [
    "id",
    "sku",
    "brand_name",
    "product_name",
    productColumns.has("barcode") ? "barcode" : null,
  ]
    .filter(Boolean)
    .join(", ")

  const { data: productRows, error: productError } = await supabase
    .from("products")
    .select(productSelectFields)

  if (productError) {
    return {
      success: false,
      source,
      total_rows: normalizedRows.length,
      matched_count: 0,
      imported_count: 0,
      unmatched_count: normalizedRows.length,
      skipped_count: 0,
      duplicate_rows_skipped: 0,
      errors: [...errors, `Product lookup failed: ${productError.message}`],
    } satisfies PosSyncResult
  }

  const lookups = buildProductLookups((productRows ?? []) as unknown as ProductLookupRow[])
  const inventoryMap = new Map<string, { product_id: string; on_hand: number; last_counted_at: string }>()
  const unmatchedRows: NormalizedPosInventoryRow[] = []
  const countedAt = new Date().toISOString()
  let duplicateRowsSkipped = 0
  let matchedCount = 0

  for (const row of normalizedRows) {
    const productId = matchProductId(row, lookups)

    if (!productId) {
      unmatchedRows.push(row)
      continue
    }

    matchedCount += 1

    if (inventoryMap.has(productId)) {
      duplicateRowsSkipped += 1
    }

    inventoryMap.set(productId, {
      product_id: productId,
      on_hand: row.current_inventory,
      last_counted_at: countedAt,
    })
  }

  const inventoryRows = Array.from(inventoryMap.values())

  if (!inventoryRows.length) {
    return {
      success: true,
      source,
      total_rows: normalizedRows.length,
      matched_count: matchedCount,
      imported_count: 0,
      unmatched_count: unmatchedRows.length,
      skipped_count: 0,
      duplicate_rows_skipped: duplicateRowsSkipped,
      errors,
    } satisfies PosSyncResult
  }

  const chunkSize = 500
  let importedCount = 0

  for (const batch of chunkArray(inventoryRows, chunkSize)) {
    const { error: inventoryError } = await supabase.from("inventory").upsert(batch, {
      onConflict: "product_id",
      ignoreDuplicates: false,
    })

    if (inventoryError) {
      return {
        success: false,
        source,
        total_rows: normalizedRows.length,
        matched_count: matchedCount,
        imported_count: importedCount,
        unmatched_count: unmatchedRows.length,
        skipped_count: 0,
        duplicate_rows_skipped: duplicateRowsSkipped,
        errors: [...errors, `Inventory upsert failed: ${inventoryError.message}`],
      } satisfies PosSyncResult
    }

    importedCount += batch.length
  }

  return {
    success: true,
    source,
    total_rows: normalizedRows.length,
    matched_count: matchedCount,
    imported_count: importedCount,
    unmatched_count: unmatchedRows.length,
    skipped_count: 0,
    duplicate_rows_skipped: duplicateRowsSkipped,
    errors,
  } satisfies PosSyncResult
}
