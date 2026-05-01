import { NextResponse } from "next/server"
import {
  buildSuggestedParUpdates,
  getTargetDaysOptions,
  getSalesWindowOptions,
  loadSuggestedParSummary,
} from "@/lib/sales/par"
import { createServiceRoleClient } from "@/lib/supabase/service"

function parseWindowDays(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10)
  return getSalesWindowOptions().includes(parsed) ? parsed : 30
}

function parseTargetDays(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10)
  return getTargetDaysOptions().includes(parsed) ? parsed : 14
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const windowDays = parseWindowDays(url.searchParams.get("window_days"))
    const targetDaysOfStock = parseTargetDays(url.searchParams.get("target_days"))
    const supabase = createServiceRoleClient()
    const summary = await loadSuggestedParSummary(supabase, {
      windowDays,
      targetDaysOfStock,
    })

    return NextResponse.json({
      ok: true,
      ...summary,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not calculate suggested pars",
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const windowDays = parseWindowDays(body?.window_days ?? body?.windowDays ?? null)
    const targetDaysOfStock = parseTargetDays(
      body?.target_days ?? body?.targetDaysOfStock ?? body?.targetDays ?? null
    )
    const supabase = createServiceRoleClient()
    const summary = await loadSuggestedParSummary(supabase, {
      windowDays,
      targetDaysOfStock,
    })
    const { data: inventoryRows, error: inventoryError } = await supabase
      .from("inventory")
      .select("product_id, on_hand, par_level, last_counted_at")

    if (inventoryError) {
      return NextResponse.json(
        { error: `INVENTORY FETCH ERROR: ${inventoryError.message}` },
        { status: 500 }
      )
    }

    const updates = buildSuggestedParUpdates(
      summary,
      (inventoryRows ?? []) as Parameters<typeof buildSuggestedParUpdates>[1]
    )
    const { error: updateError } = await supabase.from("inventory").upsert(updates, {
      onConflict: "product_id",
      ignoreDuplicates: false,
    })

    if (updateError) {
      return NextResponse.json(
        { error: `PAR UPDATE ERROR: ${updateError.message}` },
        { status: 500 }
      )
    }

    const appliedSummary = await loadSuggestedParSummary(supabase, {
      windowDays,
      targetDaysOfStock,
    })

    return NextResponse.json({
      ok: true,
      updated_count: updates.length,
      ...appliedSummary,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not apply suggested pars",
      },
      { status: 500 }
    )
  }
}
