import { NextResponse } from "next/server"
import { asString } from "@/lib/import/shared"
import { createServiceRoleClient } from "@/lib/supabase/service"
import { loadPublicTableColumns } from "@/lib/supabase/table-columns"

type ManualInventoryRequest = {
  productName?: unknown
  brand?: unknown
  distributor?: unknown
  currentQuantity?: unknown
  category?: unknown
  sku?: unknown
  cost?: unknown
  parLevel?: unknown
  notes?: unknown
  unitSize?: unknown
  packageSize?: unknown
}

function normalizeExactKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function parseRequiredInteger(value: unknown, label: string) {
  const raw = asString(value)

  if (!raw) {
    return { error: `${label} is required.` }
  }

  const parsed = Number(raw.replace(/[$,]/g, ""))

  if (!Number.isFinite(parsed)) {
    return { error: `${label} must be a number.` }
  }

  const quantity = Math.round(parsed)

  if (quantity < 0) {
    return { error: `${label} cannot be negative.` }
  }

  return { value: quantity }
}

function parseOptionalNumber(value: unknown, label: string) {
  const raw = asString(value)

  if (!raw) {
    return { value: null }
  }

  const parsed = Number(raw.replace(/[$,]/g, ""))

  if (!Number.isFinite(parsed)) {
    return { error: `${label} must be a number.` }
  }

  return { value: parsed }
}

