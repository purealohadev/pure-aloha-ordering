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
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [unmatchedSample, setUnmatchedSample] = useState<any[]>([]);
  function dedupeUnmatched(items: any[]) {
  const seen = new Set();

  return items.filter((item) => {
    const key = `${(item.brand || "").toLowerCase()}__${(item.name || "").toLowerCase()}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}
function isJunkItem(name: string) {
  const n = (name || "").toLowerCase();

  return (
    n.includes("battery") ||
    n.includes("batteries") ||
    n.includes("charger") ||
    n.includes("lighter") ||
    n.includes("torch") ||
    n.includes("adapter") ||
    n.includes("cable") ||
    n.includes("tool") ||
    n.includes("device") ||
    n.includes("merch") ||
    n.includes("shirt") ||
    n.includes("hat") ||
    n.includes("hoodie") ||
    n.includes("tray")
  );
}

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
        setUnmatchedCount(data.unmatched_count || 0);
        setUnmatchedSample(
  dedupeUnmatched(data.unmatched_sample || []).filter(
    (item) => !isJunkItem(item.name)
  )
);

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
  ];

  function generateSKU(brand: string, name: string) {
    return (
      (brand || "GEN")
        .replace(/\s+/g, "")
        .toUpperCase()
        .slice(0, 6) +
      "-" +
      (name || "ITEM")
        .replace(/\s+/g, "")
        .toUpperCase()
        .slice(0, 10)
    );
  }

  function guessCategory(name: string) {
    const n = (name || "").toLowerCase();

    if (n.includes("flower") || n.includes("3.5") || n.includes("14g")) {
      return "Flower";
    }
    if (n.includes("preroll") || n.includes("pre roll")) {
      return "Preroll";
    }
    if (n.includes("vape") || n.includes("cartridge")) {
      return "Vape";
    }
    if (n.includes("gummy") || n.includes("chocolate")) {
      return "Edible";
    }
    if (n.includes("drink") || n.includes("tea")) {
      return "Beverage";
    }

    return "Misc";
  }

  const rows = dedupeUnmatched(unmatchedSample)
  .filter((item) => !isJunkItem(item.name))
  .map((item) => {
    const brand = item.brand || "Unknown";
    const name = item.name || "Unnamed";

    return [
      generateSKU(brand, name),
      brand,
      name,
      guessCategory(name),
      "Unknown",
      0,
      true,
      item.inventory || 0,
      item.reorder_point || 0,
    ];
  });

  const csvContent = [headers, ...rows]
    .map((row) =>
      row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    )
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
        {unmatchedCount > 0 && (
  <div style={{ marginTop: 20 }}>
    <h3>⚠️ Unmatched Items: {unmatchedCount}</h3>
<button onClick={downloadUnmatchedCSV}>
  Download Unmatched CSV
</button>
    <ul>
      {unmatchedSample.map((item, i) => (
        <li key={i}>
          {item.brand || "Unknown"} — {item.name}
        </li>
      ))}
    </ul>
  </div>
)}
      </div>
    </div>
  );
}