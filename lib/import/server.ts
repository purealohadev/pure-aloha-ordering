import { createClient } from "@supabase/supabase-js";
import { resolveDistributorBrand } from "@/lib/inventory/distributors";
import {
  buildNormalizedProductKey,
  normalizeBarcode,
  normalizeLooseProductName,
  normalizeSku,
} from "@/app/lib/inventoryNormalization";
import {
  asNumber,
  asString,
  makeProductKey,
  type ImportUploadRow,
  type UnmatchedInventoryRow,
} from "@/lib/import/shared";

export type ProductImportRow = {
  sku: string;
  barcode?: string | null;
  brand_name: string;
  product_name: string;
  category: string | null;
  distro: string | null;
  current_price: number;
  active: boolean;
  unit_cost?: number | null;
  retail_price?: number | null;
  size?: string | null;
  weight?: string | null;
  pack?: string | null;
  unit_size?: string | null;
  package_size?: string | null;
  reporting_unit?: string | null;
  notes?: string | null;
};

type ProductLookupRow = {
  id: string;
  sku: string | null;
  barcode?: string | null;
  brand_name: string | null;
  product_name: string;
};

type InventoryUpsertRow = {
  product_id: string;
  on_hand: number;
  par_level: number;
  last_counted_at: string;
};

export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export function cleanProductRow(row: Partial<ImportUploadRow>): ProductImportRow | null {
  const sku = asString(row.sku);
  const name = asString(row.name);

  if (!sku || !name) return null;

  const brandName = asString(row.brand) || "Unknown";
  const importedDistributor = asString(row.vendor) || null;
  const distributorResolution = resolveDistributorBrand(brandName, importedDistributor);
  const distro =
    importedDistributor ??
    (distributorResolution &&
    !distributorResolution.review_required &&
    (distributorResolution.locked || distributorResolution.notes === "Legacy fallback")
      ? distributorResolution.distributor
      : null);

  return {
    sku,
    barcode: asString(row.barcode) || null,
    brand_name: brandName,
    product_name: name,
    category: asString(row.category) || null,
    distro,
    current_price: asNumber(row.price) ?? 0,
    active: row.is_active !== false,
    unit_cost: asNumber(row.unit_cost),
    retail_price: asNumber(row.retail_price),
    size: asString(row.size) || null,
    weight: asString(row.weight) || null,
    pack: asString(row.pack) || null,
    unit_size: asString(row.unit_size) || null,
    package_size: asString(row.package_size) || null,
    reporting_unit: asString(row.reporting_unit) || null,
    notes: asString(row.notes) || null,
  };
}

export function dedupeProducts(rows: ProductImportRow[]) {
  const map = new Map<string, ProductImportRow>();

  for (const row of rows) {
    map.set(makeProductKey(row.brand_name, row.product_name), row);
  }

  return Array.from(map.values());
}

type ProductLookupMaps = ReturnType<typeof buildProductLookupMaps>;

function buildProductLookupMaps(products: ProductLookupRow[]) {
  const productMap = new Map<string, string>();
  const productSkuMap = new Map<string, string>();
  const productBarcodeMap = new Map<string, string>();
  const productLooseKeyMap = new Map<string, string>();

  for (const product of products) {
    const normalizedKey = buildNormalizedProductKey(product.brand_name, product.product_name);

    if (normalizedKey && !productMap.has(normalizedKey)) {
      productMap.set(normalizedKey, product.id);
    }

    const sku = normalizeSku(product.sku);
    if (sku && !productSkuMap.has(sku)) {
      productSkuMap.set(sku, product.id);
    }

    const barcode = normalizeBarcode(product.barcode);
    if (barcode && !productBarcodeMap.has(barcode)) {
      productBarcodeMap.set(barcode, product.id);
    }

    const looseKey = `${normalizeLooseProductName(product.brand_name)}__${normalizeLooseProductName(
      product.product_name
    )}`;
    if (looseKey && !productLooseKeyMap.has(looseKey)) {
      productLooseKeyMap.set(looseKey, product.id);
    }
  }

  return {
    productMap,
    productSkuMap,
    productBarcodeMap,
    productLooseKeyMap,
  };
}