function parseOptionalText(value: unknown) {
  const text = asString(value)
  return text ? text : null
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ManualInventoryRequest
    const productName = asString(body.productName)
    const brand = asString(body.brand)
    const distributor = asString(body.distributor)
    const currentQuantityResult = parseRequiredInteger(body.currentQuantity, "Current inventory quantity")
    const category = parseOptionalText(body.category)
    const sku = parseOptionalText(body.sku)
    const costResult = parseOptionalNumber(body.cost, "Cost")
    const parLevelResult = parseOptionalNumber(body.parLevel, "Par level")
    const notes = parseOptionalText(body.notes)
    const unitSize = parseOptionalText(body.unitSize)
    const packageSize = parseOptionalText(body.packageSize)

    if (!productName) {
      return NextResponse.json({ error: "Product name is required." }, { status: 400 })
    }

    if (!brand) {
      return NextResponse.json({ error: "Brand is required." }, { status: 400 })
    }

    if (!distributor) {
      return NextResponse.json({ error: "Distributor is required." }, { status: 400 })
    }

    if ("error" in currentQuantityResult) {
      return NextResponse.json({ error: currentQuantityResult.error }, { status: 400 })
    }

    if ("error" in costResult) {
      return NextResponse.json({ error: costResult.error }, { status: 400 })
    }

    if ("error" in parLevelResult) {
      return NextResponse.json({ error: parLevelResult.error }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const [productColumns, inventoryColumns] = await Promise.all([
      loadPublicTableColumns(supabase, "products"),
      loadPublicTableColumns(supabase, "inventory"),
    ])

    const { data: products, error: productFetchError } = await supabase
      .from("products")
      .select("id, brand_name, product_name")

    if (productFetchError) {
      return NextResponse.json(
        { error: `PRODUCT LOOKUP ERROR: ${productFetchError.message}` },
        { status: 500 }
      )
    }

    const normalizedProductKey = `${normalizeExactKey(brand)}__${normalizeExactKey(productName)}`
    const existingProduct = (products ?? []).find((row) => {
      const rowBrand = asString((row as { brand_name?: unknown }).brand_name)
      const rowProductName = asString((row as { product_name?: unknown }).product_name)
      return `${normalizeExactKey(rowBrand)}__${normalizeExactKey(rowProductName)}` === normalizedProductKey
    }) as { id: string } | undefined

    const productPayload: Record<string, unknown> = {
      brand_name: brand,
      product_name: productName,
      distro: distributor,
    }

    if (productColumns.has("sku") && sku != null) {
      productPayload.sku = sku
    }

    if (productColumns.has("category") && category != null) {
      productPayload.category = category
    }

    if (productColumns.has("current_price") && costResult.value != null) {
      productPayload.current_price = costResult.value
    }

    if (productColumns.has("unit_cost") && costResult.value != null) {
      productPayload.unit_cost = costResult.value
    }

    if (productColumns.has("cost") && costResult.value != null) {
      productPayload.cost = costResult.value
    }

    if (productColumns.has("active") && !existingProduct) {
      productPayload.active = true
    }

    if (productColumns.has("unit_size") && unitSize != null) {
      productPayload.unit_size = unitSize
    }

    if (productColumns.has("package_size") && packageSize != null) {
      productPayload.package_size = packageSize
    }

    if (productColumns.has("notes") && notes != null) {
      productPayload.notes = notes
    }

    let productId = existingProduct?.id ?? null
    let createdProduct = false

    if (existingProduct) {
      const { error: updateError } = await supabase
        .from("products")
        .update(productPayload)
        .eq("id", existingProduct.id)

      if (updateError) {
        return NextResponse.json(
          { error: `PRODUCT UPDATE ERROR: ${updateError.message}` },
          { status: 500 }
        )
      }
    } else {
      const insertPayload: Record<string, unknown> = { ...productPayload }

      if (productColumns.has("current_price")) {
        insertPayload.current_price = costResult.value ?? 0
      }

      const { data: insertedProduct, error: insertError } = await supabase
        .from("products")
        .insert(insertPayload)
        .select("id")
        .single()

      if (insertError) {
        return NextResponse.json(
          { error: `PRODUCT INSERT ERROR: ${insertError.message}` },
          { status: 500 }
        )
      }

      productId = insertedProduct.id
      createdProduct = true
    }

    if (!productId) {
      return NextResponse.json({ error: "Could not resolve product record." }, { status: 500 })
    }

    const { data: inventoryRows, error: inventoryFetchError } = await supabase
      .from("inventory")
      .select("product_id, on_hand, par_level, last_counted_at")
      .eq("product_id", productId)
      .limit(1)

    if (inventoryFetchError) {
      return NextResponse.json(
        { error: `INVENTORY LOOKUP ERROR: ${inventoryFetchError.message}` },
        { status: 500 }
      )
    }

    const inventoryPayload: Record<string, unknown> = {
      product_id: productId,
      on_hand: currentQuantityResult.value,
      last_counted_at: new Date().toISOString(),
    }

    if (inventoryColumns.has("par_level") && parLevelResult.value != null) {
      inventoryPayload.par_level = parLevelResult.value
    }

    let createdInventory = false

    if (inventoryRows?.length) {
      const existingInventory = inventoryRows[0] as { product_id: string }
      const updatePayload: Record<string, unknown> = {
        on_hand: inventoryPayload.on_hand,
        last_counted_at: inventoryPayload.last_counted_at,
      }

      if ("par_level" in inventoryPayload) {
        updatePayload.par_level = inventoryPayload.par_level
      }

      const { error: inventoryUpdateError } = await supabase
        .from("inventory")
        .update(updatePayload)
        .eq("product_id", existingInventory.product_id)

      if (inventoryUpdateError) {
        return NextResponse.json(
          { error: `INVENTORY UPDATE ERROR: ${inventoryUpdateError.message}` },
          { status: 500 }
        )
      }
    } else {
      const { error: inventoryInsertError } = await supabase
        .from("inventory")
        .insert(inventoryPayload)

      if (inventoryInsertError) {
        return NextResponse.json(
          { error: `INVENTORY INSERT ERROR: ${inventoryInsertError.message}` },
          { status: 500 }
        )
      }

      createdInventory = true
    }

    return NextResponse.json({
      ok: true,
      created_product: createdProduct,
      created_inventory: createdInventory,
      product_id: productId,
      message: createdProduct
        ? createdInventory
          ? `Created ${productName} and added the inventory count.`
          : `Created ${productName} and updated its inventory count.`
        : createdInventory
          ? `Updated ${productName} and created its inventory record.`
          : `Updated ${productName} inventory count.`,
      updated_fields: {
        sku: sku != null,
        category: category != null,
        cost: costResult.value != null,
        par_level: parLevelResult.value != null,
        notes: notes != null,
        unit_size: unitSize != null,
        package_size: packageSize != null,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Manual inventory save failed",
      },
      { status: 500 }
    )
  }
}
