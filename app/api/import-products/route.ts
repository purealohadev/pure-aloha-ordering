import { NextResponse } from "next/server";
import { loadPublicTableColumns } from "@/lib/supabase/table-columns";
import {
  buildNormalizedProductKey,
  normalizeBarcode,
  normalizeBrandName,
  normalizeProductName,
  normalizeSku,
} from "@/app/lib/inventoryNormalization";
import {
  cleanProductRow,
  createServiceRoleClient,
  dedupeProducts,
  type ProductImportRow,
} from "@/lib/import/server";
import type { ImportUploadRow } from "@/lib/import/shared";
import {
  buildPriceAlertRecord,
  buildPriceProductLookup,
  cleanImportedUnitCost,
  cleanPriceIdentity,
  cleanPriceSource,
  matchPriceProductId,
  maybeNotifyPriceAlertTeam,
  shouldCreatePriceAlert,
  type PriceProductLookupRow,
} from "@/lib/pricing/price-tracking";

type ProductUpsertRow = ProductImportRow & {
  distributor_locked?: boolean;
};

type ExistingProductRow = {
  id: string;
  sku: string | null;
  barcode: string | null;
  brand_name: string | null;
  product_name: string | null;
};

type ExistingProductLookups = {
  skuMap: Map<string, string>;
  barcodeMap: Map<string, string>;
  brandNameMap: Map<string, string>;
};

function normalizeLockedBrand(value: unknown) {
  return normalizeBrandName(value);
}

function buildExistingProductLookups(products: ExistingProductRow[]) {
  const skuMap = new Map<string, string>();
  const barcodeMap = new Map<string, string>();
  const brandNameMap = new Map<string, string>();

  for (const product of products) {
    const sku = normalizeSku(product.sku);
    const barcode = normalizeBarcode(product.barcode);
    const key = buildNormalizedProductKey(product.brand_name, product.product_name);

    if (sku && !skuMap.has(sku)) {
      skuMap.set(sku, product.id);
    }

    if (barcode && !barcodeMap.has(barcode)) {
      barcodeMap.set(barcode, product.id);
    }

    if (key && !brandNameMap.has(key)) {
      brandNameMap.set(key, product.id);
    }
  }

  return { skuMap, barcodeMap, brandNameMap } satisfies ExistingProductLookups;
}

