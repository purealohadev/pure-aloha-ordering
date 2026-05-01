"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Minus, Plus, ShoppingCart, Zap } from "lucide-react";
import NavBar from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getDistributorFromBrand,
  isNonConsumableCategory,
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
          items: items.sort((a, b) => a.product_name.localeCompare(b.product_name)),
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
          const cleanBrand = row.brand_name?.toLowerCase().trim();
          const distributor = getDistributorFromBrand(cleanBrand) ?? "Other";

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
          ? r.suggested > 0
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
      <div className="min-h-screen bg-zinc-900 p-6 text-white">Loading...</div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <NavBar />

      <div className="flex">
        <div className="flex-1 space-y-4 p-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-zinc-900 text-white border-zinc-600"
            />

            <div className="flex shrink-0 overflow-hidden rounded border border-zinc-700">
              <Button
                variant="ghost"
                className={`rounded-none px-3 ${
                  orderFilter === "all"
                    ? "bg-white text-black hover:bg-zinc-200"
                    : "bg-zinc-800 text-white hover:bg-zinc-700"
                }`}
                onClick={() => setOrderFilter("all")}
              >
                All Items
              </Button>
              <Button
                variant="ghost"
                className={`rounded-none border-l border-zinc-700 px-3 ${
                  orderFilter === "needs"
                    ? "bg-white text-black hover:bg-zinc-200"
                    : "bg-zinc-800 text-white hover:bg-zinc-700"
                }`}
                onClick={() => setOrderFilter("needs")}
              >
                Needs Order
              </Button>
              <Button
                variant="ghost"
                className={`rounded-none border-l border-zinc-700 px-3 ${
                  orderFilter === "credit"
                    ? "bg-white text-black hover:bg-zinc-200"
                    : "bg-zinc-800 text-white hover:bg-zinc-700"
                }`}
                onClick={() => setOrderFilter("credit")}
              >
                Has Credit
              </Button>
            </div>
          </div>

          <p className="text-xs text-zinc-500">
            Accessories are excluded from ordering.
          </p>

          <div className="space-y-4">
            {groupedRows.map((distributorGroup) => {
              const distributorCollapsed =
                collapsedDistributors[distributorGroup.name] ?? false;

              return (
                <section
                  key={distributorGroup.name}
                  className="overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900/60"
                >
                  <button
                    type="button"
                    onClick={() => toggleDistributor(distributorGroup.name)}
                    className="flex w-full items-center justify-between gap-3 border-b border-zinc-700 bg-zinc-800 px-4 py-3 text-left transition hover:bg-zinc-700"
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
                    <span className="shrink-0 rounded-full border border-zinc-600 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300">
                      {distributorGroup.itemsCount} items
                    </span>
                  </button>

                  {!distributorCollapsed ? (
                    <div className="space-y-3 p-3 sm:p-4">
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
                            className="rounded-xl border border-zinc-700 bg-zinc-900"
                          >
                            <div className="border-b border-zinc-700 transition hover:bg-zinc-800">
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
                                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
                                  )}
                                  <span className="truncate text-sm font-semibold text-zinc-100">
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
                                        : "text-zinc-400"
                                    }
                                  >
                                    Available Credit: {formatCurrency(availableCredit)}
                                  </span>
                                  <span className="text-zinc-400">
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
                                        : "border-zinc-600 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                                    }`}
                                  >
                                    {trimmedVendorNote ? "Note" : "Add Note"}
                                  </button>
                                </span>
                              </div>
                            </div>

                            {noteExpanded ? (
                              <div className="border-b border-zinc-800 bg-zinc-950/50 px-3 py-2">
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
                                  className="min-h-16 w-full resize-y rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs leading-snug text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                                />
                              </div>
                            ) : trimmedVendorNote ? (
                              <button
                                type="button"
                                onClick={() =>
                                  toggleVendorNote(distributorGroup.name, brandGroup.name)
                                }
                                className="block w-full border-b border-zinc-800 bg-zinc-950/40 px-3 py-1.5 text-left text-xs text-amber-100/90 transition hover:bg-zinc-800"
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
                                  <article
                                    key={row.id}
                                    className="min-h-[116px] rounded-lg border border-zinc-700 bg-zinc-800 p-2.5 font-sans shadow-sm transition hover:bg-zinc-700"
                                  >
                                    <div className="flex h-full min-h-0 flex-col justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="line-clamp-2 text-sm font-semibold leading-tight text-zinc-100">
                                          {getCompactDisplayName(
                                            row.product_name,
                                            brandGroup.name
                                          )}
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs leading-tight text-zinc-400">
                                          <span>On Hand {row.onHand}</span>
                                          <span aria-hidden="true">·</span>
                                          <span>Par {row.par}</span>
                                          <span aria-hidden="true">·</span>
                                          <span>Suggested {row.suggested}</span>
                                        </div>
                                      </div>

                                      <div className="flex items-center justify-between gap-1.5 whitespace-nowrap">
                                        <Button
                                          variant="outline"
                                          className="h-7 shrink-0 bg-white px-1.5 text-[11px] text-black hover:bg-zinc-200"
                                          onClick={() => updateQty(row.id, row.suggested)}
                                        >
                                          <Zap size={12} />
                                          Suggested
                                        </Button>

                                        <div className="flex shrink-0 items-center gap-1">
                                          <Button
                                            size="icon"
                                            className="size-7"
                                            onClick={() => adjust(row.id, -1)}
                                          >
                                            <Minus size={13} />
                                          </Button>

                                          <input
                                            value={row.orderQty}
                                            onChange={(e) =>
                                              updateQty(row.id, Number(e.target.value))
                                            }
                                            className="h-7 w-10 rounded bg-zinc-700 text-center text-sm text-white"
                                          />

                                          <Button
                                            size="icon"
                                            className="size-7"
                                            onClick={() => adjust(row.id, 1)}
                                          >
                                            <Plus size={13} />
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  </article>
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
              <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center text-sm text-zinc-400">
                No order items match your filters.
              </div>
            ) : null}
          </div>
        </div>

        <div className="sticky top-0 h-screen w-80 overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-4 flex items-center gap-2">
            <ShoppingCart size={18} />
            <h2 className="font-semibold">Order Review</h2>
          </div>

          <div className="mb-4 rounded bg-zinc-900 p-3 text-sm">
            <div className="text-zinc-400">Status</div>
            <div className="font-semibold">
              {orderStatus === "none" && "Not Created"}
              {orderStatus === "draft" && "Draft Created"}
              {orderStatus === "submitted" && "Submitted for Approval"}
            </div>
          </div>

          {selected.length === 0 && (
            <div className="text-sm text-zinc-500">No items selected yet.</div>
          )}

          {Object.entries(groupedByVendor).map(([distributor, brands]) => (
            <div key={distributor} className="mb-4">
              <div className="mb-1 text-sm font-semibold text-zinc-400">
                {distributor}
              </div>

              {Object.entries(brands).map(([brandName, items]) => {
                const availableCredit = getAvailableCredit(distributor, brandName);

                return (
                  <div key={`${distributor}__${brandName}`} className="mb-2">
                    <div className="mb-1 text-xs font-semibold text-zinc-500">
                      {brandName}
                      <span
                        className={`ml-2 ${
                          availableCredit > 0 ? "text-green-300" : "text-zinc-500"
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
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.product_name}</span>
                        <span>{item.orderQty}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}

          <div className="mt-4 border-t border-zinc-800 pt-4">
            <Button className="mb-2 w-full" onClick={createDraft}>
              Create Draft
            </Button>

            <Button
              variant="outline"
              className="w-full bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700"
              onClick={submitForApproval}
              disabled={!draftOrderId || orderStatus === "submitted"}
            >
              Submit for Approval
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
