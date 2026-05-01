"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Minus, Plus, ShoppingCart } from "lucide-react";
import NavBar from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  UNKNOWN_DISTRIBUTOR,
  isNonConsumableCategory,
  resolveDistributorBrand,
} from "@/lib/inventory/distributors";
import { createClient } from "@/lib/supabase/client";

type OrderRow = {
  id: string;
  brand_name: string;
  product_name: string;
  sku: string | null;
  category: string | null;
  vendor: string;
  current_price: number;
  onHand: number;
  par: number;
  suggested: number;
  orderQty: number;
  status: "Out" | "Needs Reorder" | "Healthy";
  lineTotal: number;
};

type ProductInventory = {
  on_hand: number | string | null;
  par_level: number | string | null;
};

type ProductRecord = {
  id: string;
  brand_name: string | null;
  product_name: string | null;
  sku: string | null;
  category: string | null;
  distro: string | null;
  current_price: number | string | null;
  inventory: ProductInventory[] | null;
};

type CreditTransaction = {
  id: string;
  distributor: string | null;
  vendor_name: string | null;
  credit_type: string | null;
  credit_amount: number | string | null;
};

type VendorCreditTotals = {
  totalCredits: number;
  totalReturns: number;
  availableCredit: number;
};

type BrandOrderGroup = {
  name: string;
  items: OrderRow[];
};

type DistributorOrderGroup = {
  name: string;
  itemsCount: number;
  brands: BrandOrderGroup[];
};

type OrderFilter = "all" | "needs" | "credit";

const ORDER_EXPORT_DISTRIBUTORS = [
  "KSS",
  "Nabis",
  "Kindhouse",
  "UpNorth",
  "Big Oil",
  "Self Distro",
  "Other",
  UNKNOWN_DISTRIBUTOR,
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function parseCreditAmount(value: number | string | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === "") return 0;

  const amount = Number(String(value).replace(/[$,]/g, "").trim());
  return Number.isFinite(amount) ? amount : 0;
}

function formatCurrency(value: number | string | null) {
  return currencyFormatter.format(parseCreditAmount(value));
}

function creditKey(distributor: string, vendorName: string) {
  return `${distributor}__${vendorName}`;
}

function brandKey(distributor: string, brandName: string) {
  return `${distributor}::${brandName}`;
}

