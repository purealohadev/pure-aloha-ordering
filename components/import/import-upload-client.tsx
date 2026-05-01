"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  PackagePlus,
  UploadCloud,
} from "lucide-react";
import * as XLSX from "xlsx";
import SuggestedDistributor from "@/components/SuggestedDistributor";
import { cn } from "@/lib/utils";
import {
  asInt,
  asNullableString,
  asNumber,
  asString,
  chunkArray,
  dedupeUnmatched,
  generateSuggestedSku,
  guessCategory,
  isJunkItem,
  normalizeHeader,
  type ImportUploadRow,
  type UnmatchedInventoryRow,
} from "@/lib/import/shared";

type ImportUploadClientProps = {
  title: string;
  subtitle: string;
  endpoint: string;
  actionLabel: string;
  resultLabel?: string;
  mode: "products" | "inventory";
};

type StatusTone = "idle" | "progress" | "success" | "error";

export default function ImportUploadClient({
  title,
  subtitle,
  endpoint,
  actionLabel,
  resultLabel,
  mode,
}: ImportUploadClientProps) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportUploadRow[]>([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState("");
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [unmatchedSample, setUnmatchedSample] = useState<UnmatchedInventoryRow[]>([]);
  const [acceptedUnmatchedBrandDistributors, setAcceptedUnmatchedBrandDistributors] = useState<
    Record<string, string>
  >({});
  const [isCreatingProducts, setIsCreatingProducts] = useState(false);

  const isInventoryMode = mode === "inventory";
  const canImport = useMemo(() => rows.length > 0 && !isImporting, [rows, isImporting]);
  const visibleUnmatched = useMemo(
    () => dedupeUnmatched(unmatchedSample).filter((item) => !isJunkItem(item.name)),
    [unmatchedSample]
  );
  const selectedFileText = file ? `${file.name} (${formatFileSize(file.size)})` : "No file selected";
  const statusMessage = progress || result;
  const statusTone: StatusTone = progress
    ? "progress"
    : result
      ? /fail|could not|error/i.test(result)
        ? "error"
        : "success"
      : "idle";
  const fileInputId = isInventoryMode ? "inventory-import-file" : "product-import-file";

  async function handleParse() {
    if (!file) return;

    setIsParsing(true);
    setResult("");
    setProgress("Reading file...");
    setRows([]);
    setPreviewCount(0);
    setImportedCount(0);
    setUnmatchedCount(0);
    setUnmatchedSample([]);
    setAcceptedUnmatchedBrandDistributors({});

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const raw = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
        header: 1,
        defval: "",
        raw: false,
      });

      const headers = (raw[0] || []).map((header) => normalizeHeader(header));
      const dataRows = raw.slice(1);

      const normalized: ImportUploadRow[] = dataRows
        .map((values) => {
          const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
          const brand = asNullableString(row.brand || row.brand_name);
          const name = asString(
            row.name || row.product_name || row.product || row.item || row.description
          );

          return {
            sku: asString(
              row.sku ||
                row.product_sku ||
                row.item_sku ||
                row.upc ||
                row.barcode ||
                row.id ||
                `${asString(row.brand_name || row.brand)}-${name}`
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-+|-+$/g, "")
            ),
            name,
            brand,
            vendor: asNullableString(row.vendor || row.distributor || row.distro),
            category: asNullableString(row.category || row.type || row.category_group),
            price: asNumber(
              row.price || row.unit_price || row.cost || row.retail_price || row.base_price
            ),
            inventory: asInt(
              row.inventory || row.qty || row.quantity || row.stock || row.current_inventory,
              0
            ),
            reorder_point: asInt(row.reorder_point || row.par || row.min, 0),
            is_active: String(row.is_active ?? "true").toLowerCase() !== "false",
          };
        })
        .filter((row) => row.sku && row.name);

      setRows(normalized);
      setPreviewCount(normalized.length);
      setProgress(`Parsed ${normalized.length} valid rows.`);
    } catch {
      setProgress("");
      setResult("Could not parse that file.");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleImport() {
    if (!rows.length) return;

    setIsImporting(true);
    setResult("");
    setImportedCount(0);
    setUnmatchedCount(0);
    setUnmatchedSample([]);
    setAcceptedUnmatchedBrandDistributors({});

    const chunks = chunkArray(rows, 500);
    let processed = 0;
    let nextUnmatchedCount = 0;
    const nextUnmatchedSample: UnmatchedInventoryRow[] = [];

    try {
      for (let i = 0; i < chunks.length; i++) {
        setProgress(`Importing batch ${i + 1} of ${chunks.length}...`);

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunks[i] }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || `Batch ${i + 1} failed`);
        }

        processed += data.count ?? chunks[i].length;

        if (isInventoryMode) {
          nextUnmatchedCount += data.unmatched_count || 0;
          nextUnmatchedSample.push(...((data.unmatched_sample || []) as UnmatchedInventoryRow[]));
        }
      }

      setImportedCount(processed);

      if (isInventoryMode) {
        setUnmatchedCount(nextUnmatchedCount);
        setUnmatchedSample(dedupeUnmatched(nextUnmatchedSample).filter((item) => !isJunkItem(item.name)));
      }

      setProgress("");
      setResult(`Import complete: ${processed} ${resultLabel || "rows processed"}.`);
    } catch (error) {
      setProgress("");
      setResult(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  async function handleCreateProductsFromUnmatched() {
    if (!unmatchedSample.length) return;

    setIsCreatingProducts(true);
    setResult("");

    try {
      const exactMap = new Map<string, ImportUploadRow>();

      for (const item of unmatchedSample) {
        if (isJunkItem(item.name)) continue;

        const brand = item.brand || "Unknown";
        const name = item.name || "Unnamed";
        const key = `${String(brand).trim().toLowerCase()}__${String(name).trim().toLowerCase()}`;

        if (!exactMap.has(key)) {
          const sku =
            brand.replace(/\s+/g, "").toUpperCase().slice(0, 6) +
            "-" +
            name.replace(/\s+/g, "").toUpperCase().slice(0, 10);

          const lowerName = String(name).toLowerCase();

          let category = "Misc";
          if (
            lowerName.includes("flower") ||
            lowerName.includes("3.5") ||
            lowerName.includes("14g")
          ) {
            category = "Flower";
          } else if (lowerName.includes("preroll") || lowerName.includes("pre roll")) {
            category = "Preroll";
          } else if (lowerName.includes("vape") || lowerName.includes("cartridge")) {
            category = "Vape";
          } else if (lowerName.includes("gummy") || lowerName.includes("chocolate")) {
            category = "Edible";
          } else if (lowerName.includes("drink") || lowerName.includes("tea")) {
            category = "Beverage";
          }

          exactMap.set(key, {
            sku,
            name,
            brand,
            vendor: acceptedUnmatchedBrandDistributors[getUnmatchedBrandKey(item)] ?? null,
            category,
            price: 0,
            inventory: item.inventory || 0,
            reorder_point: item.reorder_point || 0,
            is_active: true,
          });
        }
      }

      const rows = Array.from(exactMap.values());

      const res = await fetch("/api/import-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to create products from unmatched items.");
      }

      setResult(`Created ${data.count || rows.length} products from unmatched items.`);
      setUnmatchedSample([]);
      setUnmatchedCount(0);
      setProgress("Products created. Re-running inventory import...");

      setTimeout(() => {
        handleImport();
      }, 300);
    } catch (err) {
      setProgress("");
      setResult(
        err instanceof Error ? err.message : "Failed to create products from unmatched items."
      );
    } finally {
      setIsCreatingProducts(false);
    }
  }

  function downloadUnmatchedCSV() {
    if (!unmatchedSample.length) return;

    const headers = [
      "sku",
      "brand",
      "name",
      "category",
      "vendor",
      "price",
      "is_active",
      "inventory",
      "reorder_point",
      "match_type",
      "confidence",
      "review_required",
      "notes",
    ];

    const rowsForCsv = dedupeUnmatched(unmatchedSample)
      .filter((item) => !isJunkItem(item.name))
      .map((item) => {
        const brand = item.brand || "Unknown";
        const name = item.name || "Unnamed";

        return [
          generateSuggestedSku(brand, name),
          brand,
          name,
          guessCategory(name),
          acceptedUnmatchedBrandDistributors[getUnmatchedBrandKey(item)] ?? "",
          0,
          true,
          item.inventory || 0,
          item.reorder_point || 0,
          item.match_type ?? "",
          item.confidence ?? "",
          item.review_required ? "true" : "false",
          item.notes ?? "",
        ];
      });

    const csvContent = [headers, ...rowsForCsv]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.setAttribute("download", "unmatched_products_ready.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function acceptUnmatchedSuggestedDistributor(item: UnmatchedInventoryRow, distributor: string) {
    setAcceptedUnmatchedBrandDistributors((prev) => ({
      ...prev,
      [getUnmatchedBrandKey(item)]: distributor,
    }));
  }

  return (
    <section className="space-y-6">
      <header className="space-y-3">
        <div className="inline-flex items-center rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground shadow-sm">
          Spreadsheet Import
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            {subtitle}
          </p>
        </div>
      </header>

      <div className="rounded-[28px] border border-border/70 bg-card/95 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]">
        <div className="grid gap-8 p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Upload and review</div>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                Choose a CSV or spreadsheet, parse the rows locally, then run the existing import
                endpoint when the preview looks right.
              </p>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:min-w-[360px]">
              <StatBox label="Rows Ready" value={previewCount} tone="neutral" />
              <StatBox label="Imported Count" value={importedCount} tone="success" />
              {isInventoryMode ? (
                <StatBox label="Unmatched Count" value={unmatchedCount} tone="warning" />
              ) : null}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <div className="space-y-5">
              <label
                htmlFor={fileInputId}
                className={cn(
                  "group flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center transition",
                  "hover:border-foreground/25 hover:bg-muted/50"
                )}
              >
                <input
                  id={fileInputId}
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
                  Parse before importing so you can confirm row counts and catch format issues early.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <ActionButton
                  onClick={handleParse}
                  disabled={!file || isParsing || isImporting || isCreatingProducts}
                  loading={isParsing}
                  variant="secondary"
                >
                  Parse File
                </ActionButton>

                <ActionButton
                  onClick={handleImport}
                  disabled={!canImport || isParsing || isCreatingProducts}
                  loading={isImporting}
                  variant="primary"
                >
                  {actionLabel}
                </ActionButton>
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
          Upload a file to begin. Parsing happens before any import request is sent.
        </div>
      )}

      {isInventoryMode && unmatchedCount > 0 ? (
        <div className="rounded-[28px] border border-amber-200 bg-amber-50/80 shadow-[0_24px_70px_-50px_rgba(146,64,14,0.35)]">
          <div className="space-y-6 p-6 sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-amber-800">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Review Required
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-amber-950">
                  Unmatched items
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-amber-900/80">
                  These inventory rows did not match an existing product. Export them or create
                  product records first, then re-run the inventory import.
                </p>
              </div>

              <div className="text-sm font-medium text-amber-950">
                {formatNumber(unmatchedCount)} items need attention
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1">
              <ActionButton
                onClick={downloadUnmatchedCSV}
                disabled={!visibleUnmatched.length || isCreatingProducts || isImporting}
                variant="warning"
                className="shrink-0"
              >
                <Download className="h-4 w-4" />
                Download Unmatched CSV
              </ActionButton>

              <ActionButton
                onClick={handleCreateProductsFromUnmatched}
                disabled={!visibleUnmatched.length || isCreatingProducts || isImporting}
                loading={isCreatingProducts}
                variant="warningSolid"
                className="shrink-0"
              >
                <PackagePlus className="h-4 w-4" />
                Create Products From Unmatched
              </ActionButton>
            </div>

            <div className="rounded-3xl border border-amber-200/80 bg-white/80">
              <div className="border-b border-amber-200/80 px-5 py-4">
                <div className="text-sm font-medium text-amber-950">Unmatched items list</div>
                <div className="mt-1 text-sm text-amber-900/70">
                  Scroll to review the current unmatched sample captured during import.
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto px-5 py-4">
                <ul className="space-y-3">
                  {visibleUnmatched.map((item, index) => {
                    const acceptedDistributor =
                      acceptedUnmatchedBrandDistributors[getUnmatchedBrandKey(item)];
                    const suggestedDistributor =
                      !acceptedDistributor &&
                      item.match_type === "soft" &&
                      item.confidence === "medium" &&
                      item.suggested_distributor
                        ? item.suggested_distributor
                        : null;

                    return (
                      <li
                        key={`${item.brand || "unknown"}-${item.name}-${index}`}
                        className="flex items-start justify-between gap-4 rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-amber-950">
                            {item.name || "Unnamed"}
                          </div>
                          <div className="mt-1 text-sm text-amber-900/70">
                            {item.brand || "Unknown brand"}
                          </div>
                          {item.review_required ? (
                            <div className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-red-700">
                              Review distributor match
                            </div>
                          ) : suggestedDistributor ? (
                            <SuggestedDistributor
                              distributor={suggestedDistributor}
                              onSelect={(selectedDistributor) =>
                                acceptUnmatchedSuggestedDistributor(
                                  item,
                                  selectedDistributor
                                )
                              }
                              tone="light"
                              className="mt-2"
                            />
                          ) : acceptedDistributor ? (
                            <div className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
                              Distributor {acceptedDistributor}
                            </div>
                          ) : null}
                          {item.notes ? (
                            <div className="mt-1 text-xs text-amber-900/70">{item.notes}</div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right text-xs uppercase tracking-[0.16em] text-amber-800/80">
                          <div>Inventory {formatNumber(item.inventory || 0)}</div>
                          <div className="mt-1">
                            Reorder {formatNumber(item.reorder_point || 0)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ActionButton({
  children,
  className,
  disabled,
  loading,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  variant: "primary" | "secondary" | "warning" | "warningSolid";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" &&
          "bg-foreground text-background shadow-lg shadow-foreground/15 hover:bg-foreground/90",
        variant === "secondary" &&
          "border border-border bg-background text-foreground shadow-sm hover:bg-muted/60",
        variant === "warning" &&
          "border border-amber-300 bg-white text-amber-950 shadow-sm hover:bg-amber-100/70",
        variant === "warningSolid" &&
          "bg-amber-900 text-amber-50 shadow-lg shadow-amber-900/15 hover:bg-amber-950",
        className
      )}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

function StatBox({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "neutral" | "success" | "warning";
  value: number;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-4",
        tone === "neutral" && "border-border bg-background/80",
        tone === "success" && "border-emerald-200 bg-emerald-50/70",
        tone === "warning" && "border-amber-200 bg-amber-50/70"
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        {formatNumber(value)}
      </div>
    </div>
  );
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
    );

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
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function getUnmatchedBrandKey(item: UnmatchedInventoryRow) {
  return (item.brand || "").trim().toLowerCase();
}
