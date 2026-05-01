import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/import/server";
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

type FullImportRow = Record<string, unknown>;

function cleanText(value: unknown) {
  return String(value ?? "").trim();
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

    let processed = 0;
    let priceSnapshotsCreated = 0;
    let priceAlertsCreated = 0;
    let priceAlertsSkipped = 0;

    for (const row of rows) {
      const brand_name = cleanText(row.brand_name ?? row.brand);
      const product_name = cleanText(row.product_name ?? row.name);
      const category = cleanText(row.category ?? row.category_group);
      const distro = cleanText(row.distro ?? row.distributor ?? row.vendor);
      const sku = cleanText(row.sku ?? row.product_sku ?? row.item_sku);
      const unitCost = cleanImportedUnitCost({
        unit_cost: row.unit_cost ?? row.current_price ?? row.price ?? row.cost,
      });
      const current_price = unitCost ?? 0;
      const active = String(row.is_active ?? row.active ?? "true").toLowerCase() !== "false";

      if (!brand_name || !product_name) {
        continue;
      }

      const identity = cleanPriceIdentity({
        sku,
        brand_name,
        product_name,
        distributor: distro,
      });
      const matchedProductId = matchPriceProductId(identity, priceLookup);

      const { data: upsertedProduct, error: productError } = await supabase
        .from("products")
        .upsert(
          {
            sku: sku || null,
            brand_name,
            product_name,
            category,
            distro: distro || null,
            current_price,
            active,
          },
          {
            onConflict: "brand_name,product_name",
            ignoreDuplicates: false,
          }
        )
        .select("id, sku, brand_name, product_name, distro")
        .single();

      if (productError) {
        return NextResponse.json(
          { error: `PRODUCT UPSERT ERROR: ${productError.message}` },
          { status: 500 }
        );
      }

      const productId = matchedProductId ?? upsertedProduct.id;

      if (unitCost != null) {
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

      processed += 1;
    }

    return NextResponse.json({
      ok: true,
      count: processed,
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
