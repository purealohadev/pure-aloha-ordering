export type ImportUploadRow = {
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

export type UnmatchedInventoryRow = {
  brand: string | null;
  name: string;
  inventory: number;
  reorder_point: number;
  suggested_distributor?: string | null;
  match_type?: "hard" | "soft" | null;
  confidence?: "high" | "medium" | "low" | null;
  review_required?: boolean;
  notes?: string | null;
};

export function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function asString(value: unknown) {
  const s = String(value ?? "").trim();
  return s || "";
}

export function asNullableString(value: unknown) {
  const s = String(value ?? "").trim();
  return s || null;
}

export function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(String(value).replace(/[$,]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export function asInt(value: unknown, fallback = 0) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

export function chunkArray<T>(items: T[], size: number) {
  const out: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }

  return out;
}

export function dedupeUnmatched(items: UnmatchedInventoryRow[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${(item.brand || "").toLowerCase()}__${(item.name || "").toLowerCase()}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

export function isJunkItem(name: string) {
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

export function generateSuggestedSku(brand: string, name: string) {
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

export function guessCategory(name: string) {
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

export function normalizeBrand(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();

  const aliases: Record<string, string> = {
    kiva: "kiva",
    "kiva lost farm": "kiva",
    "lost farm": "kiva",
    rove: "rove",
    "rove ice packs": "rove",
    "raw garden": "raw garden",
    raw: "raw garden",
    stiiizy: "stiiizy",
    "stiiizy promo": "stiiizy",
    "uncle arnies": "uncle arnie's",
    "uncle arnie's": "uncle arnie's",
    "vet cbd": "vetcbd",
    vetcbd: "vetcbd",
    kingroll: "kingroll",
    "kingroll juniors": "kingroll",
    "kingroll junior": "kingroll",
    "the pairist": "the pairist",
    pairist: "the pairist",
    autumn: "autumn brands",
    "autumn brands": "autumn brands",
  };

  return aliases[raw] || raw;
}

export function normalizeLooseName(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\|/g, " ")
    .replace(/\((h|i|s|ih|hs|sh)\)/gi, " ")
    .replace(/\b\d+(\.\d+)?g\b/gi, " ")
    .replace(/\b\d+\s*x\s*\d+\b/gi, " ")
    .replace(
      /\b(indoor|flower|preroll|pre-roll|pre roll|ratio|tablets?|tablet|cartridge|cart|vape|disposable|all in one|aio|live resin|liquid diamonds|distillate|infused|smalls|badder|budder|hash|rosin|gummies|gummy|drink|tea|beverage|chocolate|pack|pk)\b/gi,
      " "
    )
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractCoreProductName(value: unknown) {
  const raw = String(value ?? "").trim();

  if (!raw) return "";

  const parts = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  const candidate = parts.length >= 2 ? parts[1] : (parts[0] ?? raw);

  return normalizeLooseName(candidate);
}

export function makeProductKey(brand: unknown, name: unknown) {
  const cleanBrand = normalizeBrand(brand);
  const cleanName = normalizeLooseName(name);

  return `${cleanBrand}__${cleanName}`;
}
