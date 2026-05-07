import { NextResponse } from "next/server";
import { UNKNOWN_DISTRIBUTOR, resolveDistributorBrand } from "@/lib/inventory/distributors";
import { createClient } from "@/lib/supabase/server";
import {
  getCreditExportFields,
  groupCreditTotals,
  type CreditTransactionForTotals,
} from "@/lib/vendor-credit-notes";
import { Resend } from "resend";
import { VENDOR_EMAILS } from "@/lib/vendorEmails";

const resend = new Resend(process.env.RESEND_API_KEY);

type SentEmail = {
  distributor: string;
  to: string;
  email_id?: string;
  attachment: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const orderId = body.order_id;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "Missing order_id" },
        { status: 400 }
      );
    }

    // 1. Get order lines
    const { data: lines, error: lineError } = await supabase
      .from("purchase_order_lines")
      .select("product_id, order_qty, unit_price")
      .eq("purchase_order_id", orderId);

    if (lineError) {
      return NextResponse.json(
        { success: false, error: lineError.message },
        { status: 500 }
      );
    }

    const productIds = [...new Set(lines?.map((l) => l.product_id) || [])];

    // 2. Get products
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id, brand_name, product_name, sku, category, distro")
      .in("id", productIds);

    if (productError) {
      return NextResponse.json(
        { success: false, error: productError.message },
        { status: 500 }
      );
    }

    const productMap = new Map(products?.map((p) => [p.id, p]) || []);

    const { data: creditTransactions, error: creditError } = await supabase
      .from("credit_transactions")
      .select("distributor, vendor_name, credit_type, credit_amount, status");

    if (creditError) {
      return NextResponse.json(
        { success: false, error: creditError.message },
        { status: 500 }
      );
    }

    const creditTotals = groupCreditTotals(
      (creditTransactions as CreditTransactionForTotals[] | null) ?? []
    );

    // 3. Build rows
    const rows =
      lines?.map((line) => {
        const product = productMap.get(line.product_id);
        const brand = product?.brand_name || "";
        const resolution = resolveDistributorBrand(brand, product?.distro);
        const distributor = resolution?.review_required
          ? UNKNOWN_DISTRIBUTOR
          : resolution?.distributor ?? UNKNOWN_DISTRIBUTOR;
        const creditFields = getCreditExportFields(creditTotals, distributor, brand);

        return {
          distributor,
          brand,
          product: product?.product_name || "",
          sku: product?.sku || "",
          category: product?.category || "",
          order_qty: line.order_qty,
          unit_price: line.unit_price,
          line_total:
            Number(line.order_qty || 0) * Number(line.unit_price || 0),
          available_credit: creditFields.available_credit,
          credit_note: creditFields.credit_note,
        };
      }) || [];

    // 4. Group by distributor
    const grouped: Record<string, typeof rows> = {};

    rows.forEach((row) => {
      if (!grouped[row.distributor]) grouped[row.distributor] = [];
      grouped[row.distributor].push(row);
    });

    // 5. Send emails
    const sent: SentEmail[] = [];

    for (const [distributor, distributorRows] of Object.entries(grouped)) {
      const to =
        VENDOR_EMAILS[distributor] ||
        VENDOR_EMAILS["Unknown Distributor"];

      // Build CSV
      const csv = [
        [
          "Distributor",
          "Brand",
          "Product",
          "SKU",
          "Category",
          "Order Qty",
          "Unit Price",
          "Line Total",
          "Available Credit",
          "Credit Note",
        ].join(","),
        ...distributorRows.map((row) =>
          [
            row.distributor,
            row.brand,
            row.product,
            row.sku,
            row.category,
            row.order_qty,
            row.unit_price,
            row.line_total.toFixed(2),
            row.available_credit,
            row.credit_note,
          ]
            .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
            .join(",")
        ),
      ].join("\n");

      // 🔴 TEMP: sandbox restriction (send to yourself only)
      const result = await resend.emails.send({
        from: "Pure Aloha Orders <onboarding@resend.dev>",
        to: "purealoha1377@getpurealoha.com",
        subject: `PO - ${distributor}`,
        text: `Attached is your purchase order.`,
        attachments: [
          {
            filename: `${distributor}.csv`,
            content: Buffer.from(csv).toString("base64"),
          },
        ],
      });

      sent.push({
        distributor,
        to,
        email_id: result.data?.id,
        attachment: `${distributor}.csv`,
      });
    }

    return NextResponse.json({
      success: true,
      sent,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