function matchProductId(
  row: Partial<ImportUploadRow>,
  lookup: ProductLookupMaps
) {
  const rowSku = normalizeSku(row.sku);
  if (rowSku) {
    const skuMatch = lookup.productSkuMap.get(rowSku);
    if (skuMatch) return skuMatch;
  }

  const rowBarcode = normalizeBarcode(row.barcode);
  if (rowBarcode) {
    const barcodeMatch = lookup.productBarcodeMap.get(rowBarcode);
    if (barcodeMatch) return barcodeMatch;
  }

  const exactKey = buildNormalizedProductKey(row.brand, row.name);
  if (exactKey) {
    const exactMatch = lookup.productMap.get(exactKey);
    if (exactMatch) return exactMatch;
  }

  const looseKey = `${normalizeLooseProductName(row.brand)}__${normalizeLooseProductName(row.name)}`;
  if (looseKey) {
    const looseMatch = lookup.productLooseKeyMap.get(looseKey);
    if (looseMatch) return looseMatch;
  }

  const fallbackName = normalizeLooseProductName(row.name);
  if (fallbackName) {
    for (const [candidateKey, candidateId] of lookup.productLooseKeyMap.entries()) {
      const candidateName = candidateKey.split("__")[1] ?? "";
      if (candidateName && (candidateName === fallbackName || candidateName.includes(fallbackName))) {
        return candidateId;
      }
    }
  }

  return null;
}

export function buildInventoryUpserts(
  rows: Partial<ImportUploadRow>[],
  products: ProductLookupRow[]
) {
  const lookup = buildProductLookupMaps(products);
  const inventoryMap = new Map<string, InventoryUpsertRow>();
  const unmatchedRows: UnmatchedInventoryRow[] = [];
  const summary = {
    totalRows: rows.length,
    matchedRows: 0,
    unmatchedRows: 0,
    skippedRows: 0,
    duplicateRowsSkipped: 0,
  };
  const countedAt = new Date().toISOString();

  for (const row of rows) {
    const sku = asString(row.sku);
    const name = asString(row.name);

    if (!sku && !name) {
      summary.skippedRows += 1;
      continue;
    }

    const productId = matchProductId(row, lookup);

    if (!productId) {
      summary.unmatchedRows += 1;
      const distributorResolution = resolveDistributorBrand(row.brand, row.vendor);

      unmatchedRows.push({
        brand: asString(row.brand) || null,
        name: asString(row.name),
        inventory: Number(row.inventory ?? 0),
        reorder_point: Number(row.reorder_point ?? 0),
        sku: asString(row.sku) || null,
        barcode: asString(row.barcode) || null,
        category: asString(row.category) || null,
        vendor: asString(row.vendor) || null,
        price: Number.isFinite(Number(row.price)) ? Number(row.price) : null,
        unit_cost: Number.isFinite(Number(row.unit_cost)) ? Number(row.unit_cost) : null,
        retail_price: Number.isFinite(Number(row.retail_price)) ? Number(row.retail_price) : null,
        size: asString(row.size) || null,
        weight: asString(row.weight) || null,
        pack: asString(row.pack) || null,
        unit_size: asString(row.unit_size) || null,
        package_size: asString(row.package_size) || null,
        suggested_distributor: distributorResolution?.review_required
          ? null
          : distributorResolution?.distributor ?? null,
        match_type: distributorResolution?.match_type ?? null,
        confidence: distributorResolution?.confidence ?? null,
        review_required: distributorResolution?.review_required ?? false,
        notes: distributorResolution?.notes ?? null,
      });
      continue;
    }

    summary.matchedRows += 1;

    if (inventoryMap.has(productId)) {
      summary.duplicateRowsSkipped += 1;
    }

    inventoryMap.set(productId, {
      product_id: productId,
      on_hand: Number(row.inventory ?? 0),
      par_level: Number(row.reorder_point ?? 0),
      last_counted_at: countedAt,
    });
  }

  return {
    inventoryRows: Array.from(inventoryMap.values()),
    unmatchedRows,
    summary,
  };
}
