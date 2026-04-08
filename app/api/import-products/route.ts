
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function assignDistro(brand: string) {
  const rules: Record<string, string> = {
    // Kiva
    "kiva": "Kiva Sales & Service",
    "garden society": "Kiva Sales & Service",
    "seed junky": "Kiva Sales & Service",
    "uncle arnie's": "Kiva Sales & Service",
    "nasha": "Kiva Sales & Service",
    "cann": "Kiva Sales & Service",
    "the tablet": "Kiva Sales & Service",
    "emerald sky": "Kiva Sales & Service",
    "gelato": "Kiva Sales & Service",
    "keef": "Kiva Sales & Service",
    "level": "Kiva Sales & Service",
    "big pete's": "Kiva Sales & Service",
    "autumn brands": "Kiva Sales & Service",
    "pax labs": "Kiva Sales & Service",
    "the pairist": "Kiva Sales & Service",
    "clsics": "Kiva Sales & Service",
    "el blunto": "Kiva Sales & Service",
    "presha": "Kiva Sales & Service",
    "tiny fires": "Kiva Sales & Service",
    "awesome dope": "Kiva Sales & Service",
    "ultra": "Kiva Sales & Service",
    "northern harvest": "Kiva Sales & Service",
    "saida": "Kiva Sales & Service",

    // Nabis
    "auntie aloha": "Nabis",
    "dompen/ koa": "Nabis",
    "delighted": "Nabis",
    "liquid flower": "Nabis",
    "mary's medicinals": "Nabis",
    "kikoko": "Nabis",
    "green vibe": "Nabis",
    "moon valley": "Nabis",
    "om": "Nabis",
    "raw garden": "Nabis",
    "yummi karma": "Nabis",
    "vet cbd & statehouse": "Nabis",

    // overlaps routed where you asked
    "arcata fire": "Nabis",
    "pacific stone": "Nabis",

    // UpNorth
    "upnorth": "UpNorth",
    "fig farm": "UpNorth",
    "globs & daze off": "UpNorth",

    // Big Oil
    "bear labs": "Big Oil",
    "wvy": "Big Oil",

    // Boutiq & Sherbinski
    "boutiq": "Boutiq & Sherbinski",
    "sherbinski": "Boutiq & Sherbinski",
  };

  return rules[normalize(brand)] ?? "Other";
}

function parsePrice(row: Record<string, unknown>) {
  const candidates = [
    row.base_price,
    row.unit_price,
    row.Price,
    row.current_price,
    row["1.0_g_price"],
    row["0.125_oz_price"],
    row["0.25_oz_price"],
    row["0.5_g_price"],
  ];

  for (const value of candidates) {
    const cleaned = String(value ?? "").replace(/[$,]/g, "");
    const num = Number(cleaned);
    if (Number.isFinite(num) && num > 0) return num;
  }

  return 0;
}

function parseCategory(row: Record<string, unknown>) {
  const raw = normalize(
    row.category ||
      row.Category ||
      row.categories ||
      row["Product Type"] ||
      ""
  );

  if (raw.includes("vape") || raw.includes("cartridge") || raw.includes("pod") || raw.includes("disposable")) return "Vape";
  if (raw.includes("flower")) return "Flower";
  if (raw.includes("edible") || raw.includes("gummies") || raw.includes("mint")) return "Edibles";
  if (raw.includes("drink")) return "Drinks";
  if (raw.includes("concentrate") || raw.includes("badder") || raw.includes("rosin") || raw.includes("resin") || raw.includes("diamonds")) return "Concentrates";
  if (raw.includes("pre roll") || raw.includes("joint") || raw.includes("blunt")) return "Pre-Rolls";
  if (raw.includes("tincture") || raw.includes("capsule")) return "Tinctures";
  if (raw.includes("topical") || raw.includes("patch") || raw.includes("wellness")) return "Topicals";
  return "Other";
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const rows = body.rows ?? [];

    const cleanedRows = rows
      .map((row: Record<string, unknown>) => {
        const brand_name = String(row.brand_name || row.Brand || "").trim();
        const product_name = String(
          row.product_name || row["Product Name"] || row.name || ""
        ).trim();

        return {
          brand_name,
          product_name,
          category: parseCategory(row),
          distro: assignDistro(brand_name),
          current_price: parsePrice(row),
          active: true,
        };
      })
      .filter((row: { brand_name: string; product_name: string }) => row.brand_name && row.product_name);

    if (!cleanedRows.length) {
      return NextResponse.json({ success: false, error: "No valid rows found" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("products")
      .upsert(cleanedRows, {
        onConflict: "brand_name,product_name",
      })
      .select();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      count: cleanedRows.length,
      inserted: data?.length ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}
