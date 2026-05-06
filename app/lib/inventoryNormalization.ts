const BRAND_ALIASES: Record<string, string> = {
  kiva: "kiva",
  "kiva lost farm": "kiva",
  "lost farm": "kiva",
  rove: "rove",
  "rove ice packs": "rove",
  "raw garden": "raw garden",
  raw: "raw garden",
  stiiizy: "stiiizy",
  "stiiizy promo": "stiiizy",
  "uncle arnies": "uncle arnie's",
  "uncle arnie's": "uncle arnie's",
  "vet cbd": "vetcbd",
  vetcbd: "vetcbd",
  kingroll: "kingroll",
  "kingroll juniors": "kingroll",
  "kingroll junior": "kingroll",
  "the pairist": "the pairist",
  pairist: "the pairist",
  autumn: "autumn brands",
  "autumn brands": "autumn brands",
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeText(value: unknown) {
  return normalizeWhitespace(String(value ?? "").trim())
}

function stripPunctuation(value: string) {
  return value
    .replace(/[\u2018\u2019\u02BC\uFF07']/g, "")
    .replace(/[|]/g, " ")
    .replace(/[_]+/g, " ")
}

export function normalizeBrandName(value: unknown) {
  const cleaned = normalizeText(value).toLowerCase()

  if (!cleaned) return ""

  return BRAND_ALIASES[stripPunctuation(cleaned)] ?? stripPunctuation(cleaned)
}

export function normalizeProductName(value: unknown) {
  const cleaned = normalizeText(value).toLowerCase()

  if (!cleaned) return ""

  return normalizeWhitespace(
    stripPunctuation(cleaned)
      .replace(/[^a-z0-9\s./&+-]+/g, " ")
      .replace(/\s*\/\s*/g, " / ")
  )
}

export function normalizeLooseProductName(value: unknown) {
  const cleaned = normalizeProductName(value)

  if (!cleaned) return ""

  return normalizeWhitespace(
    cleaned
      .replace(
        /\b(indoor|flower|preroll|pre-roll|pre roll|ratio|tablets?|tablet|cartridge|cart|vape|disposable|all in one|aio|live resin|liquid diamonds|distillate|infused|smalls|badder|budder|hash|rosin|gummies|gummy|drink|tea|beverage|chocolate|pack|pk)\b/gi,
        " "
      )
      .replace(/\b\d+(\.\d+)?g\b/gi, " ")
      .replace(/\b\d+\s*x\s*\d+\b/gi, " ")
      .replace(/[^a-z0-9\s./&+-]/g, " ")
  )
}

export function normalizeSku(value: unknown) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
}

export function normalizeBarcode(value: unknown) {
  return normalizeText(value).replace(/\D+/g, "")
}

export function normalizeCategory(value: unknown) {
  const cleaned = normalizeText(value).toLowerCase()

  if (!cleaned) return ""

  return normalizeWhitespace(cleaned.replace(/[^a-z0-9\s/&+-]+/g, " "))
}

export function normalizeDistributor(value: unknown) {
  const cleaned = normalizeText(value).toLowerCase()

  if (!cleaned) return ""

  return normalizeWhitespace(
    cleaned
      .replace(/[\u2018\u2019\u02BC\uFF07']/g, "")
      .replace(/[^a-z0-9\s&+-]+/g, " ")
  )
}

export function buildNormalizedProductKey(brand: unknown, name: unknown) {
  return `${normalizeBrandName(brand)}__${normalizeProductName(name)}`
}

export type InventoryProductLookupRow = {
  id: string
  sku: string | null
  barcode?: string | null
  brand_name: string | null
  product_name: string | null
}

export type InventoryProductMatchType = "sku" | "barcode" | "brand_name" | "loose"

export type InventoryProductLookup = {
  skuMap: Map<string, string>
  barcodeMap: Map<string, string>
  brandNameMap: Map<string, string>
  looseNameMap: Map<string, string>
}

export function buildInventoryProductLookup(products: InventoryProductLookupRow[]) {
  const skuMap = new Map<string, string>()
  const barcodeMap = new Map<string, string>()
  const brandNameMap = new Map<string, string>()
  const looseNameMap = new Map<string, string>()

  for (const product of products) {
    const sku = normalizeSku(product.sku)
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

    if (looseKey && !looseNameMap.has(looseKey)) {
      looseNameMap.set(looseKey, product.id)
    }
  }

  return { skuMap, barcodeMap, brandNameMap, looseNameMap }
}

export function matchInventoryProductId(
  input: {
    sku?: unknown
    barcode?: unknown
    brand?: unknown
    brand_name?: unknown
    product_name?: unknown
    name?: unknown
  },
  lookup: InventoryProductLookup
) {
  const sku = normalizeSku(input.sku)
  if (sku) {
    const skuMatch = lookup.skuMap.get(sku)
    if (skuMatch) {
      return { productId: skuMatch, matchType: "sku" as const }
    }
  }

  const barcode = normalizeBarcode(input.barcode)
  if (barcode) {
    const barcodeMatch = lookup.barcodeMap.get(barcode)
    if (barcodeMatch) {
      return { productId: barcodeMatch, matchType: "barcode" as const }
    }
  }

  const brand = input.brand_name ?? input.brand
  const productName = input.product_name ?? input.name
  const exactKey = buildNormalizedProductKey(brand, productName)
  if (exactKey) {
    const brandNameMatch = lookup.brandNameMap.get(exactKey)
    if (brandNameMatch) {
      return { productId: brandNameMatch, matchType: "brand_name" as const }
    }
  }

  const looseKey = `${normalizeLooseProductName(brand)}__${normalizeLooseProductName(productName)}`
  if (looseKey) {
    const looseMatch = lookup.looseNameMap.get(looseKey)
    if (looseMatch) {
      return { productId: looseMatch, matchType: "loose" as const }
    }
  }

  const looseName = normalizeLooseProductName(productName)
  if (looseName) {
    for (const [candidateKey, candidateId] of lookup.looseNameMap.entries()) {
      const candidateName = candidateKey.split("__")[1] ?? ""

      if (
        candidateName &&
        (candidateName === looseName || candidateName.includes(looseName) || looseName.includes(candidateName))
      ) {
        return { productId: candidateId, matchType: "loose" as const }
      }
    }
  }

  return null
}
