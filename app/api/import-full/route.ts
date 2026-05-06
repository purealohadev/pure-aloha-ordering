import { NextResponse } from "next/server";
import {
  buildInventoryProductLookup,
  matchInventoryProductId,
  normalizeBarcode,
  normalizeBrandName,
  normalizeProductName,
  normalizeSku,
  type InventoryProductLookupRow,
} from "@/app/lib/inventoryNormalization";
import { createServiceRoleClient } from "@/lib/import/server";
import {
  buildPriceAlertRecord,
  cleanImportedUnitCost,
  cleanPriceIdentity,
  cleanPriceSource,
  maybeNotifyPriceAlertTeam,
  shouldCreatePriceAlert,
} from "@/lib/pricing/price-tracking";
import { loadPublicTableColumns } from "@/lib/supabase/table-columns";
import { asString } from "@/lib/import/shared";

type FullImportRow = Record<string, unknown>;

function cleanText(value: unknown) {
  return asString(value);
}

function parseBoolean(value: unknown) {
  return String(value ?? "true").toLowerCase() !== "false";
}

function buildMutableProductPayload(options: {
  sku: string | null;
  barcode: string | null;
  brand_name: string;
  product_name: string;
  category: string | null;
  distro: string | null;
  current_price: number;
  active: boolean;
  row: FullImportRow;
  productColumns: Set<string>;
  includeIdentity: boolean;
}) {
  const payload: Record<string, unknown> = {
    category: options.category,
    distro: options.distro,
    current_price: options.current_price,
    active: options.active,
  };

  if (options.includeIdentity) {
    payload.brand_name = options.brand_name;
    payload.product_name = options.product_name;
    if (options.sku) {
      payload.sku = options.sku;
    }
    if (options.productColumns.has("barcode")) {
      if (options.barcode) {
        payload.barcode = options.barcode;
      }
    }
  } else {
    if (options.productColumns.has("sku") && options.sku) {
      payload.sku = options.sku;
    }

    if (options.productColumns.has("barcode") && options.barcode) {
      payload.barcode = options.barcode;
    }
  }

  if (options.productColumns.has("unit_cost")) {
    const unitCost = cleanImportedUnitCost({
      unit_cost: options.row.unit_cost ?? options.row.current_price ?? options.row.price ?? options.row.cost,
    });
    if (unitCost != null) payload.unit_cost = unitCost;
  }

  if (options.productColumns.has("retail_price")) {
    const retailPrice = cleanImportedUnitCost({
      unit_cost:
        options.row.retail_price ?? options.row.price ?? options.row.current_price ?? options.row.cost,
    });
    if (retailPrice != null) payload.retail_price = retailPrice;
  }

  const size = cleanText(options.row.size ?? options.row.unit_size);
  const weight = cleanText(options.row.weight ?? options.row.calculated_weight);
  const pack = cleanText(options.row.pack ?? options.row.package_size);
  const notes = cleanText(options.row.notes ?? options.row.inventory_notes);
  const reportingUnit = cleanText(options.row.reporting_unit_of_measure ?? options.row.reporting_unit);

  if (options.productColumns.has("size") && size) payload.size = size;
  if (options.productColumns.has("weight") && weight) payload.weight = weight;
  if (options.productColumns.has("pack") && pack) payload.pack = pack;
  if (options.productColumns.has("unit_size") && size) payload.unit_size = size;
  if (options.productColumns.has("package_size") && pack) payload.package_size = pack;
  if (options.productColumns.has("reporting_unit") && reportingUnit) {
    payload.reporting_unit = reportingUnit;
  }
  if (options.productColumns.has("notes") && notes) payload.notes = notes;

  return payload;
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rows: FullImportRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ error: "No rows provided." }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const productColumns = await loadPublicTableColumns(supabase, "products");

    const existingProductSelectFields = [
      "id",
      "sku",
      productColumns.has("barcode") ? "barcode" : null,
      "brand_name",
      "product_name",
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

    const lookup = buildInventoryProductLookup(
      (existingProducts ?? []) as unknown as InventoryProductLookupRow[]
    );

    const seenKeys = new Set<string>();
    let totalRows = rows.length;
    let matchedRows = 0;
    let skippedRows = 0;
    let duplicateRowsSkipped = 0;
    let processedRows = 0;
    let priceSnapshotsCreated = 0;
    let priceAlertsCreated = 0;
    let priceAlertsSkipped = 0;

    for (const row of rows) {
      const brand_name = cleanText(row.brand_name ?? row.brand);
      const product_name = cleanText(row.product_name ?? row.name);
      const category = cleanText(row.category ?? row.category_group);
      const distro = cleanText(row.distro ?? row.distributor ?? row.vendor) || null;
      const sku = cleanText(row.sku ?? row.product_sku ?? row.item_sku ?? row.upc) || null;
      const barcode = cleanText(row.barcode ?? row.upc ?? row.ean ?? row.gtin) || null;
      const unitCost = cleanImportedUnitCost({
        unit_cost: row.unit_cost ?? row.current_price ?? row.price ?? row.cost,
      });
      const current_price = unitCost ?? 0;
      const active = parseBoolean(row.is_active ?? row.active);

      if (!brand_name || !product_name) {
        skippedRows += 1;
        continue;
      }

      const rowKey = [
        normalizeSku(sku),
        normalizeBarcode(barcode),
        normalizeBrandName(brand_name),
        normalizeProductName(product_name),
      ].join("__");

      if (seenKeys.has(rowKey)) {
        duplicateRowsSkipped += 1;
        continue;
      }

      seenKeys.add(rowKey);

      const match = matchInventoryProductId(
        {
          sku,
          barcode,
          brand_name,
          product_name,
        },
        lookup
      );

      let productId: string;

      if (match) {
        matchedRows += 1;

        const updatePayload = buildMutableProductPayload({
          sku,
          barcode,
          brand_name,
          product_name,
          category,
          distro,
          current_price,
          active,
          row,
          productColumns,
          includeIdentity: match.matchType === "brand_name" || match.matchType === "loose",
        });

        const { error: productError } = await supabase
          .from("products")
          .update(updatePayload)
          .eq("id", match.productId);

        if (productError) {
          return NextResponse.json(
            { error: `PRODUCT UPDATE ERROR: ${productError.message}` },
            { status: 500 }
          );
        }

        productId = match.productId;
      } else {
        matchedRows += 1;

        const insertPayload = buildMutableProductPayload({
          sku,
          barcode,
          brand_name,
          product_name,
          category,
          distro,
          current_price,
          active,
          row,
          productColumns,
          includeIdentity: true,
        });

        const { data: insertedProduct, error: insertError } = await supabase
          .from("products")
          .upsert(insertPayload, {
            onConflict: "brand_name,product_name",
            ignoreDuplicates: false,
          })
          .select("id")
          .single();

        if (insertError) {
          return NextResponse.json(
            { error: `PRODUCT UPSERT ERROR: ${insertError.message}` },
            { status: 500 }
          );
        }

        productId = insertedProduct.id;
      }

      if (unitCost != null) {
        const identity = cleanPriceIdentity({
          sku,
          brand_name,
          product_name,
          distributor: distro,
        });
        const previousUnitCost = await getPreviousUnitCost(supabase, productId);
        const hasPriceChange = shouldCreatePriceAlert(previousUnitCost, unitCost);
        const priceChange =
          previousUnitCost == null
            ? null
            : buildPriceAlertRecord(identity, previousUnitCost, unitCost);
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
          source: cleanPriceSource({ source: "import-full" }),
        });

        if (priceHistoryError) {
          return NextResponse.json(
            { error: `PRICE HISTORY INSERT ERROR: ${priceHistoryError.message}` },
            { status: 500 }
          );
        }

        priceSnapshotsCreated += 1;

        if (hasPriceChange && priceChange && previousUnitCost != null) {
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
          } else {
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
        }
      }

      processedRows += 1;
    }

    return NextResponse.json({
      ok: true,
      count: processedRows,
      total_rows: totalRows,
      matched_rows: matchedRows,
      unmatched_rows: 0,
      skipped_rows: skippedRows,
      duplicate_rows_skipped: duplicateRowsSkipped,
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
