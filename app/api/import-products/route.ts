import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ImportRow = {
  brand_name: string | null;
  product_name: string;
  category: string | null;
  distro: string | null;
  current_price: number;
  active: boolean;
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
  brand_name: row.brand?.trim() || null,
  product_name: row.name,
  category: row.category?.trim() || null,
  distro: row.vendor?.trim() || null,
  current_price: typeof row.price === "number" ? row.price : 0,
  active: row.is_active !== false,
};
}

function chunkArray<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ error: "No rows provided." }, { status: 400 });
    }

    const cleaned = rows
  .map(cleanRow)
  .filter((row: ImportRow | null): row is ImportRow => Boolean(row));

    if (!cleaned.length) {
      return NextResponse.json({ error: "No valid rows found." }, { status: 400 });
    }

    const dbChunks = cleaned; // already chunked from frontend

    const { error } = await supabase
      .from("products")
      .upsert(dbChunks, {
        onConflict: "brand_name,product_name",
        ignoreDuplicates: false,
      });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      count: cleaned.length,
    });
    } catch (error) {
    console.error("IMPORT ROUTE ERROR:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Import failed"
      },
      { status: 500 }
    );
  }
}