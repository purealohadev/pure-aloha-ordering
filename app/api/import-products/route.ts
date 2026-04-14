import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ImportRow = {
  sku: string;
  brand_name: string;
  product_name: string;
  category: string | null;
  distro: string | null;
  current_price: number;
  active: boolean;
};

type RawRow = {
  sku?: unknown;
  name?: unknown;
  brand?: unknown;
  category?: unknown;
  vendor?: unknown;
  price?: unknown;
  is_active?: unknown;
  inventory?: unknown;
  reorder_point?: unknown;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function cleanRow(row: any): ImportRow | null {
  const sku = String(row.sku ?? "").trim();
  const name = String(row.name ?? "").trim();

  if (!sku || !name) return null;

  return {
    sku,
   brand_name: String(row.brand ?? "").trim() || "Unknown",
    product_name: name,
    category: String(row.category ?? "").trim() || null,
    distro: String(row.vendor ?? "").trim() || null,
    current_price:
      typeof row.price === "number"
        ? row.price
        : Number(String(row.price ?? "").replace(/[$,]/g, "").trim()) || 0,
    active: row.is_active !== false,
  };
}

function dedupeProducts(rows: ImportRow[]): ImportRow[] {
  const map = new Map<string, ImportRow>();

  for (const row of rows) {
    const key = makeProductKey(row.brand_name, row.product_name);
    map.set(key, row);
  }

  return Array.from(map.values());
}
function normalizeBrand(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();

  const map: Record<string, string> = {
    "autumn": "autumn brands",
    "autumn brands": "autumn brands",
    "the pairist": "the pairist",
    "pairist": "the pairist",
    "seed junky": "seed junky",
    "the tablet": "the tablet",
  };

  return map[raw] || raw;
}
function normalizeLooseName(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\|/g, " ")
    .replace(/\((h|i|s)\)/gi, " ")
    .replace(/\b(indoor|flower|preroll|pre-roll|ratio|tablets?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCoreProductName(value: unknown) {
  const raw = String(value ?? "").trim();

  if (!raw) return "";

  const parts = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  let candidate = raw;

  if (parts.length >= 2) {
    candidate = parts[1];
  } else if (parts.length === 1) {
    candidate = parts[0];
  }

  return candidate
    .toLowerCase()
    .replace(/\((h|i|s)\)/gi, " ")
    .replace(/\b\d+(\.\d+)?g\b/gi, " ")
    .replace(/\b(indoor|flower|preroll|pre-roll|ratio|tablets?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function makeProductKey(brand: unknown, name: unknown) {
  const cleanBrand = normalizeBrand(brand);
  const cleanName = String(name ?? "").trim().toLowerCase();

  return `${cleanBrand}__${cleanName}`;
}
export async function POST(request: Request) {
  try {
    console.log("IMPORT ROUTE HIT");

    const body = await request.json();
    const rows: RawRow[] = Array.isArray(body?.rows) ? body.rows : [];

    console.log("RAW ROW COUNT:", rows.length);

    if (!rows.length) {
      return NextResponse.json({ error: "No rows provided." }, { status: 400 });
    }

    const cleaned = rows
      .map(cleanRow)
      .filter((row): row is ImportRow => Boolean(row));

    console.log("CLEANED ROW COUNT:", cleaned.length);

    if (!cleaned.length) {
      return NextResponse.json({ error: "No valid rows found." }, { status: 400 });
    }

    const dedupedProducts = dedupeProducts(cleaned);
const skuDedupedMap = new Map<string, ImportRow>();

for (const row of dedupedProducts) {
  const sku = String(row.sku ?? "").trim();

  if (sku) {
    skuDedupedMap.set(sku, row);
  }
}

const dedupedProductsBySku = Array.from(skuDedupedMap.values());
console.log("DEDUPED PRODUCT COUNT:", dedupedProductsBySku.length);

const { data: productsData, error: fetchError } = await supabase
  .from("products")
  .select("id, sku, brand_name, product_name");

if (fetchError) {
  return NextResponse.json(
    { error: `PRODUCT FETCH ERROR: ${fetchError.message}` },
    { status: 500 }
  );
}

const existingSkuMap = new Map<
  string,
  { id: string; brand_name: string; product_name: string }
>();

for (const p of productsData ?? []) {
  const sku = String((p as any).sku ?? "").trim();
  const id = String((p as any).id ?? "").trim();
  const brand_name = String((p as any).brand_name ?? "").trim();
  const product_name = String((p as any).product_name ?? "").trim();

  if (sku) {
    existingSkuMap.set(sku, {
      id,
      brand_name,
      product_name,
    });
  }
}

const existingSkuRows = dedupedProductsBySku
  .filter((row) => existingSkuMap.has(String(row.sku ?? "").trim()))
  .map((row) => {
    const existing = existingSkuMap.get(String(row.sku ?? "").trim())!;

    return {
      id: existing.id,
      sku: row.sku,
      brand_name: existing.brand_name,
      product_name: existing.product_name,
      category: row.category,
      distro: row.distro,
      current_price: row.current_price,
      active: row.active,
    };
  });

const newSkuRows = dedupedProductsBySku.filter(
  (row) => !existingSkuMap.has(String(row.sku ?? "").trim())
);

if (existingSkuRows.length) {
  const { error: existingSkuError } = await supabase
    .from("products")
    .upsert(existingSkuRows, {
      onConflict: "id",
      ignoreDuplicates: false,
    });

  console.log("EXISTING SKU UPSERT FINISHED:", existingSkuError);

  if (existingSkuError) {
    return NextResponse.json(
      { error: `PRODUCT UPSERT ERROR: ${existingSkuError.message}` },
      { status: 500 }
    );
  }
}

if (newSkuRows.length) {
  const { error: newSkuError } = await supabase
    .from("products")
    .upsert(newSkuRows, {
      onConflict: "brand_name,product_name",
      ignoreDuplicates: false,
    });

  console.log("NEW SKU UPSERT FINISHED:", newSkuError);

  if (newSkuError) {
    return NextResponse.json(
      { error: `PRODUCT UPSERT ERROR: ${newSkuError.message}` },
      { status: 500 }
    );
  }
}

console.log("PRODUCT UPSERT FINISHED:", null);
    const productMap = new Map<string, string>(
      (productsData ?? []).map(
        (p: { id: string; brand_name: string | null; product_name: string }) => [
          makeProductKey(normalizeBrand(p.brand_name), p.product_name),
          p.id,
        ]
      )
    );
    const productNameOnlyMap = new Map<string, string>();

for (const p of productsData ?? []) {
  const normalizedName = String(p.product_name ?? "").trim().toLowerCase();

  if (!productNameOnlyMap.has(normalizedName)) {
    productNameOnlyMap.set(normalizedName, p.id);
  }
}
const productSkuMap = new Map<string, string>();

for (const p of productsData ?? []) {
  const sku = String((p as any).sku ?? "").trim();
  if (sku && !productSkuMap.has(sku)) {
    productSkuMap.set(sku, (p as any).id);
  }
}
const productLooseNameMap = new Map<string, string>();

for (const p of productsData ?? []) {
  const looseName = normalizeLooseName(p.product_name);

  if (!productLooseNameMap.has(looseName)) {
    productLooseNameMap.set(looseName, p.id);
  }
}
const productCoreNameMap = new Map<string, string>();

for (const p of productsData ?? []) {
  const coreName = extractCoreProductName(p.product_name);

  if (coreName && !productCoreNameMap.has(coreName)) {
    productCoreNameMap.set(coreName, p.id);
  }
}
const productContainsMap = new Map<string, string>();

for (const p of productsData ?? []) {
  const coreName = extractCoreProductName(p.product_name);
  const looseName = normalizeLooseName(p.product_name);

  if (coreName && !productContainsMap.has(coreName)) {
    productContainsMap.set(coreName, p.id);
  }

  if (looseName && !productContainsMap.has(looseName)) {
    productContainsMap.set(looseName, p.id);
  }
}

    const inventoryMap = new Map<
      string,
      {
        product_id: string;
        on_hand: number;
        par_level: number;
      }
    >();

    for (const row of rows) {
      const rowSku = String(row.sku ?? "").trim();
let product_id = productSkuMap.get(rowSku);

if (!product_id) {
  const key = makeProductKey(normalizeBrand(row.brand), row.name);
  product_id = productMap.get(key);
}

if (!product_id) {
  const normalizedName = String(row.name ?? "").trim().toLowerCase();
  product_id = productNameOnlyMap.get(normalizedName);
}

if (!product_id) {
  const looseName = normalizeLooseName(row.name);
  product_id = productLooseNameMap.get(looseName);
}

if (!product_id) {
  const coreName = extractCoreProductName(row.name);
  product_id = productCoreNameMap.get(coreName);
}
if (!product_id) {
  const rowLooseName = normalizeLooseName(row.name);

  for (const [candidateName, candidateId] of productContainsMap.entries()) {
    if (
      candidateName &&
      rowLooseName &&
      (rowLooseName.includes(candidateName) || candidateName.includes(rowLooseName))
    ) {
      product_id = candidateId;
      break;
    }
  }
}
if (!product_id) {
  console.log("UNMATCHED INVENTORY ROW:", {
    brand: row.brand,
    name: row.name,
    inventory: row.inventory,
    reorder_point: row.reorder_point,
  });
  continue;
}

if (!product_id) continue;

      inventoryMap.set(product_id, {
        product_id,
        on_hand: Number(row.inventory ?? 0),
        par_level: Number(row.reorder_point ?? 0),
      });
    }

    const inventoryRows = Array.from(inventoryMap.values());

    console.log("INVENTORY ROW COUNT:", inventoryRows.length);

    if (inventoryRows.length) {
      const { error: inventoryError } = await supabase
        .from("inventory")
        .upsert(inventoryRows, {
          onConflict: "product_id",
          ignoreDuplicates: false,
        });

      console.log("INVENTORY UPSERT FINISHED:", inventoryError);

      if (inventoryError) {
        return NextResponse.json(
          { error: `INVENTORY UPSERT ERROR: ${inventoryError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      count: dedupedProducts.length,
    });
  } catch (error) {
    console.error("IMPORT ROUTE ERROR:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Import failed",
      },
      { status: 500 }
    );
  }
}