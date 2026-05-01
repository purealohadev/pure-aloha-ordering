import { NextResponse } from "next/server"
import { chunkArray } from "@/lib/import/shared"
import { cleanSalesImportRow, type SalesImportRow } from "@/lib/sales/par"
import { createServiceRoleClient } from "@/lib/supabase/service"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const rows: Record<string, unknown>[] = Array.isArray(body?.rows) ? body.rows : []

    if (!rows.length) {
      return NextResponse.json({ error: "No rows provided." }, { status: 400 })
    }

    const cleanedRows = rows
      .map(cleanSalesImportRow)
      .filter((row): row is SalesImportRow => Boolean(row))

    if (!cleanedRows.length) {
      return NextResponse.json({ error: "No valid sales rows found." }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    let imported = 0

    for (const batch of chunkArray(cleanedRows, 500)) {
      const { error } = await supabase.from("sales_history").insert(batch)

      if (error) {
        return NextResponse.json(
          { error: `SALES IMPORT ERROR: ${error.message}` },
          { status: 500 }
        )
      }

      imported += batch.length
    }

    return NextResponse.json({
      ok: true,
      count: imported,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Import failed",
      },
      { status: 500 }
    )
  }
}
