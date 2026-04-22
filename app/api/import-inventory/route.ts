import { NextResponse } from "next/server";
import { buildInventoryUpserts, createServiceRoleClient } from "@/lib/import/server";
import type { ImportUploadRow } from "@/lib/import/shared";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rows: ImportUploadRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ error: "No rows provided." }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data: productsData, error: fetchError } = await supabase
      .from("products")
      .select("id, sku, brand_name, product_name");

    if (fetchError) {
      return NextResponse.json(
        { error: `PRODUCT FETCH ERROR: ${fetchError.message}` },
        { status: 500 }
      );
    }

    const { inventoryRows, unmatchedRows } = buildInventoryUpserts(rows, productsData ?? []);

    if (inventoryRows.length) {
      const { error: inventoryError } = await supabase.from("inventory").upsert(inventoryRows, {
        onConflict: "product_id",
        ignoreDuplicates: false,
      });

      if (inventoryError) {
        return NextResponse.json(
          { error: `INVENTORY UPSERT ERROR: ${inventoryError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
  ok: true,
  count: inventoryRows.length,
  unmatched_count: unmatchedRows.length,
  unmatched_sample: unmatchedRows,
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
