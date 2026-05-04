"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Plus, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type SupportedFields = {
  category: boolean
  sku: boolean
  cost: boolean
  parLevel: boolean
  notes: boolean
  unitSize: boolean
  packageSize: boolean
}

type Props = {
  brandOptions: string[]
  distributorOptions: string[]
  supportedFields: SupportedFields
}

type FormState = {
  productName: string
  brand: string
  distributor: string
  currentQuantity: string
  category: string
  sku: string
  cost: string
  parLevel: string
  notes: string
  unitSize: string
  packageSize: string
}

const EMPTY_FORM: FormState = {
  productName: "",
  brand: "",
  distributor: "",
  currentQuantity: "",
  category: "",
  sku: "",
  cost: "",
  parLevel: "",
  notes: "",
  unitSize: "",
  packageSize: "",
}

function normalizeSuggestions(values: string[]) {
  const map = new Map<string, string>()

  for (const value of values) {
    const trimmed = value.trim()

    if (!trimmed) continue

    const key = trimmed.toLowerCase()
    if (!map.has(key)) {
      map.set(key, trimmed)
    }
  }

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b))
}

function FieldLabel({
  label,
  required = false,
}: {
  label: string
  required?: boolean
}) {
  return (
    <label className="block text-sm font-medium text-foreground">
      <span>{label}</span>
      {required ? <span className="ml-1 text-red-400">*</span> : null}
    </label>
  )
}

export default function ManualInventoryEntryDialog({
  brandOptions,
  distributorOptions,
  supportedFields,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const normalizedBrandOptions = useMemo(
    () => normalizeSuggestions(brandOptions),
    [brandOptions]
  )
  const normalizedDistributorOptions = useMemo(
    () => normalizeSuggestions(distributorOptions),
    [distributorOptions]
  )
  const showOptionalSection =
    supportedFields.category ||
    supportedFields.sku ||
    supportedFields.cost ||
    supportedFields.parLevel ||
    supportedFields.notes ||
    supportedFields.unitSize ||
    supportedFields.packageSize

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function openDialog() {
    setOpen(true)
    setError(null)
  }

  function closeDialog() {
    if (isSaving) return
    setOpen(false)
    setError(null)
  }

  function resetForm() {
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch("/api/manual-inventory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data?.error || "Could not save manual inventory item.")
      }

      setSuccess(data?.message || "Manual inventory item saved.")
      setOpen(false)
      resetForm()
      router.refresh()
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save manual inventory item.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={openDialog}
        className="w-full justify-center sm:w-auto sm:justify-start"
      >
        <Plus className="size-4" />
        Add Manual Inventory Item
      </Button>

      {success ? (
        <p className="text-sm text-emerald-400" role="status" aria-live="polite">
          {success}
        </p>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-2 backdrop-blur-sm sm:p-4"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeDialog()
            }
          }}
        >
          <Card className="relative mx-auto mt-6 w-full max-w-3xl border-border/80 bg-card/95 shadow-2xl shadow-black/40">
            <CardHeader className="border-b border-border/60">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle>Add Manual Inventory Item</CardTitle>
                  <CardDescription>
                    Create a product and inventory count when imports miss an item.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeDialog}
                  disabled={isSaving}
                  aria-label="Close manual inventory dialog"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 pt-4">
              {error ? (
                <div
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
                  role="alert"
                >
                  {error}
                </div>
              ) : null}

              <form className="space-y-5" onSubmit={handleSubmit}>
                <section className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <FieldLabel label="Product name" required />
                    <Input
                      value={form.productName}
                      onChange={(event) => updateField("productName", event.target.value)}
                      placeholder="Example: Blue Dream 3.5g"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <FieldLabel label="Brand" required />
                    <Input
                      value={form.brand}
                      onChange={(event) => updateField("brand", event.target.value)}
                      placeholder="Select or type a brand"
                      list="manual-brand-options"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <FieldLabel label="Distributor" required />
                    <Input
                      value={form.distributor}
                      onChange={(event) => updateField("distributor", event.target.value)}
                      placeholder="Select or type a distributor"
                      list="manual-distributor-options"
                      required
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <FieldLabel label="Current inventory quantity" required />
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={form.currentQuantity}
                      onChange={(event) => updateField("currentQuantity", event.target.value)}
                      placeholder="0"
                      required
                    />
                  </div>
                </section>

                {showOptionalSection ? (
                  <section className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="space-y-1">
                      <h2 className="text-sm font-semibold text-foreground">Optional details</h2>
                      <p className="text-xs text-muted-foreground">
                        Only fields supported by the current schema are shown here.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      {supportedFields.category ? (
                        <div className="space-y-2">
                          <FieldLabel label="Category" />
                          <Input
                            value={form.category}
                            onChange={(event) => updateField("category", event.target.value)}
                            placeholder="Example: Flower"
                          />
                        </div>
                      ) : null}

                      {supportedFields.sku ? (
                        <div className="space-y-2">
                          <FieldLabel label="SKU" />
                          <Input
                            value={form.sku}
                            onChange={(event) => updateField("sku", event.target.value)}
                            placeholder="Example: SKU-1234"
                          />
                        </div>
                      ) : null}

                      {supportedFields.cost ? (
                        <div className="space-y-2">
                          <FieldLabel label="Cost" />
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={form.cost}
                            onChange={(event) => updateField("cost", event.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                      ) : null}

                      {supportedFields.parLevel ? (
                        <div className="space-y-2">
                          <FieldLabel label="Par level" />
                          <Input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            value={form.parLevel}
                            onChange={(event) => updateField("parLevel", event.target.value)}
                            placeholder="0"
                          />
                        </div>
                      ) : null}

                      {supportedFields.unitSize ? (
                        <div className="space-y-2">
                          <FieldLabel label="Unit size" />
                          <Input
                            value={form.unitSize}
                            onChange={(event) => updateField("unitSize", event.target.value)}
                            placeholder="Example: 3.5g"
                          />
                        </div>
                      ) : null}

                      {supportedFields.packageSize ? (
                        <div className="space-y-2">
                          <FieldLabel label="Package size" />
                          <Input
                            value={form.packageSize}
                            onChange={(event) => updateField("packageSize", event.target.value)}
                            placeholder="Example: 10-pack"
                          />
                        </div>
                      ) : null}

                      {supportedFields.notes ? (
                        <div className="space-y-2 sm:col-span-2">
                          <FieldLabel label="Notes" />
                          <textarea
                            value={form.notes}
                            onChange={(event) => updateField("notes", event.target.value)}
                            placeholder="Internal notes or context"
                            className={cn(
                              "min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                            )}
                          />
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={closeDialog} disabled={isSaving}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <datalist id="manual-brand-options">
            {normalizedBrandOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <datalist id="manual-distributor-options">
            {normalizedDistributorOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
      ) : null}
    </div>
  )
}
