import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/import/server";
import { asNumber, asNullableString } from "@/lib/import/shared";

type CreditTransactionImportRow = {
  distributor?: unknown;
  vendor_name?: unknown;
  credit_type?: unknown;
  credit_amount?: unknown;
  credit_date?: unknown;
  status?: unknown;
  notes?: unknown;
};

function normalizeCreditStatus(value: string | null) {
  const status = (value || "").trim().toLowerCase();

  if (["used", "closed"].includes(status)) return "Used";
  if (status.includes("used") || status.includes("closed")) return "Used";

  return "Available";
}

function cleanCreditTransaction(row: CreditTransactionImportRow) {
  const distributor = asNullableString(row.distributor);
  const vendorName = asNullableString(row.vendor_name);
  const creditType = asNullableString(row.credit_type);
  const creditAmount = asNumber(row.credit_amount) ?? 0;
  const creditDate = asNullableString(row.credit_date);
  const status = normalizeCreditStatus(asNullableString(row.status));
  const notes = asNullableString(row.notes);

  if (!distributor && !vendorName && !creditType && creditAmount === 0 && !creditDate) {
    return null;
  }

  return {
    distributor,
    vendor_name: vendorName,
    credit_type: creditType,
    credit_amount: creditAmount,
    credit_date: creditDate,
    status,
    notes,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rows: CreditTransactionImportRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ error: "No rows provided." }, { status: 400 });
    }

    const cleanedRows = rows
      .map(cleanCreditTransaction)
      .filter((row): row is NonNullable<ReturnType<typeof cleanCreditTransaction>> =>
        Boolean(row)
      );

    if (!cleanedRows.length) {
      return NextResponse.json({ error: "No valid credit transactions found." }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("credit_transactions").insert(cleanedRows);

    if (error) {
      return NextResponse.json(
        { error: `CREDIT TRANSACTION IMPORT ERROR: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      count: cleanedRows.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Credit transaction import failed",
      },
      { status: 500 }
    );
  }
}
