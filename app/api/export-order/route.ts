import JSZip from "jszip";
import { UNKNOWN_DISTRIBUTOR, resolveDistributorBrand } from "@/lib/inventory/distributors";
import { createClient } from "@/lib/supabase/server";
import {
  getCreditExportFields,
  groupCreditTotals,
  type CreditTransactionForTotals,
} from "@/lib/vendor-credit-notes";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("order_id");

  if (!orderId) {
    return Response.json({ error: "Missing order_id" }, { status: 400 });
  }

  const { data: lines, error: lineError } = await supabase
    .from("purchase_order_lines")
    .select("product_id, order_qty, unit_price")
    .eq("purchase_order_id", orderId);

  if (lineError) {
    return Response.json({ error: lineError.message }, { status: 500 });
  }

  const productIds = [...new Set((lines || []).map((line) => line.product_id))];

  const { data: products, error: productError } = await supabase
    .from("products")
    .select("id, brand_name, product_name, sku, category, distro")
    .in("id", productIds);

  if (productError) {
    return Response.json({ error: productError.message }, { status: 500 });
  }

  const productMap = new Map(products?.map((p) => [p.id, p]) || []);

  const { data: creditTransactions, error: creditError } = await supabase
    .from("credit_transactions")
    .select("distributor, vendor_name, credit_type, credit_amount, status");

  if (creditError) {
    return Response.json({ error: creditError.message }, { status: 500 });
  }

  const creditTotals = groupCreditTotals(
    (creditTransactions as CreditTransactionForTotals[] | null) ?? []
  );

  const rows = (lines || []).map((line) => {
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
      line_total: Number(line.order_qty || 0) * Number(line.unit_price || 0),
      available_credit: creditFields.available_credit,
      credit_note: creditFields.credit_note,
    };
  });

  const grouped: Record<string, typeof rows> = {};

  rows.forEach((row) => {
    if (!grouped[row.distributor]) grouped[row.distributor] = [];
    grouped[row.distributor].push(row);
  });

  const zip = new JSZip();

  Object.entries(grouped).forEach(([distributor, distributorRows]) => {
    distributorRows.sort((a, b) =>
      `${a.brand}${a.product}`.localeCompare(`${b.brand}${b.product}`)
    );

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
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(",")
      ),
    ].join("\n");

    const safeName =
      distributor.replace(/[^a-z0-9-_ ]/gi, "").trim() ||
      "Unknown Distributor";

    zip.file(`${safeName}.csv`, csv);
  });

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  return new Response(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="approved-order-${orderId}-by-distributor.zip"`,
    },
  });
}
