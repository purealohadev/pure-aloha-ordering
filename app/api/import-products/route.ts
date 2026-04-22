import { NextResponse } from "next/server";
import { cleanProductRow, createServiceRoleClient, dedupeProducts } from "@/lib/import/server";
import type { ImportUploadRow } from "@/lib/import/shared";

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

const brandNameDedupedMap = new Map<string, any>();

for (const row of productRows) {
  const brand = String(row.brand_name ?? "").trim().toLowerCase();
  const name = String(row.product_name ?? "").trim().toLowerCase();
  const key = `${brand}__${name}`;

  brandNameDedupedMap.set(key, {
    brand_name: row.brand_name,
    product_name: row.product_name,
    category: row.category,
    distro: row.distro,
    current_price: row.current_price,
    active: row.active,
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
