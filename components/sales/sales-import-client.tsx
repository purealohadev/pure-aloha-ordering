"use client"

import { useMemo, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  UploadCloud,
} from "lucide-react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { chunkArray, normalizeHeader } from "@/lib/import/shared"
import { cleanSalesImportRow, type SalesImportRow } from "@/lib/sales/par"

type StatusTone = "idle" | "progress" | "success" | "error"

type Props = {
  endpoint: string
}

type ParsedSalesRow = SalesImportRow

export default function SalesImportClient({ endpoint }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ParsedSalesRow[]>([])
  const [previewCount, setPreviewCount] = useState(0)
  const [importedCount, setImportedCount] = useState(0)
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState("")
  const [result, setResult] = useState("")

  const selectedFileText = file ? `${file.name} (${formatFileSize(file.size)})` : "No file selected"
  const canImport = useMemo(() => rows.length > 0 && !isImporting, [rows, isImporting])
  const statusMessage = progress || result
  const statusTone: StatusTone = progress
    ? "progress"
    : result
      ? /fail|could not|error/i.test(result)
        ? "error"
        : "success"
      : "idle"

  async function handleParse() {
    if (!file) return

    setIsParsing(true)
    setResult("")
    setProgress("Reading file...")
    setRows([])
    setPreviewCount(0)
    setImportedCount(0)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: "array" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]

      const raw = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
        header: 1,
        defval: "",
        raw: false,
      })

      const headers = (raw[0] || []).map((header) => normalizeHeader(header))
      const dataRows = raw.slice(1)

      const normalized = dataRows
        .map((values) => {
          const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]))
          return cleanSalesImportRow({
            sku: row.sku || row.product_sku || row.item_sku || row.barcode || row.upc,
            product_name: row.product_name || row.name || row.product || row.item || row.description,
            brand_name: row.brand_name || row.brand,
            quantity_sold:
              row.quantity_sold || row.qty || row.quantity || row.sold || row.units || row.count,
            sale_date: row.sale_date || row.date || row.sold_at || row.transaction_date,
          })
        })
        .filter((row): row is ParsedSalesRow => Boolean(row))

      setRows(normalized)
      setPreviewCount(normalized.length)
      setProgress(`Parsed ${normalized.length} valid rows.`)
    } catch {
      setProgress("")
      setResult("Could not parse that file.")
    } finally {
      setIsParsing(false)
    }
  }

  async function handleImport() {
    if (!rows.length) return

    setIsImporting(true)
    setResult("")
    setImportedCount(0)

    const chunks = chunkArray(rows, 500)
    let processed = 0

    try {
      for (let i = 0; i < chunks.length; i++) {
        setProgress(`Importing batch ${i + 1} of ${chunks.length}...`)

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunks[i] }),
        })

        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data?.error || `Batch ${i + 1} failed`)
        }

        processed += data.count ?? chunks[i].length
      }

      setImportedCount(processed)
      setProgress("")
      setResult(`Import complete: ${processed} sales rows processed.`)
    } catch (error) {
      setProgress("")
      setResult(error instanceof Error ? error.message : "Import failed.")
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <section className="space-y-6">
      <header className="space-y-3">
        <div className="inline-flex items-center rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground shadow-sm">
          Sales Import
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Import Sales History
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Upload CSV or spreadsheet sales history, then use it to calculate suggested pars.
          </p>
        </div>
      </header>

      <div className="rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]">
        <div className="grid gap-8 p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Upload and review</div>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                Choose a sales file, parse it locally, then load the rows into sales history.
              </p>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:min-w-[360px]">
              <StatBox label="Rows Ready" value={previewCount} tone="neutral" />
              <StatBox label="Imported Count" value={importedCount} tone="success" />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <div className="space-y-5">
              <label
                htmlFor="sales-import-file"
                className={cn(
                  "group flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition",
                  "hover:border-foreground/25 hover:bg-muted/50"
                )}
              >
                <input
                  id="sales-import-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="sr-only"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-background shadow-sm transition group-hover:scale-[1.02]">
                  <UploadCloud className="h-7 w-7 text-foreground" />
                </div>
                <div className="mt-5 space-y-2">
                  <div className="text-lg font-semibold text-foreground">
                    {file ? "File selected" : "Choose a spreadsheet file"}
                  </div>
                  <div className="text-sm leading-6 text-muted-foreground">
                    Click to browse for a `.csv`, `.xlsx`, or `.xls` file.
                  </div>
                </div>
              </label>

              <div className="rounded-2xl border border-border bg-background/80 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
                      <FileSpreadsheet className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">Selected file</div>
                      <div className="truncate text-sm text-muted-foreground">
                        {selectedFileText}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    Accepted: CSV, XLSX, XLS
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-background/70 p-5">
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">Actions</div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Parse before importing so you can confirm the row count.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <Button
                  type="button"
                  onClick={handleParse}
                  disabled={!file || isParsing || isImporting}
                  variant="outline"
                  className="justify-center"
                >
                  {isParsing ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  Parse File
                </Button>

                <Button
                  type="button"
                  onClick={handleImport}
                  disabled={!canImport || isParsing}
                  className="justify-center"
                >
                  {isImporting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  Import Sales
                </Button>
              </div>

              <div className="mt-6 space-y-3 rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>Current file</span>
                  <span className="font-medium text-foreground">{file ? file.name : "None"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Rows staged</span>
                  <span className="font-medium text-foreground">{formatNumber(previewCount)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Import endpoint</span>
                  <span className="font-medium text-foreground">{endpoint}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {statusMessage ? (
        <StatusBanner tone={statusTone} message={statusMessage} />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
          Upload a file to begin.
        </div>
      )}
    </section>
  )
}

function StatusBanner({ message, tone }: { message: string; tone: StatusTone }) {
  const icon =
    tone === "error" ? (
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
    ) : tone === "success" ? (
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
    ) : tone === "progress" ? (
      <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
    ) : (
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
    )

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-4 text-sm shadow-sm",
        tone === "progress" && "border-sky-200 bg-sky-50 text-sky-950",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-950",
        tone === "error" && "border-red-200 bg-red-50 text-red-950",
        tone === "idle" && "border-border bg-background text-foreground"
      )}
    >
      {icon}
      <div className="min-w-0">
        <div className="font-medium">
          {tone === "progress"
            ? "In progress"
            : tone === "success"
              ? "Completed"
              : tone === "error"
                ? "Attention needed"
                : "Status"}
        </div>
        <div className="mt-1 leading-6 opacity-90">{message}</div>
      </div>
    </div>
  )
}

function StatBox({
  label,
  tone,
  value,
}: {
  label: string
  tone: "neutral" | "success"
  value: number
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-4",
        tone === "neutral" && "border-border bg-background/80",
        tone === "success" && "border-emerald-200 bg-emerald-50/70"
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        {formatNumber(value)}
      </div>
    </div>
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}
