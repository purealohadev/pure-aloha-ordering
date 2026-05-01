import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function PATCH(request: Request) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await authClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: `PROFILE LOOKUP ERROR: ${profileError.message}` },
        { status: 500 }
      );
    }

    const role = profile?.role ?? "";
    if (role !== "manager" && role !== "admin") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json({ error: "Missing alert id." }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("price_alerts")
      .update({ status: "reviewed" })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: `PRICE ALERT UPDATE ERROR: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, alert: data });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update price alert.",
      },
      { status: 500 }
    );
  }
}
