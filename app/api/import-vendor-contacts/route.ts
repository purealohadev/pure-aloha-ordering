import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/import/server";
import { cleanVendorContact, type VendorContactImportRow } from "@/lib/vendor-contacts";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rows: VendorContactImportRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ error: "No rows provided." }, { status: 400 });
    }

    const cleanedRows = rows
      .map(cleanVendorContact)
      .filter((row): row is NonNullable<ReturnType<typeof cleanVendorContact>> => Boolean(row));

    if (!cleanedRows.length) {
      return NextResponse.json({ error: "No valid vendor contacts found." }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("vendor_contacts")
      .insert(cleanedRows)
      .select("*")
      .order("distributor", { ascending: true })
      .order("vendor_name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: `VENDOR CONTACT IMPORT ERROR: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      count: cleanedRows.length,
      contacts: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Vendor contact import failed",
      },
      { status: 500 }
    );
  }
}
