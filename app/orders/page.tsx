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
import {
  buildSalesVelocitySummary,
  type SalesHistoryRow,
  type SalesVelocityMetric,
} from "@/app/lib/parCalculator";
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
  reorder_point: number;
  manualPar: number | null;
  manualReorderPoint: number | null;
  suggestedPar: number;
  suggestedReorderPoint: number;
  targetStock: number;
  targetStockSource: "manual" | "sales-based" | "fallback default";
  reorderPointSource: "manual" | "sales-based" | "fallback default";
  dailyVelocity: number;
  daysOfInventoryRemaining: number | null;
  targetLabel?: string;
  targetSourceName: string;
  suggestedQty: number;
  orderQty: number;
  status: "Out" | "Needs Reorder" | "Healthy";
  lineTotal: number;
};

type ProductInventory = {
  on_hand: number | string | null;
  par_level: number | string | null;
  reorder_point?: number | string | null;
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
  status: string | null;
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

type SelectedItemGroup = {
  name: string;
  itemsCount: number;
  brands: BrandOrderGroup[];
};

type OrderFilter = "all" | "needs";

const SALES_HISTORY_WINDOW_DAYS = 30;
const TARGET_DAYS_OF_INVENTORY = 7;
const REORDER_LEAD_TIME_DAYS = 3;

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

function toFiniteNumber(value: unknown, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (value === null || value === undefined || value === "") return fallback;

  const parsed = Number(String(value).replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCurrency(value: number | string | null) {
  return currencyFormatter.format(parseCreditAmount(value));
}

function normalizeCreditStatus(value: string | null) {
  const status = (value || "").trim().toLowerCase();

  if (["used", "closed"].includes(status)) return "Used";
  if (status.includes("used") || status.includes("closed")) return "Used";

  return "Available";
}

function formatVelocity(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "0.0";

  return (value ?? 0).toFixed(1);
}

function formatDaysRemaining(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return value.toFixed(1);
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

function getIsoDateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(0, days));
  return date.toISOString().slice(0, 10);
}

function resolveTargetStock(row: {
  manualPar: number | null;
  suggestedPar: number;
  manualReorderPoint: number | null;
}) {
  if (Number.isFinite(row.manualPar ?? NaN) && (row.manualPar ?? 0) > 0) {
    return {
      targetStock: row.manualPar ?? 0,
      source: "manual par",
    };
  }

  if (Number.isFinite(row.suggestedPar ?? NaN) && row.suggestedPar > 0) {
    return {
      targetStock: row.suggestedPar,
      source: "sales-based par",
    };
  }

  if (Number.isFinite(row.manualReorderPoint ?? NaN) && (row.manualReorderPoint ?? 0) > 0) {
    return {
      targetStock: row.manualReorderPoint ?? 0,
      source: "manual reorder_point",
    };
  }

  return {
    targetStock: 5,
    source: "default 5",
  };
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

function getShortage(row: Pick<OrderRow, "onHand" | "targetStock">) {
  return Math.max(row.targetStock - row.onHand, 0);
}

function getUrgencyRank(row: Pick<OrderRow, "onHand" | "targetStock">) {
  if (row.onHand <= 0) return 0;
  if (row.onHand < row.targetStock) return 1;
  return 2;
}

function compareOrderPriority(a: OrderRow, b: OrderRow) {
  const urgencyDiff = getUrgencyRank(a) - getUrgencyRank(b);

  if (urgencyDiff !== 0) return urgencyDiff;

  const shortageDiff = getShortage(b) - getShortage(a);

  if (shortageDiff !== 0) return shortageDiff;

  return a.product_name.localeCompare(b.product_name);
}

function compareSelectedOrderPriority(a: OrderRow, b: OrderRow) {
  const vendorDiff = a.vendor.localeCompare(b.vendor);

  if (vendorDiff !== 0) return vendorDiff;

  const brandDiff = a.brand_name.localeCompare(b.brand_name);

  if (brandDiff !== 0) return brandDiff;

  return compareOrderPriority(a, b);
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

  if (row.onHand < row.targetStock) {
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
      const isAvailable = normalizeCreditStatus(transaction.status) === "Available";

      if (type === "credit") {
        totals.totalCredits += amount;
        if (isAvailable) totals.availableCredit += amount;
      }

      if (type === "return") {
        totals.totalReturns += amount;
        if (isAvailable) totals.availableCredit += amount;
      }

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

function groupSelectedRowsByDistributorAndBrand(rows: OrderRow[]): SelectedItemGroup[] {
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
          items: items.sort(compareSelectedOrderPriority),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

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
      const recentSalesStart = getIsoDateDaysAgo(SALES_HISTORY_WINDOW_DAYS)

      const [productsResult, creditTransactionsResult, salesHistoryResult] = await Promise.all([
        supabase.from("products").select(`
          id,
          brand_name,
          product_name,
          sku,
          category,
          distro,
          current_price,
          inventory (*)
        `),
        supabase
          .from("credit_transactions")
          .select("id, distributor, vendor_name, credit_type, credit_amount, status")
          .order("distributor", { ascending: true })
          .order("vendor_name", { ascending: true }),
        supabase
          .from("sales_history")
          .select("sku, product_name, brand_name, quantity_sold, sale_date")
          .gte("sale_date", recentSalesStart)
          .order("sale_date", { ascending: true }),
      ]);

      const salesSummary = buildSalesVelocitySummary({
        products: (productsResult.data as ProductRecord[] | null)?.map((row) => ({
          id: row.id,
          sku: row.sku,
          brand_name: row.brand_name,
          product_name: row.product_name,
        })) ?? [],
        salesRows: ((salesHistoryResult.data as SalesHistoryRow[] | null) ?? []).filter(
          (row) => Boolean(row.product_name)
        ),
        windowDays: SALES_HISTORY_WINDOW_DAYS,
        targetDaysOfInventory: TARGET_DAYS_OF_INVENTORY,
        leadTimeDays: REORDER_LEAD_TIME_DAYS,
      })
      const salesMetricsMap = new Map<string, SalesVelocityMetric>(
        salesSummary.metrics.map((metric) => [metric.product_id, metric])
      )

      const mapped =
        (productsResult.data as ProductRecord[] | null)?.filter(
          (row) => !isNonConsumableCategory(row.category)
        ).map((row) => {
          const inv = row.inventory?.[0];
          const onHand = toFiniteNumber(inv?.on_hand, 0);
          const rawPar = inv?.par_level;
          const rawReorderPoint = inv?.reorder_point;
          const manualPar =
            toFiniteNumber(rawPar, 0) > 0
              ? toFiniteNumber(rawPar, 0)
              : null;
          const manualReorderPoint =
            toFiniteNumber(rawReorderPoint, 0) > 0
              ? toFiniteNumber(rawReorderPoint, 0)
              : null;
          const salesMetric = salesMetricsMap.get(row.id);
          const suggestedPar = toFiniteNumber(salesMetric?.suggested_par, 0);
          const suggestedReorderPoint = toFiniteNumber(salesMetric?.suggested_reorder_point, 0);
          const dailyVelocity = toFiniteNumber(salesMetric?.daily_velocity, 0);
          const resolvedTarget = resolveTargetStock({
            manualPar,
            suggestedPar,
            manualReorderPoint,
          });
          const targetStock = toFiniteNumber(resolvedTarget.targetStock, 5);
          const targetStockSource: OrderRow["targetStockSource"] = manualPar
            ? "manual"
            : suggestedPar > 0
              ? "sales-based"
              : manualReorderPoint
                ? "manual"
                : "fallback default";
          const targetSourceName = resolvedTarget.source;
          const reorderPointSource: OrderRow["reorderPointSource"] = manualReorderPoint
            ? "manual"
            : suggestedReorderPoint > 0
              ? "sales-based"
              : "fallback default";
          const reorderPoint = toFiniteNumber(manualReorderPoint ?? suggestedReorderPoint ?? 5, 5);
          const currentInventory = toFiniteNumber(onHand, 0);
          const suggestedQty = Math.max(targetStock - currentInventory, 0);
          const daysOfInventoryRemaining =
            dailyVelocity > 0 ? onHand / dailyVelocity : null;
          const targetLabel = manualPar
            ? `Target: PAR ${manualPar}`
            : suggestedPar > 0
              ? `Target: Sales PAR ${suggestedPar}`
              : manualReorderPoint
                ? `Target: Reorder ${manualReorderPoint}`
                : "Target: Default 5";
          const status: OrderRow["status"] =
            currentInventory <= 0
              ? "Out"
              : currentInventory < targetStock
                ? "Needs Reorder"
                : "Healthy";
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
            onHand: currentInventory,
            manualPar,
            manualReorderPoint,
            suggestedPar,
            suggestedReorderPoint,
            targetStock,
            targetStockSource,
            reorderPointSource,
            dailyVelocity,
            daysOfInventoryRemaining,
            targetSourceName,
            suggestedQty,
            orderQty: 0,
            status,
            lineTotal: 0,
            par: manualPar ?? 0,
            reorder_point: reorderPoint,
            targetLabel,
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

      const matchesFilter = orderFilter === "needs" ? r.suggestedQty > 0 : true;

      return matchesSearch && matchesFilter;
    });
  }, [orderFilter, rows, search]);

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
  const needsOrderCount = rows.filter((r) => r.suggestedQty > 0).length;

  const selectedGroups = useMemo(
    () => groupSelectedRowsByDistributorAndBrand(selected),
    [selected]
  );

  const selectedTotals = useMemo(
    () =>
      selected.reduce(
        (totals, row) => {
          totals.itemCount += 1;
          totals.quantity += row.orderQty;
          totals.lineTotal += row.lineTotal;
          return totals;
        },
        { itemCount: 0, quantity: 0, lineTotal: 0 }
      ),
    [selected]
  );

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

  function removeItem(id: string) {
    updateQty(id, 0);
  }

  function useSuggestedQty(id: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              orderQty: r.suggestedQty,
              lineTotal: r.suggestedQty * r.current_price,
            }
          : r
      )
    );
  }

  function addAllLowItems(distributorName: string) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.vendor !== distributorName || row.onHand > row.targetStock) return row;

        return {
          ...row,
          orderQty: row.suggestedQty,
          lineTotal: row.suggestedQty * row.current_price,
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
      row.targetStock,
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

  async function createDraftOrder(linesSource: OrderRow[]) {
    const lines = linesSource
      .filter((row) => row.orderQty > 0)
      .map((row) => ({
        product_id: row.id,
        qty: row.orderQty,
        price: row.current_price,
      }));

    if (lines.length === 0) {
      return null;
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
      throw new Error(data.error || "Could not create draft.");
    }

    return String(data.order_id ?? "");
  }

  async function submitForApproval() {
    const selectedLines = rows.filter((row) => row.orderQty > 0);

    if (selectedLines.length === 0) {
      alert("No order quantities entered.");
      return;
    }

    let orderId = draftOrderId;

    try {
      if (!orderId) {
        orderId = await createDraftOrder(selectedLines);
        if (!orderId) {
          alert("No order quantities entered.");
          return;
        }
      }

      const res = await fetch("/api/submit-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ order_id: orderId }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        alert(data.error || "Could not submit order.");
        return;
      }

      setDraftOrderId(orderId);
      setOrderStatus("submitted");
      alert("Order submitted for approval.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not submit order.");
    }
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
              <div className="flex items-center border-l border-border bg-card px-3 text-xs text-muted-foreground">
                Needs Order Count: {needsOrderCount}
              </div>
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
                                    onUseSuggested={useSuggestedQty}
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
                {orderFilter === "needs"
                  ? "No items need ordering based on current inventory and targets. Check Current/Target/Suggested values in All Items."
                  : "No order items match your filters."}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="w-full border-t border-border bg-muted/80 p-4 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-[24rem] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <ShoppingCart size={18} />
                <h2 className="font-semibold">Order Review</h2>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-border bg-card px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    Items
                  </div>
                  <div className="mt-1 text-lg font-semibold">{selectedTotals.itemCount}</div>
                </div>
                <div className="rounded-xl border border-border bg-card px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    Units
                  </div>
                  <div className="mt-1 text-lg font-semibold">{selectedTotals.quantity}</div>
                </div>
                <div className="rounded-xl border border-border bg-card px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    Est Cost
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {formatCurrency(selectedTotals.lineTotal)}
                  </div>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Status</span>
                  <span className="font-semibold text-foreground">
                    {orderStatus === "none" && "Not Created"}
                    {orderStatus === "draft" && "Draft Created"}
                    {orderStatus === "submitted" && "Submitted for Approval"}
                  </span>
                </div>
                {draftOrderId ? (
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    Draft ID: {draftOrderId}
                  </div>
                ) : null}
              </div>
            </div>

            {selected.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                No items selected yet. Use <span className="font-medium text-foreground">Use Suggested</span> on any item you want to add.
              </div>
            ) : null}

            <div className="space-y-3">
              {selectedGroups.map((distributorGroup) => (
                <section
                  key={distributorGroup.name}
                  className="rounded-2xl border border-border bg-background shadow-sm"
                >
                  <div className="border-b border-border px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">
                          {distributorGroup.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {distributorGroup.itemsCount} selected items
                        </div>
                      </div>
                      <div className="text-right text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                        <div>{formatCurrency(
                          distributorGroup.brands.reduce(
                            (total, brand) =>
                              total + brand.items.reduce((sum, item) => sum + item.lineTotal, 0),
                            0
                          )
                        )}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 p-3">
                    {distributorGroup.brands.map((brandGroup) => (
                      <div
                        key={`${distributorGroup.name}__${brandGroup.name}`}
                        className="space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2 px-1">
                          <div className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {brandGroup.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {brandGroup.items.length} lines
                          </div>
                        </div>

                        <div className="space-y-2">
                          {brandGroup.items.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-xl border border-border bg-muted/40 p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium text-foreground">
                                    {getCompactDisplayName(item.product_name, item.brand_name)}
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                                    <span>Inventory {item.onHand}</span>
                                    <span>Velocity {formatVelocity(item.dailyVelocity)}/day</span>
                                    <span>Suggested PAR {item.suggestedPar || item.targetStock}</span>
                                    <span>Target {item.targetStockSource}</span>
                                    <span>ROP {item.reorderPointSource}</span>
                                    <span>Days left {formatDaysRemaining(item.daysOfInventoryRemaining)}</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeItem(item.id)}
                                  className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground transition hover:bg-muted"
                                >
                                  Remove
                                </button>
                              </div>

                              <div className="mt-3 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="size-9"
                                    onClick={() => adjust(item.id, -1)}
                                    aria-label={`Decrease ${item.product_name}`}
                                  >
                                    <Minus size={14} />
                                  </Button>

                                  <input
                                    type="number"
                                    min={0}
                                    value={item.orderQty}
                                    onChange={(event) => updateQty(item.id, Number(event.target.value))}
                                    className="h-9 w-16 rounded border border-border bg-background text-center text-sm font-semibold text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
                                    aria-label={`Order quantity for ${item.product_name}`}
                                  />

                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="size-9"
                                    onClick={() => adjust(item.id, 1)}
                                    aria-label={`Increase ${item.product_name}`}
                                  >
                                    <Plus size={14} />
                                  </Button>
                                </div>

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-9 px-3 text-xs"
                                  onClick={() => useSuggestedQty(item.id)}
                                >
                                  Use Suggested
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="space-y-2 rounded-2xl border border-border bg-background p-4 shadow-sm">
              <Button
                className="min-h-10 w-full"
                onClick={submitForApproval}
                disabled={selected.length === 0 || orderStatus === "submitted"}
              >
                Submit for Approval
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function OrderItemCard({
  brandName,
  onAdjust,
  onUseSuggested,
  onUpdateQty,
  row,
}: {
  brandName: string;
  onAdjust: (id: string, delta: number) => void;
  onUseSuggested: (id: string) => void;
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
                <span>{row.targetLabel}</span>
                <span aria-hidden="true">·</span>
                <span>Velocity {formatVelocity(row.dailyVelocity)}/day</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-tight text-muted-foreground">
                <span>Current: {row.onHand}</span>
                <span aria-hidden="true">·</span>
                <span>Target: {row.targetStock}</span>
                <span aria-hidden="true">·</span>
                <span>Suggested: {row.suggestedQty}</span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-foreground">Source: {row.targetSourceName}</span>
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
            onClick={() => onUseSuggested(row.id)}
          >
            Use Suggested
          </Button>
        </div>
      </div>
    </article>
  );
}
