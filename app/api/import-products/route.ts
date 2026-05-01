import { NextResponse } from "next/server";
import {
  cleanProductRow,
  createServiceRoleClient,
  dedupeProducts,
  type ProductImportRow,
} from "@/lib/import/server";
import type { ImportUploadRow } from "@/lib/import/shared";

type ProductUpsertRow = Omit<ProductImportRow, "sku"> & {
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

    const { error } = await supabase
      .from("products")
      .upsert(dedupedProductsByName, {
        onConflict: "brand_name,product_name",
        ignoreDuplicates: false,
      });

    if (error) {
      return NextResponse.json(
        { error: `PRODUCT UPSERT ERROR: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      count: productRows.length,
      skipped_distributor_overwrites: skippedDistributorOverwrites,
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
