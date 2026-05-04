import { NextResponse } from "next/server";
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

function normalizeLockedBrand(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rows: ImportUploadRow[] = Array.isArray(body?.rows) ? body.rows : [];

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
    const { data: existingProducts, error: existingProductsError } = await supabase
      .from("products")
      .select("id, sku, brand_name, product_name, distro");

    if (existingProductsError) {
      return NextResponse.json(
        { error: `PRODUCT LOOKUP ERROR: ${existingProductsError.message}` },
        { status: 500 }
      );
    }

    const priceLookup = buildPriceProductLookup(
      (existingProducts ?? []) as PriceProductLookupRow[]
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

    const brandNameDedupedMap = new Map<string, ProductUpsertRow>();
    let skippedDistributorOverwrites = 0;
    let priceSnapshotsCreated = 0;
    let priceAlertsCreated = 0;
    let priceAlertsSkipped = 0;

    for (const row of productRows) {
      const brand = normalizeLockedBrand(row.brand_name);
      const name = String(row.product_name ?? "").trim().toLowerCase();
      const key = `${brand}__${name}`;
      const isLockedBrand = lockedDistributorByBrand.has(brand);
      const lockedDistributor = isLockedBrand ? lockedDistributorByBrand.get(brand) ?? null : null;

      if (isLockedBrand && row.distro !== lockedDistributor) {
        skippedDistributorOverwrites += 1;
      }

      brandNameDedupedMap.set(key, {
        sku: row.sku,
        brand_name: row.brand_name,
        product_name: row.product_name,
        category: row.category,
        distro: isLockedBrand ? lockedDistributor : row.distro,
        current_price: row.current_price,
        active: row.active,
        
        ...(isLockedBrand ? { distributor_locked: true } : {}),
      });
    }

    const dedupedProductsByName = Array.from(brandNameDedupedMap.values());

    const { data: upsertedProducts, error } = await supabase
      .from("products")
      .upsert(dedupedProductsByName, {
        onConflict: "brand_name,product_name",
        ignoreDuplicates: false,
      })
      .select("id, sku, brand_name, product_name, distro");

    if (error) {
      return NextResponse.json(
        { error: `PRODUCT UPSERT ERROR: ${error.message}` },
        { status: 500 }
      );
    }

    for (const row of dedupedProductsByName) {
      const unitCost = cleanImportedUnitCost({
  current_price: row.current_price,
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
      count: productRows.length,
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

async function getPreviousUnitCost(supabase: ReturnType<typeof createServiceRoleClient>, productId: string) {
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
