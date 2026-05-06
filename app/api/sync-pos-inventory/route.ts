import { NextResponse } from "next/server"
import { syncPosInventoryToSupabase, type PosInventoryInputRow } from "@/app/lib/posSync"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const rows = Array.isArray(body)
      ? (body as PosInventoryInputRow[])
      : Array.isArray((body as { rows?: PosInventoryInputRow[] }).rows)
        ? ((body as { rows?: PosInventoryInputRow[] }).rows as PosInventoryInputRow[])
      : undefined

    const result = await syncPosInventoryToSupabase({
      rows,
      source: rows ? "pos" : undefined,
    })

    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        source: "mock",
        imported_count: 0,
        unmatched_count: 0,
        errors: [error instanceof Error ? error.message : "POS inventory sync failed"],
      },
      { status: 500 }
    )
  }
}