function sanitizeFilenamePart(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

function escapeCsvValue(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function getOrderDistributorName(brandName: string | null, distributorName: string | null) {
  const resolution = resolveDistributorBrand(brandName, distributorName);

  if (
    !distributorName?.trim() &&
    resolution?.match_type === "soft" &&
    resolution.confidence === "medium"
  ) {
    return UNKNOWN_DISTRIBUTOR;
  }

  if (resolution?.review_required) return UNKNOWN_DISTRIBUTOR;

  return resolution?.distributor ?? UNKNOWN_DISTRIBUTOR;
}

function getCompactDisplayName(productName: string, brandName: string) {
  const normalizedBrandName = brandName.trim();

  if (!normalizedBrandName) {
    return productName;
  }

  const normalizedProductName = productName.trimStart();
  const lowerProductName = normalizedProductName.toLowerCase();
  const lowerBrandName = normalizedBrandName.toLowerCase();
  const brandPrefixes = [
    `${lowerBrandName} | `,
    `${lowerBrandName} - `,
    `${lowerBrandName} `,
  ];

  const matchedPrefix = brandPrefixes.find((prefix) => lowerProductName.startsWith(prefix));

  return matchedPrefix
    ? normalizedProductName.slice(matchedPrefix.length).trimStart()
    : productName;
}

function getShortage(row: Pick<OrderRow, "onHand" | "par">) {
  return Math.max(row.par - row.onHand, 0);
}

function getUrgencyRank(row: Pick<OrderRow, "onHand" | "par">) {
  if (row.onHand <= 0) return 0;
  if (row.onHand < row.par) return 1;
  return 2;
}

function compareOrderPriority(a: OrderRow, b: OrderRow) {
  const urgencyDiff = getUrgencyRank(a) - getUrgencyRank(b);

  if (urgencyDiff !== 0) return urgencyDiff;

  const shortageDiff = getShortage(b) - getShortage(a);

  if (shortageDiff !== 0) return shortageDiff;

  return a.product_name.localeCompare(b.product_name);
}

function getItemUrgencyStyle(row: OrderRow) {
  if (row.onHand <= 0) {
    return {
      dotClass: "bg-red-500",
      cardClass: "border-red-500/45 bg-red-500/5",
      textClass: "text-red-700 dark:text-red-300",
      label: "Out",
    };
  }

  if (row.onHand < row.par) {
    return {
      dotClass: "bg-orange-500",
      cardClass: "border-orange-500/45 bg-orange-500/5",
      textClass: "text-orange-700 dark:text-orange-300",
      label: "Low",
    };
  }

  return {
    dotClass: "bg-muted-foreground/45",
    cardClass: "border-border bg-card",
    textClass: "text-muted-foreground",
    label: "OK",
  };
}

function summarizeVendorTransactions(transactions: CreditTransaction[]): VendorCreditTotals {
  return transactions.reduce(
    (totals, transaction) => {
      const type = (transaction.credit_type || "").trim().toLowerCase();
      const amount = parseCreditAmount(transaction.credit_amount);

      if (type === "credit") {
        totals.totalCredits += amount;
      }

      if (type === "return") {
        totals.totalReturns += amount;
      }

      totals.availableCredit = totals.totalCredits + totals.totalReturns;
      return totals;
    },
    { totalCredits: 0, totalReturns: 0, availableCredit: 0 }
  );
}

function groupCreditTotals(transactions: CreditTransaction[]) {
  const distributorMap = new Map<string, Map<string, CreditTransaction[]>>();

  for (const transaction of transactions) {
    const distributor = transaction.distributor || "Unknown Distributor";
    const vendorName = transaction.vendor_name || "Unknown Vendor";

    if (!distributorMap.has(distributor)) {
      distributorMap.set(distributor, new Map());
    }

    const vendorMap = distributorMap.get(distributor);
    if (!vendorMap) continue;

    if (!vendorMap.has(vendorName)) {
      vendorMap.set(vendorName, []);
    }

    vendorMap.get(vendorName)?.push(transaction);
  }

  const totals = new Map<string, VendorCreditTotals>();

  for (const [distributor, vendorMap] of distributorMap.entries()) {
    for (const [vendorName, vendorTransactions] of vendorMap.entries()) {
      totals.set(creditKey(distributor, vendorName), summarizeVendorTransactions(vendorTransactions));
    }
  }

  return totals;
}

function groupRowsByDistributorAndBrand(
  rows: OrderRow[],
  creditTotals: Map<string, VendorCreditTotals>
): DistributorOrderGroup[] {
  const distributorMap = new Map<string, Map<string, OrderRow[]>>();

  for (const row of rows) {
    const brandMap = distributorMap.get(row.vendor) ?? new Map<string, OrderRow[]>();
    const brandItems = brandMap.get(row.brand_name) ?? [];

    brandItems.push(row);
    brandMap.set(row.brand_name, brandItems);
    distributorMap.set(row.vendor, brandMap);
  }

  return Array.from(distributorMap.entries())
    .map(([name, brandMap]) => {
      const brands = Array.from(brandMap.entries())
        .map(([brandName, items]) => ({
          name: brandName,
          items: items.sort(compareOrderPriority),
        }))
        .sort((a, b) => {
          const aHasCredit = (creditTotals.get(creditKey(name, a.name))?.availableCredit ?? 0) > 0;
          const bHasCredit = (creditTotals.get(creditKey(name, b.name))?.availableCredit ?? 0) > 0;

          if (aHasCredit !== bHasCredit) return aHasCredit ? -1 : 1;

          return a.name.localeCompare(b.name);
        });

      return {
        name,
        itemsCount: brands.reduce((total, brand) => total + brand.items.length, 0),
        brands,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function OrdersPage() {
  const [supabase] = useState(() => createClient());
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [creditTotals, setCreditTotals] = useState<Map<string, VendorCreditTotals>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [collapsedDistributors, setCollapsedDistributors] = useState<Record<string, boolean>>({});
  const [collapsedBrands, setCollapsedBrands] = useState<Record<string, boolean>>({});
  const [vendorNotes, setVendorNotes] = useState<Record<string, string>>({});
  const [expandedVendorNotes, setExpandedVendorNotes] = useState<Record<string, boolean>>({});
  const [draftOrderId, setDraftOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<"none" | "draft" | "submitted">("none");

  useEffect(() => {
    async function loadData() {
      const [productsResult, creditTransactionsResult] = await Promise.all([
        supabase.from("products").select(`
          id,
          brand_name,
          product_name,
          sku,
          category,
          distro,
          current_price,
          inventory (on_hand, par_level)
        `),
        supabase
          .from("credit_transactions")
          .select("id, distributor, vendor_name, credit_type, credit_amount")
          .order("distributor", { ascending: true })
          .order("vendor_name", { ascending: true }),
      ]);

      const mapped =
        (productsResult.data as ProductRecord[] | null)?.filter(
          (row) => !isNonConsumableCategory(row.category)
        ).map((row) => {
          const inv = row.inventory?.[0];
          const onHand = Number(inv?.on_hand ?? 0);
          const par = Number(inv?.par_level ?? 0);
          const suggested = Math.max(par - onHand, 0);
          const status: OrderRow["status"] =
            onHand <= 0 ? "Out" : onHand < par ? "Needs Reorder" : "Healthy";
          const brandName = row.brand_name || "Unknown";
          const distributor = getOrderDistributorName(row.brand_name, row.distro);

          return {
            id: row.id,
            brand_name: brandName,
            product_name: row.product_name || "Unnamed Product",
            sku: row.sku,
            category: row.category,
            vendor: distributor,
            current_price: Number(row.current_price ?? 0),
            onHand,
            par,
            suggested,
            orderQty: suggested,
            status,
            lineTotal: suggested * Number(row.current_price ?? 0),
          };
        }) ?? [];

      setRows(mapped);
      setCreditTotals(
        groupCreditTotals((creditTransactionsResult.data as CreditTransaction[] | null) ?? [])
      );
      setLoading(false);
    }

    loadData();
  }, [supabase]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchesSearch = `${r.brand_name} ${r.product_name} ${r.vendor} ${r.category ?? ""} ${r.sku ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase());

      const availableCredit =
        creditTotals.get(creditKey(r.vendor, r.brand_name))?.availableCredit ?? 0;
      const matchesFilter =
        orderFilter === "needs"
          ? r.onHand <= r.par
          : orderFilter === "credit"
            ? availableCredit > 0
            : true;

      return matchesSearch && matchesFilter;
    });
  }, [creditTotals, orderFilter, rows, search]);

  const groupedRows = useMemo(
    () => groupRowsByDistributorAndBrand(filtered, creditTotals),
    [creditTotals, filtered]
  );

  const distributorExportCounts = useMemo(() => {
    const counts = new Map(ORDER_EXPORT_DISTRIBUTORS.map((distributor) => [distributor, 0]));

    for (const row of rows) {
      counts.set(row.vendor, (counts.get(row.vendor) ?? 0) + 1);
    }

    return counts;
  }, [rows]);

  const selected = rows.filter((r) => r.orderQty > 0);

  const groupedByVendor = useMemo(() => {
    const map: Record<string, Record<string, OrderRow[]>> = {};

    selected.forEach((row) => {
      if (!map[row.vendor]) map[row.vendor] = {};
      if (!map[row.vendor][row.brand_name]) map[row.vendor][row.brand_name] = [];
      map[row.vendor][row.brand_name].push(row);
    });

    return map;
  }, [selected]);

  function getAvailableCredit(distributor: string, vendorName: string) {
    return creditTotals.get(creditKey(distributor, vendorName))?.availableCredit ?? 0;
  }

  function toggleDistributor(distributor: string) {
    setCollapsedDistributors((prev) => ({
      ...prev,
      [distributor]: !prev[distributor],
    }));
  }

  function toggleBrand(distributor: string, brandName: string) {
    const key = brandKey(distributor, brandName);

    setCollapsedBrands((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }));
  }

  function toggleVendorNote(distributor: string, vendorName: string) {
    const key = creditKey(distributor, vendorName);

    setExpandedVendorNotes((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function updateVendorNote(distributor: string, vendorName: string, note: string) {
    const key = creditKey(distributor, vendorName);

    setVendorNotes((prev) => ({
      ...prev,
      [key]: note,
    }));
  }

  function updateQty(id: string, qty: number) {
    const safeQty = Math.max(0, Number(qty) || 0);

    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              orderQty: safeQty,
              lineTotal: safeQty * r.current_price,
            }
          : r
      )
    );
  }

  function resetQty(id: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              orderQty: r.suggested,
              lineTotal: r.suggested * r.current_price,
            }
          : r
      )
    );
  }

  function addAllLowItems(distributorName: string) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.vendor !== distributorName || row.onHand > row.par) return row;

        return {
          ...row,
          orderQty: row.suggested,
          lineTotal: row.suggested * row.current_price,
        };
      })
    );
  }

  function clearDistributor(distributorName: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.vendor === distributorName
          ? {
              ...row,
              orderQty: 0,
              lineTotal: 0,
            }
          : row
      )
    );
  }

  function adjust(id: string, delta: number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;

        const next = Math.max(0, r.orderQty + delta);

        return {
          ...r,
          orderQty: next,
          lineTotal: next * r.current_price,
        };
      })
    );
  }

  function exportDistributorOrder(distributorName: string) {
    const dedupedRows = new Map<string, OrderRow>();

    for (const row of rows) {
      if (row.vendor !== distributorName) continue;
      if (!row.product_name.trim()) continue;

      const key = `${row.vendor}__${row.brand_name}__${row.product_name}__${row.sku ?? ""}`;
      const existing = dedupedRows.get(key);

      if (!existing || row.orderQty > existing.orderQty) {
        dedupedRows.set(key, row);
      }
    }

    const distributorRows = Array.from(dedupedRows.values()).sort((a, b) => {
      const brandDiff = a.brand_name.localeCompare(b.brand_name);

      if (brandDiff !== 0) return brandDiff;

      return compareOrderPriority(a, b);
    });

    if (distributorRows.length === 0) return;

    const headers = [
      "distributor",
      "brand_name",
      "product_name",
      "sku",
      "current_inventory",
      "par",
      "order_quantity",
    ];
    const csvRows = distributorRows.map((row) => [
      row.vendor,
      row.brand_name,
      getCompactDisplayName(row.product_name, row.brand_name),
      row.sku || "",
      row.onHand,
      row.par,
      row.orderQty,
    ]);
    const csvContent = [headers, ...csvRows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.setAttribute(
      "download",
      `order-${sanitizeFilenamePart(distributorName)}-${date}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function createDraft() {
    const lines = rows
      .filter((row) => row.orderQty > 0)
      .map((row) => ({
        product_id: row.id,
        qty: row.orderQty,
        price: row.current_price,
      }));

    if (lines.length === 0) {
      alert("No order quantities entered.");
      return;
    }

    const res = await fetch("/api/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lines }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.error || "Could not create draft.");
      return;
    }

    setDraftOrderId(data.order_id);
    setOrderStatus("draft");
    alert("Draft order created.");
  }

  async function submitForApproval() {
    if (!draftOrderId) {
      alert("Create a draft first.");
      return;
    }

    const res = await fetch("/api/submit-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id: draftOrderId }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.error || "Could not submit order.");
      return;
    }

    setOrderStatus("submitted");
    alert("Order submitted for approval.");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6 text-foreground">Loading...</div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />

      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 space-y-4 p-4">
          <div className="flex flex-col gap-2 xl:flex-row">
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-10 border-border bg-background text-foreground"
            />

            <div className="flex min-w-0 shrink-0 overflow-x-auto rounded-lg border border-border">
              <Button
                variant="ghost"
                className={`min-h-10 rounded-none px-3 ${
                  orderFilter === "all"
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-card text-foreground hover:bg-muted"
                }`}
                onClick={() => setOrderFilter("all")}
              >
                All Items
              </Button>
              <Button
                variant="ghost"
                className={`min-h-10 rounded-none border-l border-border px-3 ${
                  orderFilter === "needs"
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-card text-foreground hover:bg-muted"
                }`}
                onClick={() => setOrderFilter("needs")}
              >
                Needs Order
              </Button>
              <Button
                variant="ghost"
                className={`min-h-10 rounded-none border-l border-border px-3 ${
                  orderFilter === "credit"
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-card text-foreground hover:bg-muted"
                }`}
                onClick={() => setOrderFilter("credit")}
              >
                Has Credit
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Accessories are excluded from ordering.
          </p>

          <section className="rounded-2xl border border-border bg-background/70 p-3 sm:p-4">
            <div className="flex flex-wrap gap-2">
              {ORDER_EXPORT_DISTRIBUTORS.map((distributorName) => {
                const count = distributorExportCounts.get(distributorName) ?? 0;

                return (
                  <Button
                    key={distributorName}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={count === 0}
                    onClick={() => exportDistributorOrder(distributorName)}
                    className="min-h-10 rounded-full border-border bg-muted px-3 text-xs text-foreground hover:bg-card hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Export {distributorName} Order
                  </Button>
                );
              })}
            </div>
          </section>

          <div className="space-y-4">
            {groupedRows.map((distributorGroup) => {
              const distributorCollapsed =
                collapsedDistributors[distributorGroup.name] ?? false;

              return (
                <section
                  key={distributorGroup.name}
                  className="overflow-hidden rounded-2xl border border-border bg-background/60"
                >
                  <button
                    type="button"
                    onClick={() => toggleDistributor(distributorGroup.name)}
                    className="flex w-full flex-col gap-3 border-b border-border bg-card px-4 py-3 text-left transition hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
                    aria-expanded={!distributorCollapsed}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {distributorCollapsed ? (
                        <ChevronRight className="h-5 w-5 shrink-0 text-blue-300" />
                      ) : (
                        <ChevronDown className="h-5 w-5 shrink-0 text-blue-300" />
                      )}
                      <span className="truncate text-lg font-semibold tracking-tight text-blue-300">
                        {distributorGroup.name}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                      {distributorGroup.itemsCount} items
                    </span>
                  </button>

                  {!distributorCollapsed ? (
                    <div className="space-y-3 p-3 sm:p-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => addAllLowItems(distributorGroup.name)}
                          className="min-h-10"
                        >
                          Add All Low Items
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => clearDistributor(distributorGroup.name)}
                          className="min-h-10"
                        >
                          Clear All
                        </Button>
                      </div>
                      {distributorGroup.brands.map((brandGroup) => {
                        const key = brandKey(distributorGroup.name, brandGroup.name);
                        const noteKey = creditKey(distributorGroup.name, brandGroup.name);
                        const brandCollapsed = collapsedBrands[key] ?? true;
                        const noteExpanded = expandedVendorNotes[noteKey] ?? false;
                        const vendorNote = vendorNotes[noteKey] ?? "";
                        const trimmedVendorNote = vendorNote.trim();
                        const availableCredit = getAvailableCredit(
                          distributorGroup.name,
                          brandGroup.name
                        );

                        return (
                          <section
                            key={key}
                            className="rounded-xl border border-border bg-background"
                          >
                            <div className="border-b border-border transition hover:bg-card">
                              <div className="flex w-full flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleBrand(distributorGroup.name, brandGroup.name)
                                  }
                                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                  aria-expanded={!brandCollapsed}
                                >
                                  {brandCollapsed ? (
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  )}
                                  <span className="truncate text-sm font-semibold text-foreground">
                                    {brandGroup.name}
                                  </span>
                                </button>
                                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:justify-end">
                                  {availableCredit > 0 ? (
                                    <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold text-green-300">
                                      Use Credit Available
                                    </span>
                                  ) : null}
                                  <span
                                    className={
                                      availableCredit > 0
                                        ? "font-semibold text-green-300"
                                        : "text-muted-foreground"
                                    }
                                  >
                                    Available Credit: {formatCurrency(availableCredit)}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {brandGroup.items.length} items
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleVendorNote(distributorGroup.name, brandGroup.name)
                                    }
                                    className={`rounded border px-2 py-0.5 text-[11px] font-semibold transition ${
                                      trimmedVendorNote
                                        ? "border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
                                        : "border-border bg-card text-foreground hover:bg-muted"
                                    }`}
                                  >
                                    {trimmedVendorNote ? "Note" : "Add Note"}
                                  </button>
                                </span>
                              </div>
                            </div>

                            {noteExpanded ? (
                              <div className="border-b border-border bg-muted/50 px-3 py-2">
                                <textarea
                                  value={vendorNote}
                                  onChange={(event) =>
                                    updateVendorNote(
                                      distributorGroup.name,
                                      brandGroup.name,
                                      event.target.value
                                    )
                                  }
                                  placeholder="Internal note for this vendor..."
                                  className="min-h-16 w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-xs leading-snug text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                                />
                              </div>
                            ) : trimmedVendorNote ? (
                              <button
                                type="button"
                                onClick={() =>
                                  toggleVendorNote(distributorGroup.name, brandGroup.name)
                                }
                                className="block w-full border-b border-border bg-muted/40 px-3 py-1.5 text-left text-xs text-amber-100/90 transition hover:bg-card"
                              >
                                <span className="block truncate">
                                  <span className="mr-1 font-semibold text-amber-300">Note:</span>
                                  {trimmedVendorNote}
                                </span>
                              </button>
                            ) : null}

                            {!brandCollapsed ? (
                              <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                {brandGroup.items.map((row) => (
                                  <OrderItemCard
                                    key={row.id}
                                    row={row}
                                    brandName={brandGroup.name}
                                    onAdjust={adjust}
                                    onReset={resetQty}
                                    onUpdateQty={updateQty}
                                  />
                                ))}
                              </div>
                            ) : null}
                          </section>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}

            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No order items match your filters.
              </div>
            ) : null}
          </div>
        </div>

        <aside className="h-auto w-full border-t border-border bg-muted p-4 lg:sticky lg:top-0 lg:h-screen lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-center gap-2">
            <ShoppingCart size={18} />
            <h2 className="font-semibold">Order Review</h2>
          </div>

          <div className="mb-4 rounded bg-background p-3 text-sm">
            <div className="text-muted-foreground">Status</div>
            <div className="font-semibold">
              {orderStatus === "none" && "Not Created"}
              {orderStatus === "draft" && "Draft Created"}
              {orderStatus === "submitted" && "Submitted for Approval"}
            </div>
          </div>

          {selected.length === 0 && (
            <div className="text-sm text-muted-foreground">No items selected yet.</div>
          )}

          {Object.entries(groupedByVendor).map(([distributor, brands]) => (
            <div key={distributor} className="mb-4">
              <div className="mb-1 text-sm font-semibold text-muted-foreground">
                {distributor}
              </div>

              {Object.entries(brands).map(([brandName, items]) => {
                const availableCredit = getAvailableCredit(distributor, brandName);

                return (
                  <div key={`${distributor}__${brandName}`} className="mb-2">
                    <div className="mb-1 text-xs font-semibold text-muted-foreground">
                      {brandName}
                      <span
                        className={`ml-2 ${
                          availableCredit > 0 ? "text-green-300" : "text-muted-foreground"
                        }`}
                      >
                        Available Credit: {formatCurrency(availableCredit)}
                      </span>
                    </div>
                    {availableCredit > 0 ? (
                      <div className="mb-1 rounded border border-green-500/20 bg-green-500/10 px-2 py-1 text-xs leading-snug text-green-300">
                        Credit available — consider applying before payment.
                      </div>
                    ) : null}

                    {items.map((item) => (
                      <div key={item.id} className="flex justify-between gap-3 text-sm">
                        <span className="truncate">{item.product_name}</span>
                        <span>{item.orderQty}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}

          <div className="mt-4 border-t border-border pt-4">
            <Button className="mb-2 min-h-10 w-full" onClick={createDraft}>
              Create Draft
            </Button>

            <Button
              variant="outline"
              className="min-h-10 w-full border-border bg-card text-foreground hover:bg-muted"
              onClick={submitForApproval}
              disabled={!draftOrderId || orderStatus === "submitted"}
            >
              Submit for Approval
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function OrderItemCard({
  brandName,
  onAdjust,
  onReset,
  onUpdateQty,
  row,
}: {
  brandName: string;
  onAdjust: (id: string, delta: number) => void;
  onReset: (id: string) => void;
  onUpdateQty: (id: string, qty: number) => void;
  row: OrderRow;
}) {
  const urgency = getItemUrgencyStyle(row);

  return (
    <article
      className={`min-h-[144px] rounded-lg border p-3 font-sans shadow-sm transition hover:bg-muted ${urgency.cardClass}`}
    >
      <div className="flex h-full min-h-0 flex-col justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${urgency.dotClass}`} />
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
                {getCompactDisplayName(row.product_name, brandName)}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-tight text-muted-foreground">
                <span className={urgency.textClass}>{urgency.label}</span>
                <span aria-hidden="true">·</span>
                <span>On Hand {row.onHand}</span>
                <span aria-hidden="true">·</span>
                <span>Par {row.par}</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-foreground">Suggested: {row.suggested}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-10"
              onClick={() => onAdjust(row.id, -1)}
              aria-label={`Decrease ${row.product_name}`}
            >
              <Minus size={14} />
            </Button>

            <input
              type="number"
              min={0}
              value={row.orderQty}
              onChange={(event) => onUpdateQty(row.id, Number(event.target.value))}
              className="h-10 w-16 rounded border border-border bg-background text-center text-sm font-semibold text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
              aria-label={`Order quantity for ${row.product_name}`}
            />

            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-10"
              onClick={() => onAdjust(row.id, 1)}
              aria-label={`Increase ${row.product_name}`}
            >
              <Plus size={14} />
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 px-3"
            onClick={() => onReset(row.id)}
          >
            Reset
          </Button>
        </div>
      </div>
    </article>
  );
}