function buildProductPayload(
  row: ProductUpsertRow,
  productColumns: Set<string>
) {
  const payload: Record<string, unknown> = {
    sku: row.sku,
    brand_name: row.brand_name,
    product_name: row.product_name,
    category: row.category,
    distro: row.distro,
    current_price: row.current_price,
    active: row.active,
  };

  if (productColumns.has("barcode")) {
    payload.barcode = row.barcode ?? null;
  }

  if (productColumns.has("unit_cost") && row.unit_cost != null) {
    payload.unit_cost = row.unit_cost;
  }

  if (productColumns.has("retail_price") && row.retail_price != null) {
    payload.retail_price = row.retail_price;
  }

  if (productColumns.has("size") && row.size) {
    payload.size = row.size;
  }

  if (productColumns.has("weight") && row.weight) {
    payload.weight = row.weight;
  }

  if (productColumns.has("pack") && row.pack) {
    payload.pack = row.pack;
  }

  if (productColumns.has("unit_size") && row.unit_size) {
    payload.unit_size = row.unit_size;
  }

  if (productColumns.has("package_size") && row.package_size) {
    payload.package_size = row.package_size;
  }

  if (productColumns.has("reporting_unit") && row.reporting_unit) {
    payload.reporting_unit = row.reporting_unit;
  }

  if (productColumns.has("notes") && row.notes) {
    payload.notes = row.notes;
  }

  if (row.distributor_locked && productColumns.has("distributor_locked")) {
    payload.distributor_locked = true;
  }

  return payload;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rows: ImportUploadRow[] = Array.isArray(body?.rows) ? body.rows : [];
    const createOnly = Boolean(body?.createOnly);

    if (!rows.length) {
      return NextResponse.json({ error: "No rows provided." }, { status: 400 });
    }

    const cleanedRows = rows
      .map(cleanProductRow)
      .filter((row): row is NonNullable<ReturnType<typeof cleanProductRow>> => Boolean(row));

    if (!cleanedRows.length) {
      return NextResponse.json({ error: "No valid rows found." }, { status: 400 });
    }

    const productRows = dedupeProducts(cleanedRows);
    const supabase = createServiceRoleClient();
    const productColumns = await loadPublicTableColumns(supabase, "products");

    const existingProductSelectFields = [
      "id",
      "sku",
      productColumns.has("barcode") ? "barcode" : null,
      "brand_name",
      "product_name",
      "distro",
    ]
      .filter(Boolean)
      .join(", ");

    const { data: existingProducts, error: existingProductsError } = await supabase
      .from("products")
      .select(existingProductSelectFields);

    if (existingProductsError) {
      return NextResponse.json(
        { error: `PRODUCT LOOKUP ERROR: ${existingProductsError.message}` },
        { status: 500 }
      );
    }

    const existingLookups = buildExistingProductLookups(
      (existingProducts ?? []) as unknown as ExistingProductRow[]
    );
    const priceLookup = buildPriceProductLookup(
      (existingProducts ?? []) as unknown as PriceProductLookupRow[]
    );

    const importBrandKeys = Array.from(
      new Set(productRows.map((row) => normalizeLockedBrand(row.brand_name)).filter(Boolean))
    );
    const lockedDistributorByBrand = new Map<string, string | null>();

    if (importBrandKeys.length) {
      const { data: lockedProducts, error: lockedFetchError } = await supabase
        .from("products")
        .select("brand_name, distro, distributor_locked")
        .eq("distributor_locked", true);

      if (lockedFetchError) {
        return NextResponse.json(
          { error: `LOCKED BRAND FETCH ERROR: ${lockedFetchError.message}` },
          { status: 500 }
        );
      }

      for (const product of lockedProducts ?? []) {
        const brandKey = normalizeLockedBrand(product.brand_name);

        if (!brandKey || !importBrandKeys.includes(brandKey)) continue;
        if (!lockedDistributorByBrand.has(brandKey) || product.distro) {
          lockedDistributorByBrand.set(brandKey, product.distro ?? null);
        }
      }
    }

    const dedupedPayloads = new Map<string, ProductUpsertRow>();
    let skippedDistributorOverwrites = 0;
    let skippedDuplicateProducts = 0;
    let priceSnapshotsCreated = 0;
    let priceAlertsCreated = 0;
    let priceAlertsSkipped = 0;

    for (const row of productRows) {
      const brand = normalizeLockedBrand(row.brand_name);
      const name = normalizeProductName(row.product_name);
      const key = `${brand}__${name}`;
      const isLockedBrand = lockedDistributorByBrand.has(brand);
      const lockedDistributor = isLockedBrand ? lockedDistributorByBrand.get(brand) ?? null : null;

      const normalizedSku = normalizeSku(row.sku);
      const normalizedBarcode = normalizeBarcode(row.barcode);
      const normalizedKey = buildNormalizedProductKey(row.brand_name, row.product_name);
      const keyMatch = normalizedKey ? existingLookups.brandNameMap.get(normalizedKey) ?? null : null;
      const skuMatch = normalizedSku ? existingLookups.skuMap.get(normalizedSku) ?? null : null;
      const barcodeMatch = normalizedBarcode
        ? existingLookups.barcodeMap.get(normalizedBarcode)
        : null;

      const duplicateConflict = createOnly
        ? Boolean(keyMatch || skuMatch || barcodeMatch)
        : Boolean((skuMatch && skuMatch !== keyMatch) || (barcodeMatch && barcodeMatch !== keyMatch));

      if (duplicateConflict) {
        skippedDuplicateProducts += 1;
        continue;
      }

      if (isLockedBrand && row.distro !== lockedDistributor) {
        skippedDistributorOverwrites += 1;
      }

      dedupedPayloads.set(key, {
        ...row,
        distro: lockedDistributor ?? row.distro,
        ...(isLockedBrand ? { distributor_locked: true } : {}),
      });
    }

    const productPayloads = Array.from(dedupedPayloads.values()).map((row) =>
      buildProductPayload(row, productColumns)
    );

    if (!productPayloads.length) {
      return NextResponse.json({
        ok: true,
        count: 0,
        created_count: 0,
        skipped_rows: cleanedRows.length,
        duplicate_rows_skipped: skippedDuplicateProducts,
        skipped_distributor_overwrites: skippedDistributorOverwrites,
        price_snapshots_created: 0,
        price_alerts_created: 0,
        price_alerts_skipped: 0,
      });
    }

    const productOperation = createOnly
      ? supabase.from("products").insert(productPayloads)
      : supabase.from("products").upsert(productPayloads, {
          onConflict: "brand_name,product_name",
          ignoreDuplicates: false,
        });

    const { data: upsertedProducts, error } = await productOperation.select(
      "id, sku, brand_name, product_name, distro"
    );

    if (error) {
      return NextResponse.json(
        { error: `PRODUCT UPSERT ERROR: ${error.message}` },
        { status: 500 }
      );
    }

    for (const row of productPayloads) {
      const unitCost = cleanImportedUnitCost({
        current_price: row.current_price,
        unit_cost: (row as { unit_cost?: number | null }).unit_cost,
        price: (row as { retail_price?: number | null }).retail_price,
      });

      if (unitCost == null) {
        continue;
      }

      const identity = cleanPriceIdentity({
        sku: row.sku,
        brand_name: row.brand_name,
        product_name: row.product_name,
        distributor: row.distro,
      });
      const matchedProductId = matchPriceProductId(identity, priceLookup);
      const productRecord =
        upsertedProducts?.find(
          (product) =>
            product.brand_name === row.brand_name && product.product_name === row.product_name
        ) ?? null;
      const productId = matchedProductId ?? productRecord?.id ?? null;
      const previousUnitCost = productId
        ? await getPreviousUnitCost(supabase, productId)
        : null;
      const hasPriceChange = shouldCreatePriceAlert(previousUnitCost, unitCost);
      const priceChange =
        previousUnitCost == null ? null : buildPriceAlertRecord(identity, previousUnitCost, unitCost);
      const changeDirection =
        previousUnitCost == null
          ? null
          : previousUnitCost === unitCost
            ? "no_change"
            : unitCost > previousUnitCost
              ? "increase"
              : "decrease";

      const { error: priceHistoryError } = await supabase.from("price_history").insert({
        product_id: productId,
        sku: identity.sku,
        brand_name: identity.brand_name,
        product_name: identity.product_name,
        distributor: identity.distributor,
        unit_cost: Number(unitCost.toFixed(2)),
        previous_unit_cost: previousUnitCost == null ? null : Number(previousUnitCost.toFixed(2)),
        change_amount:
          previousUnitCost == null ? null : Number((unitCost - previousUnitCost).toFixed(2)),
        change_percent:
          previousUnitCost == null || previousUnitCost === 0
            ? null
            : Number((((unitCost - previousUnitCost) / previousUnitCost) * 100).toFixed(2)),
        change_direction: changeDirection,
        source: cleanPriceSource({ source: "import-products" }),
      });

      if (priceHistoryError) {
        return NextResponse.json(
          { error: `PRICE HISTORY INSERT ERROR: ${priceHistoryError.message}` },
          { status: 500 }
        );
      }

      priceSnapshotsCreated += 1;

      if (!hasPriceChange || !priceChange || previousUnitCost == null) {
        continue;
      }

      const duplicateAlertQuery = supabase
        .from("price_alerts")
        .select("id")
        .eq("new_price", Number(unitCost.toFixed(2)))
        .eq("change_direction", priceChange.change_direction)
        .limit(1);

      if (identity.sku) {
        duplicateAlertQuery.eq("sku", identity.sku);
      } else {
        duplicateAlertQuery.is("sku", null);
      }

      if (identity.brand_name) {
        duplicateAlertQuery.eq("brand_name", identity.brand_name);
      } else {
        duplicateAlertQuery.is("brand_name", null);
      }

      if (identity.product_name) {
        duplicateAlertQuery.eq("product_name", identity.product_name);
      } else {
        duplicateAlertQuery.is("product_name", null);
      }

      if (identity.distributor) {
        duplicateAlertQuery.eq("distributor", identity.distributor);
      } else {
        duplicateAlertQuery.is("distributor", null);
      }

      const { data: duplicateAlert } = await duplicateAlertQuery;

      if (duplicateAlert?.length) {
        priceAlertsSkipped += 1;
        continue;
      }

      const { error: priceAlertError } = await supabase.from("price_alerts").insert({
        sku: identity.sku,
        brand_name: identity.brand_name,
        product_name: identity.product_name,
        distributor: identity.distributor,
        old_price: Number(previousUnitCost.toFixed(2)),
        new_price: Number(unitCost.toFixed(2)),
        change_amount: Number((unitCost - previousUnitCost).toFixed(2)),
        change_percent:
          previousUnitCost === 0
            ? null
            : Number((((unitCost - previousUnitCost) / previousUnitCost) * 100).toFixed(2)),
        change_direction: priceChange.change_direction,
      });

      if (priceAlertError) {
        return NextResponse.json(
          { error: `PRICE ALERT INSERT ERROR: ${priceAlertError.message}` },
          { status: 500 }
        );
      }

      priceAlertsCreated += 1;
      await maybeNotifyPriceAlertTeam({
        sku: identity.sku,
        brand_name: identity.brand_name,
        product_name: identity.product_name,
        distributor: identity.distributor,
        old_price: Number(previousUnitCost.toFixed(2)),
        new_price: Number(unitCost.toFixed(2)),
        change_amount: Number((unitCost - previousUnitCost).toFixed(2)),
        change_percent:
          previousUnitCost === 0
            ? null
            : Number((((unitCost - previousUnitCost) / previousUnitCost) * 100).toFixed(2)),
        change_direction: priceChange.change_direction,
      });
    }

    return NextResponse.json({
      ok: true,
      count: productPayloads.length,
      created_count: createOnly ? productPayloads.length : productPayloads.length,
      skipped_rows: cleanedRows.length - productPayloads.length,
      duplicate_rows_skipped: skippedDuplicateProducts,
      skipped_distributor_overwrites: skippedDistributorOverwrites,
      price_snapshots_created: priceSnapshotsCreated,
      price_alerts_created: priceAlertsCreated,
      price_alerts_skipped: priceAlertsSkipped,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Import failed",
      },
      { status: 500 }
    );
  }
}

async function getPreviousUnitCost(
  supabase: ReturnType<typeof createServiceRoleClient>,
  productId: string
) {
  const { data, error } = await supabase
    .from("price_history")
    .select("unit_cost")
    .eq("product_id", productId)
    .order("imported_at", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const previous = data?.[0]?.unit_cost;
  const parsed = Number(previous);

  return Number.isFinite(parsed) ? parsed : null;
}
