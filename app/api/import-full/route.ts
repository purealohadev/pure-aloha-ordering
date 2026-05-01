import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  const n = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normalizeLockedBrand(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { rows } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "No rows received" },
        { status: 400 }
      );
    }

    let processed = 0;
    let inventoryUpdated = 0;
    let skippedDistributorOverwrites = 0;
    const importBrandKeys = Array.from(
      new Set(
        rows
          .map((row) => normalizeLockedBrand(row.brand_name))
          .filter((brandKey) => brandKey.length > 0)
      )
    );
    const lockedDistributorByBrand = new Map<string, string | null>();

    if (importBrandKeys.length) {
      const { data: lockedProducts, error: lockedFetchError } = await supabase
        .from("products")
        .select("brand_name, distro, distributor_locked")
        .eq("distributor_locked", true);

      if (lockedFetchError) throw lockedFetchError;

      for (const product of lockedProducts ?? []) {
        const brandKey = normalizeLockedBrand(product.brand_name);

        if (!brandKey || !importBrandKeys.includes(brandKey)) continue;
        if (!lockedDistributorByBrand.has(brandKey) || product.distro) {
          lockedDistributorByBrand.set(brandKey, product.distro ?? null);
        }
      }
    }

    for (const row of rows) {
      const brand_name = cleanText(row.brand_name);
      const product_name = cleanText(row.product_name);
      const category = cleanText(row.category);
      const distro = cleanText(row.distro);
      const current_price = toNumber(row.current_price);
      const on_hand = toNumber(row.on_hand);
      const par_level = toNumber(row.par_level);
      const brandKey = normalizeLockedBrand(brand_name);
      const isLockedBrand = lockedDistributorByBrand.has(brandKey);
      const lockedDistributor = isLockedBrand
        ? lockedDistributorByBrand.get(brandKey) ?? null
        : null;

      if (!brand_name || !product_name) continue;

      if (isLockedBrand && distro !== (lockedDistributor ?? "")) {
        skippedDistributorOverwrites += 1;
      }

      const { data: product, error: productError } = await supabase
        .from("products")
        .upsert(
          {
            brand_name,
            product_name,
            category,
            distro: isLockedBrand ? lockedDistributor : distro,
            current_price,
            active: true,
            ...(isLockedBrand ? { distributor_locked: true } : {}),
          },
          {
            onConflict: "brand_name,product_name",
          }
        )
        .select("id")
        .single();

      if (productError) throw productError;

      const { error: inventoryError } = await supabase
        .from("inventory")
        .upsert(
          {
            product_id: product.id,
            on_hand,
            par_level,
            last_counted_at: new Date().toISOString(),
          },
          {
            onConflict: "product_id",
          }
        );

      if (inventoryError) throw inventoryError;

      processed += 1;
      inventoryUpdated += 1;
    }

    return NextResponse.json({
      success: true,
      count: processed,
      inventoryUpdated,
      skipped_distributor_overwrites: skippedDistributorOverwrites,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}
