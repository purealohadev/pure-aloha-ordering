import { NextResponse } from "next/server";
import { buildInventoryUpserts, createServiceRoleClient } from "@/lib/import/server";
import type { ImportUploadRow } from "@/lib/import/shared";
import { loadPublicTableColumns } from "@/lib/supabase/table-columns";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rows: ImportUploadRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ error: "No rows provided." }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const productColumns = await loadPublicTableColumns(supabase, "products");
    const productSelectFields = [
      "id",
      "sku",
      productColumns.has("barcode") ? "barcode" : null,
      "brand_name",
      "product_name",
    ]
      .filter(Boolean)
      .join(", ");

    const { data: productsData, error: fetchError } = await supabase
      .from("products")
      .select(productSelectFields);

    if (fetchError) {
      return NextResponse.json(
        { error: `PRODUCT FETCH ERROR: ${fetchError.message}` },
        { status: 500 }
      );
    }

    const { inventoryRows, unmatchedRows, summary } = buildInventoryUpserts(
      rows,
      (productsData ?? []) as unknown as Array<{
        id: string;
        sku: string | null;
        barcode?: string | null;
        brand_name: string | null;
        product_name: string;
      }>
    );

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
      total_rows: summary.totalRows,
      matched_rows: summary.matchedRows,
      unmatched_count: unmatchedRows.length,
      skipped_rows: summary.skippedRows,
      duplicate_rows_skipped: summary.duplicateRowsSkipped,
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
