"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

type Props = {
  brandOptions?: string[]
  distributorOptions?: string[]
  supportedFields?: {
    category?: boolean
    sku?: boolean
    cost?: boolean
    parLevel?: boolean
    notes?: boolean
    unitSize?: boolean
    packageSize?: boolean
  }
}

export default function ManualInventoryEntryDialog({
  brandOptions = [],
  distributorOptions = [],
  supportedFields = {},
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [form, setForm] = useState({
    brand_name: "",
    product_name: "",
    description: "",
    distro: "",
    on_hand: "",
    cost: "",
    par_level: "",
    category: "",
    sku: "",
  })

  const uniqueBrands = useMemo(
    () => Array.from(new Set(brandOptions.filter(Boolean))).sort(),
    [brandOptions]
  )

  const uniqueDistributors = useMemo(
    () => Array.from(new Set(distributorOptions.filter(Boolean))).sort(),
    [distributorOptions]
  )

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function resetForm() {
    setForm({
      brand_name: "",
      product_name: "",
      description: "",
      distro: "",
      on_hand: "",
      cost: "",
      par_level: "",
      category: "",
      sku: "",
    })
    setMessage(null)
  }

  async function handleSave() {
    const brandName = form.brand_name.trim()
    const productName = form.product_name.trim()
    const distro = form.distro.trim()
    const description = form.description.trim()
    const qty = Number.parseInt(form.on_hand || "0", 10)
    const cost = Number.parseFloat(form.cost || "0")
    const parLevel = Number.parseInt(form.par_level || "0", 10)

    if (!brandName || !productName || !distro) {
      setMessage("Brand, product, and distributor are required.")
      return
    }

    if (Number.isNaN(qty)) {
      setMessage("Inventory quantity must be a number.")
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const { data: existingProduct, error: findError } = await supabase
        .from("products")
        .select("id, product_name, brand_name, distro, current_price")
        .ilike("product_name", productName)
        .ilike("brand_name", brandName)
        .maybeSingle()

      if (findError) {
        throw findError
      }

      let productId = existingProduct?.id as string | undefined
      const oldCost = Number(existingProduct?.current_price ?? 0)

      if (!productId) {
        const productInsert: Record<string, unknown> = {
          product_name: productName,
          brand_name: brandName,
          distro,
          current_price: Number.isFinite(cost) ? cost : 0,
        }

        if (supportedFields.category && form.category.trim()) {
          productInsert.category = form.category.trim()
        }

        if (supportedFields.sku && form.sku.trim()) {
          productInsert.sku = form.sku.trim()
        }

        if (supportedFields.notes && description) {
          productInsert.notes = description
        }

        if (supportedFields.unitSize && description) {
          productInsert.unit_size = description
        }

        if (supportedFields.packageSize && description) {
          productInsert.package_size = description
        }

        const { data: newProduct, error: insertError } = await supabase
          .from("products")
          .insert(productInsert)
          .select("id")
          .single()

        if (insertError) {
          throw insertError
        }

        productId = newProduct.id
      } else {
        const productUpdate: Record<string, unknown> = {
          distro,
          current_price: Number.isFinite(cost) ? cost : 0,
        }

        if (supportedFields.category && form.category.trim()) {
          productUpdate.category = form.category.trim()
        }

        if (supportedFields.sku && form.sku.trim()) {
          productUpdate.sku = form.sku.trim()
        }

        if (supportedFields.notes && description) {
          productUpdate.notes = description
        }

        if (supportedFields.unitSize && description) {
          productUpdate.unit_size = description
        }

        if (supportedFields.packageSize && description) {
          productUpdate.package_size = description
        }

        const { error: updateError } = await supabase
          .from("products")
          .update(productUpdate)
          .eq("id", productId)

        if (updateError) {
          throw updateError
        }

        if (Number.isFinite(cost) && cost > 0 && oldCost !== cost) {
          await supabase.from("price_history").insert({
            product_id: productId,
            old_cost: oldCost,
            new_cost: cost,
            source: "manual",
          })
        }
      }

      const inventoryUpsert: Record<string, unknown> = {
        product_id: productId,
        on_hand: qty,
      }

      if (supportedFields.parLevel) {
        inventoryUpsert.par_level = Number.isFinite(parLevel) ? parLevel : 0
      }

      const { error: inventoryError } = await supabase
        .from("inventory")
        .upsert(inventoryUpsert, {
          onConflict: "product_id",
        })

      if (inventoryError) {
        throw inventoryError
      }

      resetForm()
      setOpen(false)
      router.refresh()
    } catch (error) {
      console.error(error)
      setMessage(error instanceof Error ? error.message : "Failed to save item.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex justify-start sm:justify-end">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20"
      >
        + Add Manual Inventory Item
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-background p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-blue-400">
                  Add Manual Inventory Item
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create or update a product, brand, distributor, cost, and inventory count.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  resetForm()
                  setOpen(false)
                }}
                className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground hover:bg-muted"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Brand
                </label>
                <input
                  list="manual-brand-options"
                  value={form.brand_name}
                  onChange={(event) => updateField("brand_name", event.target.value)}
                  placeholder="Emerald Sky"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <datalist id="manual-brand-options">
                  {uniqueBrands.map((brand) => (
                    <option key={brand} value={brand} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Distributor
                </label>
                <input
                  list="manual-distributor-options"
                  value={form.distro}
                  onChange={(event) => updateField("distro", event.target.value)}
                  placeholder="Choose or type distributor"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <datalist id="manual-distributor-options">
                  {uniqueDistributors.map((distro) => (
                    <option key={distro} value={distro} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Product
                </label>
                <input
                  value={form.product_name}
                  onChange={(event) => updateField("product_name", event.target.value)}
                  placeholder="Peanut Butter Cups (I)"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Size / Weight / Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(event) => updateField("description", event.target.value)}
                  placeholder="10mg THC / 2mg CBD x 10 Infused Peanut Butter Cups"
                  className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              {supportedFields.category ? (
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Category
                  </label>
                  <input
                    value={form.category}
                    onChange={(event) => updateField("category", event.target.value)}
                    placeholder="Edibles"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              ) : null}

              {supportedFields.sku ? (
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    SKU
                  </label>
                  <input
                    value={form.sku}
                    onChange={(event) => updateField("sku", event.target.value)}
                    placeholder="Optional SKU"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              ) : null}

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Inventory Qty
                </label>
                <input
                  type="number"
                  value={form.on_hand}
                  onChange={(event) => updateField("on_hand", event.target.value)}
                  placeholder="0"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Cost / Wholesale Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.cost}
                  onChange={(event) => updateField("cost", event.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              {supportedFields.parLevel ? (
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Par Level
                  </label>
                  <input
                    type="number"
                    value={form.par_level}
                    onChange={(event) => updateField("par_level", event.target.value)}
                    placeholder="0"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              ) : null}
            </div>

            {message ? (
              <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {message}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  resetForm()
                  setOpen(false)
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Item"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}