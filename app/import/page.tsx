"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type ImportRow = {
  sku: string;
  name: string;
  brand: string | null;
  vendor: string | null;
  category: string | null;
  price: number | null;
  inventory: number;
  reorder_point: number;
  is_active: boolean;
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function asString(value: unknown) {
  const s = String(value ?? "").trim();
  return s || "";
}

function asNullableString(value: unknown) {
  const s = String(value ?? "").trim();
  return s || null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[$,]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function asInt(value: unknown, fallback = 0) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function chunkArray<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<string>("");

  const canImport = useMemo(() => rows.length > 0 && !isImporting, [rows, isImporting]);

  async function handleParse() {
    if (!file) return;

    setIsParsing(true);
    setResult("");
    setProgress("Reading file...");

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

console.log("RAW SHEET:", raw);

      const headers = (raw[0] || []).map((h) => normalizeHeader(h));
console.log("HEADERS:", headers);

const dataRows = raw.slice(1);

const normalized: ImportRow[] = dataRows
  .map((values) => {
    const row = Object.fromEntries(headers.map((header, i) => [header, values[i]]));

    return {
      sku: asString(
  row.sku ||
    row.product_sku ||
    row.item_sku ||
    row.upc ||
    row.barcode ||
    row.id ||
    `${asString(row.brand_name)}-${asString(row.name)}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
),
      name: asString(
        row.name ||
          row.product_name ||
          row.product ||
          row.item ||
          row.description
      ),
      brand: asNullableString(row.brand || row.brand_name),
      vendor: asNullableString(row.vendor || row.distributor || row.distro),
      category: asNullableString(row.category || row.type || row.category_group),
      price: asNumber(row.price || row.unit_price || row.cost || row.retail_price || row.base_price),
      inventory: asInt(
  row.inventory || row.qty || row.quantity || row.stock || row.current_inventory,
  0
),
      reorder_point: asInt(row.reorder_point || row.par || row.min, 0),
      is_active: String(row.is_active ?? "true").toLowerCase() !== "false",
    };
  })
  .filter((r) => r.sku && r.name);

      setRows(normalized);
      setPreviewCount(normalized.length);
      setProgress(`Parsed ${normalized.length} valid rows.`);
    } catch (err) {
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
    const chunks = chunkArray(rows, 500);

    let imported = 0;

    try {
      for (let i = 0; i < chunks.length; i++) {
        setProgress(`Importing batch ${i + 1} of ${chunks.length}...`);

        const res = await fetch("/api/import-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: chunks[i],
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || `Batch ${i + 1} failed`);
        }

        imported += data.count ?? chunks[i].length;
      }

      setProgress("");
      setResult(`Import complete: ${imported} rows processed.`);
    }  catch (err) {
  setResult(err instanceof Error ? err.message : "Import failed.");
} finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Import Products</h1>

        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <div className="flex gap-3">
          <button onClick={handleParse} disabled={!file || isParsing}>
            Parse File
          </button>

          <button onClick={handleImport} disabled={!canImport}>
            Import Rows
          </button>
        </div>

        {progress && <div>{progress}</div>}
        {previewCount > 0 && <div>Rows ready: {previewCount}</div>}
        {result && <div>{result}</div>}
      </div>
    </div>
  );
}