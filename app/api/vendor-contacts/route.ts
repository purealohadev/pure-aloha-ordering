import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/import/server";
import { normalizeVendorContactInput } from "@/lib/vendor-contacts";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const contact = normalizeVendorContactInput(body?.contact ?? body ?? {});

    if (!contact.distributor && !contact.vendor_name && !contact.rep_name) {
      return NextResponse.json(
        { error: "Add at least a distributor, vendor name, or rep name." },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("vendor_contacts")
      .insert(contact)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: `VENDOR CONTACT CREATE ERROR: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, contact: data });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Vendor contact create failed",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id : "";

    if (!id) {
      return NextResponse.json({ error: "Missing vendor contact id." }, { status: 400 });
    }

    const contact = normalizeVendorContactInput(body?.contact ?? {});
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("vendor_contacts")
      .update({
        ...contact,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: `VENDOR CONTACT UPDATE ERROR: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, contact: data });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Vendor contact update failed",
      },
      { status: 500 }
    );
  }
}
