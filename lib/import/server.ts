import { createClient } from "@supabase/supabase-js";
import { resolveDistributorBrand } from "@/lib/inventory/distributors";
import {
  asNumber,
  asString,
  extractCoreProductName,
  makeProductKey,
  normalizeLooseName,
  type ImportUploadRow,
  type UnmatchedInventoryRow,
} from "@/lib/import/shared";

export type ProductImportRow = {
  sku: string;
  brand_name: string;
  product_name: string;
  category: string | null;
  distro: string | null;
  unit_cost: number | null;
  current_price: number;
  active: boolean;
};

type ProductLookupRow = {
  id: string;
  sku: string | null;
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
    brand_name: brandName,
    product_name: name,
    category: asString(row.category) || null,
    distro,
    unit_cost: asNumber(row.price),
    current_price: asNumber(row.price) ?? 0,
    active: row.is_active !== false,
  };
}

export function dedupeProducts(rows: ProductImportRow[]) {
  const map = new Map<string, ProductImportRow>();

  for (const row of rows) {
    map.set(makeProductKey(row.brand_name, row.product_name), row);
  }

  return Array.from(map.values());
}

function buildProductLookupMaps(products: ProductLookupRow[]) {
  const productMap = new Map<string, string>();
  const productNameOnlyMap = new Map<string, string>();
  const productSkuMap = new Map<string, string>();
  const productLooseNameMap = new Map<string, string>();
  const productCoreNameMap = new Map<string, string>();
  const productContainsMap = new Map<string, string>();
  const productNormalizedBrandNameMap = new Map<string, string>();

  for (const product of products) {
    productMap.set(makeProductKey(product.brand_name, product.product_name), product.id);

    const normalizedBrand = normalizeLooseName(product.brand_name);
    const normalizedProductName = normalizeLooseName(product.product_name);
    const normalizedBrandNameKey = `${normalizedBrand}__${normalizedProductName}`;

    if (
      normalizedBrand &&
      normalizedProductName &&
      !productNormalizedBrandNameMap.has(normalizedBrandNameKey)
    ) {
      productNormalizedBrandNameMap.set(normalizedBrandNameKey, product.id);
    }

    const normalizedName = asString(product.product_name).toLowerCase();
    if (normalizedName && !productNameOnlyMap.has(normalizedName)) {
      productNameOnlyMap.set(normalizedName, product.id);
    }

    const sku = asString(product.sku);
    if (sku && !productSkuMap.has(sku)) {
      productSkuMap.set(sku, product.id);
    }

    const looseName = normalizeLooseName(product.product_name);
    if (looseName && !productLooseNameMap.has(looseName)) {
      productLooseNameMap.set(looseName, product.id);
    }

    const coreName = extractCoreProductName(product.product_name);
    if (coreName && !productCoreNameMap.has(coreName)) {
      productCoreNameMap.set(coreName, product.id);
    }

    if (coreName && !productContainsMap.has(coreName)) {
      productContainsMap.set(coreName, product.id);
    }

    if (looseName && !productContainsMap.has(looseName)) {
      productContainsMap.set(looseName, product.id);
    }
  }

  return {
    productMap,
    productNameOnlyMap,
    productSkuMap,
    productLooseNameMap,
    productCoreNameMap,
    productContainsMap,
    productNormalizedBrandNameMap,
  };
}

function matchProductId(
  row: Partial<ImportUploadRow>,
  lookup: ReturnType<typeof buildProductLookupMaps>
) {
  const brandAndNameMatch = lookup.productMap.get(makeProductKey(row.brand, row.name));
  if (brandAndNameMatch) return brandAndNameMatch;

  const normalizedBrand = normalizeLooseName(row.brand);
  const normalizedNameKey = normalizeLooseName(row.name);
  const normalizedBrandNameKey = `${normalizedBrand}__${normalizedNameKey}`;

  const normalizedBrandNameMatch =
    lookup.productNormalizedBrandNameMap.get(normalizedBrandNameKey);

  if (normalizedBrandNameMatch) return normalizedBrandNameMatch;

  const normalizedName = asString(row.name).toLowerCase();
  if (normalizedName) {
    const exactNameMatch = lookup.productNameOnlyMap.get(normalizedName);
    if (exactNameMatch) return exactNameMatch;
  }

  const looseName = normalizeLooseName(row.name);
  if (looseName) {
    const looseNameMatch = lookup.productLooseNameMap.get(looseName);
    if (looseNameMatch) return looseNameMatch;
  }

  const coreName = extractCoreProductName(row.name);
  if (coreName) {
    const coreNameMatch = lookup.productCoreNameMap.get(coreName);
    if (coreNameMatch) return coreNameMatch;
  }

  if (looseName) {
    for (const [candidateName, candidateId] of lookup.productContainsMap.entries()) {
      if (
        candidateName &&
        (looseName.includes(candidateName) || candidateName.includes(looseName))
      ) {
        return candidateId;
      }
    }
  }

  const rowSku = asString(row.sku);
  if (rowSku) {
    const skuMatch = lookup.productSkuMap.get(rowSku);
    if (skuMatch) return skuMatch;
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
  const countedAt = new Date().toISOString();

  for (const row of rows) {
    const productId = matchProductId(row, lookup);

    if (!productId) {
      const distributorResolution = resolveDistributorBrand(row.brand, row.vendor);

      unmatchedRows.push({
        brand: asString(row.brand) || null,
        name: asString(row.name),
        inventory: Number(row.inventory ?? 0),
        reorder_point: Number(row.reorder_point ?? 0),
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
  };
}
