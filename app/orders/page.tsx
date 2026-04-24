"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Minus,
  Plus,
  Search,
  Send,
  ShoppingCart,
} from "lucide-react";
import NavBar from "@/components/NavBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type ProductRow = {
  id: string;
  brand_name: string | null;
  product_name: string;
  sku: string | null;
  category: string | null;
  distro: string | null;
  current_price: number | null;
  inventory?: {
    on_hand: number;
    par_level: number;
  }[];
};

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
  status: "Out" | "Needs Reorder" | "Healthy";
  lineTotal: number;
};

type ViewMode = "compact" | "expanded";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);

  const escapeCell = (value: unknown) => {
    const str = String(value ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getStatusTone(status: OrderRow["status"]) {
  if (status === "Out") {
    return "border-red-500/40 bg-red-500/10 text-red-400";
  }

  if (status === "Needs Reorder") {
    return "border-yellow-500/40 bg-yellow-500/10 text-yellow-400";
  }

  return "border-green-500/40 bg-green-500/10 text-green-400";
}

function getInventoryTextClass(onHand: number, par: number) {
  if (onHand <= 0) {
    return "text-red-400";
  }

  if (onHand < par) {
    return "text-yellow-400";
  }

  if (onHand > par) {
    return "text-green-400";
  }

  return "text-zinc-300";
}

export default function OrdersPage() {
  const [supabase] = useState(() => createClient());
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [role, setRole] = useState("unknown");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showOnlyReorders, setShowOnlyReorders] = useState(true);
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("All");
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [collapsedBrands, setCollapsedBrands] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("Not logged in");
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      setRole(profile?.role ?? "unknown");

      const { data: products, error } = await supabase
        .from("products")
        .select(`
          id,
          brand_name,
          product_name,
          sku,
          category,
          distro,
          current_price,
          inventory (
            on_hand,
            par_level
          )
        `)
        .order("brand_name", { ascending: true });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const mapped = ((products as ProductRow[]) ?? [])
        .map((row) => {
          const inv = row.inventory?.[0];
          const onHand = Number(inv?.on_hand ?? 0);
          const par = Number(inv?.par_level ?? 0);
          const suggested = Math.max(par - onHand, 0);
          const status =
            onHand <= 0 && par > 0
              ? "Out"
              : onHand < par
                ? "Needs Reorder"
                : "Healthy";

          return {
            id: row.id,
            brand_name: row.brand_name?.trim() || "Unknown Brand",
            product_name: row.product_name,
            sku: row.sku,
            category: row.category,
            vendor: row.distro?.trim() || "Other",
            current_price: Number(row.current_price ?? 0),
            onHand,
            par,
            suggested,
            status,
            lineTotal: suggested * Number(row.current_price ?? 0),
          } satisfies OrderRow;
        })
        .sort((a, b) => {
          const brandCompare = a.brand_name.localeCompare(b.brand_name);
          if (brandCompare !== 0) return brandCompare;
          return a.product_name.localeCompare(b.product_name);
        });

      setRows(mapped);
      setLoading(false);
    }

    loadData();
  }, [supabase]);

  const vendors = useMemo(() => {
    return ["All", ...Array.from(new Set(rows.map((row) => row.vendor))).sort()];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesReorder = showOnlyReorders ? row.suggested > 0 : true;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        `${row.brand_name} ${row.product_name} ${row.category ?? ""} ${row.vendor} ${row.sku ?? ""}`
          .toLowerCase()
          .includes(normalizedSearch);
      const matchesVendor = vendorFilter === "All" ? true : row.vendor === vendorFilter;

      return matchesReorder && matchesSearch && matchesVendor;
    });
  }, [rows, search, showOnlyReorders, vendorFilter]);

  const brandGroups = useMemo(() => {
    const groups = filteredRows.reduce<Record<string, OrderRow[]>>((acc, row) => {
      if (!acc[row.brand_name]) {
        acc[row.brand_name] = [];
      }

      acc[row.brand_name].push(row);
      return acc;
    }, {});

    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredRows]);

  const totalOrderValue = filteredRows.reduce((sum, row) => sum + row.lineTotal, 0);
  const totalOrderUnits = filteredRows.reduce((sum, row) => sum + row.suggested, 0);
  const activeOrderLines = filteredRows.filter((row) => row.suggested > 0).length;

  function updateSuggested(id: string, value: number | string) {
    const qty = Math.max(0, Number(value) || 0);

    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              suggested: qty,
              lineTotal: qty * Number(row.current_price ?? 0),
            }
          : row
      )
    );
  }

  function adjustSuggested(id: string, delta: number) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;

        const suggested = Math.max(0, row.suggested + delta);
        return {
          ...row,
          suggested,
          lineTotal: suggested * Number(row.current_price ?? 0),
        };
      })
    );
  }

  function isRowExpanded(id: string) {
    return expandedRows[id] ?? viewMode === "expanded";
  }

  function toggleRowExpansion(id: string) {
    setExpandedRows((prev) => ({
      ...prev,
      [id]: !isRowExpanded(id),
    }));
  }

  function toggleBrand(brand: string) {
    setCollapsedBrands((prev) => {
      const isCollapsed = prev[brand] ?? false;
      return {
        ...prev,
        [brand]: !isCollapsed,
      };
    });
  }

  function collapseAllBrands() {
    setCollapsedBrands(
      Object.fromEntries(brandGroups.map(([brand]) => [brand, true]))
    );
  }

  function expandAllBrands() {
    setCollapsedBrands(
      Object.fromEntries(brandGroups.map(([brand]) => [brand, false]))
    );
  }

  async function createOrder() {
    setMessage("");

    const lines = rows
      .filter((row) => row.suggested > 0)
      .map((row) => ({
        product_id: row.id,
        qty: row.suggested,
        price: row.current_price,
      }));

    if (lines.length === 0) {
      setMessage("No order quantities entered.");
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

    if (data.success) {
      setMessage("Order created successfully.");
    } else {
      setMessage(`Error: ${data.error}`);
    }
  }

  async function submitLatestDraft() {
    setMessage("");

    const res = await fetch("/api/submit-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();

    if (data.success) {
      setMessage("Latest draft submitted for approval.");
    } else {
      setMessage(`Error: ${data.error}`);
    }
  }

  function exportAllOpenPO() {
    const exportRows = filteredRows
      .filter((row) => row.suggested > 0)
      .map((row) => ({
        distro: row.vendor,
        brand_name: row.brand_name,
        product_name: row.product_name,
        category: row.category,
        on_hand: row.onHand,
        par_level: row.par,
        order_qty: row.suggested,
        unit_price: row.current_price,
        line_total: row.lineTotal.toFixed(2),
      }));

    if (!exportRows.length) {
      setMessage("No reorder lines to export.");
      return;
    }

    exportCsv("all-open-purchase-orders.csv", exportRows);
    setMessage("Exported all open purchase order lines.");
  }

  function exportVendorPO(vendor: string) {
    const exportRows = filteredRows
      .filter((row) => row.vendor === vendor && row.suggested > 0)
      .map((row) => ({
        distro: row.vendor,
        brand_name: row.brand_name,
        product_name: row.product_name,
        category: row.category,
        on_hand: row.onHand,
        par_level: row.par,
        order_qty: row.suggested,
        unit_price: row.current_price,
        line_total: row.lineTotal.toFixed(2),
      }));

    if (!exportRows.length) {
      setMessage(`No reorder lines to export for ${vendor}.`);
      return;
    }

    const safeName = vendor.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    exportCsv(`${safeName}-purchase-order.csv`, exportRows);
    setMessage(`Exported purchase order for ${vendor}.`);
  }

  const isErrorMessage = message.startsWith("Error") || message === "Not logged in";

  return (
    <div className="min-h-screen bg-zinc-900 font-sans text-white">
      <NavBar />

      <main className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <section className="overflow-hidden rounded-[2rem] border border-zinc-700 bg-zinc-800 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.65)]">
            <div className="grid gap-6 px-6 py-7 sm:px-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:px-10">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="rounded-full bg-blue-500/15 px-3 py-1 text-[11px] tracking-[0.08em] text-blue-400 uppercase">
                    Orders
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-zinc-700 px-3 py-1 text-xs text-zinc-300">
                    Role: {role}
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-zinc-700 px-3 py-1 text-xs text-zinc-300">
                    Default: Compact View
                  </Badge>
                </div>

                <div className="space-y-3">
                  <h1 className="font-sans text-4xl font-semibold tracking-tight text-blue-400 sm:text-5xl">
                    Faster ordering by brand
                  </h1>
                  <p className="max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base">
                    Keep the default view dense for rapid scanning, expand the full page when
                    needed, or open a single product row without changing the current ordering flow.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button size="lg" className="rounded-full border border-zinc-700 bg-zinc-900 px-5 text-zinc-200 hover:bg-zinc-700 hover:text-white" onClick={createOrder}>
                    <ShoppingCart className="size-4" />
                    Create Order
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full border-zinc-700 bg-zinc-900 px-5 text-zinc-200 hover:bg-zinc-700 hover:text-white"
                    onClick={submitLatestDraft}
                  >
                    <Send className="size-4" />
                    Submit Latest Draft
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full border-zinc-700 bg-zinc-900 px-5 text-zinc-200 hover:bg-zinc-700 hover:text-white"
                    onClick={exportAllOpenPO}
                  >
                    <Download className="size-4" />
                    Export All Open POs
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <MetricCard label="Visible brands" value={String(brandGroups.length)} />
                <MetricCard label="Active order lines" value={String(activeOrderLines)} />
                <MetricCard
                  label="Visible PO value"
                  value={currencyFormatter.format(totalOrderValue)}
                />
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
            <Card className="border border-zinc-700 bg-zinc-800 font-sans text-white shadow-sm">
              <CardHeader className="gap-4 border-b border-zinc-700 pb-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="font-sans text-2xl font-semibold tracking-tight text-blue-400">
                      Order Workspace
                    </CardTitle>
                    <p className="text-sm text-zinc-400">
                      Search, filter by vendor, and switch between compact and expanded defaults.
                    </p>
                  </div>

                  <div className="inline-flex rounded-full border border-zinc-700 bg-zinc-900 p-1">
                    <ViewModeButton
                      active={viewMode === "compact"}
                      onClick={() => setViewMode("compact")}
                    >
                      Compact View
                    </ViewModeButton>
                    <ViewModeButton
                      active={viewMode === "expanded"}
                      onClick={() => setViewMode("expanded")}
                    >
                      Expanded View
                    </ViewModeButton>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                    onClick={collapseAllBrands}
                    disabled={brandGroups.length === 0}
                  >
                    Collapse All Brands
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                    onClick={expandAllBrands}
                    disabled={brandGroups.length === 0}
                  >
                    Expand All Brands
                  </Button>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                      type="text"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search brand, product, SKU, category, or vendor"
                      className="border-zinc-700 bg-zinc-900 pl-9 font-sans text-white placeholder:text-zinc-500 focus-visible:border-zinc-500"
                    />
                  </div>

                  <select
                    value={vendorFilter}
                    onChange={(event) => setVendorFilter(event.target.value)}
                    className="h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 font-sans text-sm text-white outline-none transition focus-visible:border-zinc-500 focus-visible:ring-3 focus-visible:ring-zinc-500/30"
                    aria-label="Filter by vendor"
                  >
                    {vendors.map((vendor) => (
                      <option key={vendor} value={vendor}>
                        {vendor === "All" ? "All vendors" : vendor}
                      </option>
                    ))}
                  </select>

                  <label className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200">
                    <input
                      type="checkbox"
                      checked={showOnlyReorders}
                      onChange={(event) => setShowOnlyReorders(event.target.checked)}
                      className="size-4 rounded border-zinc-700 bg-zinc-900"
                    />
                    Show only reorder items
                  </label>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-4">
                {message ? (
                  <div
                    className={cn(
                      "rounded-2xl border px-4 py-3 text-sm",
                      isErrorMessage
                        ? "border-red-500/40 bg-red-500/10 text-red-400"
                        : "border-blue-500/40 bg-blue-500/10 text-blue-400"
                    )}
                  >
                    {message}
                  </div>
                ) : null}

                {loading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-28 animate-pulse rounded-2xl border border-zinc-700 bg-zinc-800"
                      />
                    ))}
                  </div>
                ) : brandGroups.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-800 px-6 py-12 text-center">
                    <h2 className="text-lg font-semibold text-white">
                      No products match these filters.
                    </h2>
                    <p className="mt-2 text-sm text-zinc-400">
                      Adjust the search, vendor filter, or reorder-only toggle to see more products.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {brandGroups.map(([brand, brandRows]) => {
                      const isBrandExpanded = !(collapsedBrands[brand] ?? false);
                      const brandValue = brandRows.reduce((sum, row) => sum + row.lineTotal, 0);
                      const reorderCount = brandRows.filter((row) => row.suggested > 0).length;

                      return (
                        <section
                          key={brand}
                          className="mt-2 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-800 shadow-sm first:mt-0"
                        >
                          <button
                            type="button"
                            onClick={() => toggleBrand(brand)}
                            className="flex w-full items-center justify-between gap-3 border-b border-zinc-700 bg-zinc-800 px-4 py-3 text-left transition hover:bg-zinc-700 sm:px-5"
                            aria-expanded={isBrandExpanded}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="rounded-full border border-zinc-700 bg-zinc-900 p-2 text-zinc-300 shadow-sm">
                                {isBrandExpanded ? (
                                  <ChevronUp className="size-4" />
                                ) : (
                                  <ChevronDown className="size-4" />
                                )}
                              </span>
                              <div className="min-w-0 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h2 className="text-lg font-bold tracking-tight text-purple-400 sm:text-xl">
                                    {brand}
                                  </h2>
                                  <Badge
                                    variant="secondary"
                                    className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-300"
                                  >
                                    {brandRows.length} product{brandRows.length === 1 ? "" : "s"}
                                  </Badge>
                                </div>
                                <p className="text-sm text-zinc-400">
                                  {reorderCount} reorder line{reorderCount === 1 ? "" : "s"} ready
                                  in this section
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Badge variant="secondary" className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
                                Brand Group
                              </Badge>
                              <Badge variant="outline" className="rounded-full border-zinc-700 px-3 py-1 text-zinc-300">
                                {currencyFormatter.format(brandValue)}
                              </Badge>
                              <span className="inline-flex min-w-28 items-center justify-end gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-right text-[11px] font-semibold tracking-[0.08em] text-zinc-400 uppercase">
                                {isBrandExpanded ? "Collapse" : "Expand"}
                                {isBrandExpanded ? (
                                  <ChevronUp className="size-3.5" />
                                ) : (
                                  <ChevronDown className="size-3.5" />
                                )}
                              </span>
                            </div>
                          </button>

                          {isBrandExpanded ? (
                            <div
                              className={cn(
                                viewMode === "compact"
                                  ? "grid gap-2 p-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                                  : "divide-y divide-zinc-700"
                              )}
                            >
                              {brandRows.map((row) => {
                                const rowExpanded = isRowExpanded(row.id);
                                const needsReorderHighlight = row.onHand < row.par;

                                if (!rowExpanded) {
                                  const inventoryTone = getInventoryTextClass(row.onHand, row.par);

                                  return (
                                    <article
                                      key={row.id}
                                      className={cn(
                                        "h-[80px] rounded-lg border border-zinc-700 bg-zinc-800 p-2 font-sans shadow-sm transition hover:bg-zinc-700"
                                      )}
                                    >
                                      <div className="flex h-full min-h-0 flex-col justify-between gap-1">
                                        <div className="flex min-w-0 items-start justify-between gap-1.5">
                                          <div className="min-w-0 flex-1">
                                            <div className="line-clamp-2 text-sm font-semibold leading-tight text-zinc-100">
                                              {row.product_name}
                                            </div>
                                            <div className="truncate text-[11px] leading-tight text-zinc-400">
                                              {[row.brand_name, row.category].filter(Boolean).join(" · ")}
                                            </div>
                                          </div>

                                          <button
                                            type="button"
                                            onClick={() => toggleRowExpansion(row.id)}
                                            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-600 hover:text-white"
                                            aria-expanded={rowExpanded}
                                            aria-label={`Expand details for ${row.product_name}`}
                                          >
                                            <ChevronDown className="size-3.5" />
                                          </button>
                                        </div>

                                        <div className="flex min-w-0 items-center justify-between gap-1.5 text-xs leading-tight text-zinc-400">
                                          <div className="flex min-w-0 items-center gap-x-1.5 whitespace-nowrap">
                                            <span className={inventoryTone}>Inv {row.onHand}</span>
                                            <span aria-hidden="true">·</span>
                                            <span>Par {row.par}</span>
                                          </div>
                                          <CompactQuantityStepper
                                            value={row.suggested}
                                            onDecrease={() => adjustSuggested(row.id, -1)}
                                            onIncrease={() => adjustSuggested(row.id, 1)}
                                            productName={row.product_name}
                                          />
                                        </div>
                                      </div>
                                    </article>
                                  );
                                }

                                return (
                                  <article
                                    key={row.id}
                                    className={cn(
                                      viewMode === "compact"
                                        ? "sm:col-span-2 md:col-span-4 xl:col-span-5 2xl:col-span-6"
                                        : "px-4 py-4 sm:px-6"
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        "rounded-[1.4rem] border border-zinc-700 bg-zinc-800 p-4 shadow-sm"
                                      )}
                                    >
                                      <div className="flex flex-col gap-4">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                          <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-zinc-100">
                                                {row.product_name}
                                              </h3>
                                              {needsReorderHighlight ? (
                                                <Badge
                                                  variant="outline"
                                                  className="rounded-full border-yellow-500/40 bg-yellow-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-yellow-400"
                                                >
                                                  Low
                                                </Badge>
                                              ) : null}
                                            </div>
                                            <p className="mt-1 text-xs leading-tight text-zinc-400">
                                              {row.brand_name}
                                            </p>
                                          </div>

                                          <button
                                            type="button"
                                            onClick={() => toggleRowExpansion(row.id)}
                                            className="inline-flex items-center gap-2 self-start rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700 hover:text-white"
                                            aria-expanded={rowExpanded}
                                            aria-label={`${rowExpanded ? "Collapse" : "Expand"} details for ${row.product_name}`}
                                          >
                                            {rowExpanded ? (
                                              <ChevronUp className="size-4" />
                                            ) : (
                                              <ChevronDown className="size-4" />
                                            )}
                                            {rowExpanded ? "Collapse" : "Expand"}
                                          </button>
                                        </div>

                                        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_150px_150px_auto]">
                                          <RowMetric
                                            label="Current Inventory"
                                            value={String(row.onHand)}
                                            valueClassName={getInventoryTextClass(row.onHand, row.par)}
                                          />
                                          <RowMetric label="Par Level" value={String(row.par)} />
                                          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3">
                                            <div className="text-[11px] font-semibold tracking-[0.08em] text-zinc-400 uppercase">
                                              Order Quantity
                                            </div>
                                            <div className="mt-2 text-lg font-semibold tracking-tight text-white">
                                              {row.suggested}
                                            </div>
                                          </div>
                                          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3">
                                            <div className="text-[11px] font-semibold tracking-[0.08em] text-zinc-400 uppercase">
                                              Adjust Order
                                            </div>
                                            <div className="mt-2">
                                              <QuantityStepper
                                                value={row.suggested}
                                                onDecrease={() => adjustSuggested(row.id, -1)}
                                                onIncrease={() => adjustSuggested(row.id, 1)}
                                                productName={row.product_name}
                                              />
                                            </div>
                                          </div>
                                        </div>

                                        {rowExpanded ? (
                                          <div className="rounded-[1.3rem] border border-zinc-700 bg-zinc-900 p-4 sm:p-5">
                                            <div className="mb-4 flex flex-wrap items-center gap-2">
                                              <Badge
                                                variant="outline"
                                                className={cn(
                                                  "rounded-full px-3 py-1",
                                                  getStatusTone(row.status)
                                                )}
                                              >
                                                {row.status}
                                              </Badge>
                                              <Badge variant="outline" className="rounded-full border-zinc-700 px-3 py-1 text-zinc-300">
                                                {currencyFormatter.format(row.lineTotal)} line total
                                              </Badge>
                                            </div>

                                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                              <DetailItem label="Brand" value={row.brand_name} />
                                              <DetailItem label="SKU" value={row.sku || "—"} />
                                              <DetailItem label="Category" value={row.category || "—"} />
                                              <DetailItem label="Vendor" value={row.vendor} />
                                              <DetailItem
                                                label="Price"
                                                value={currencyFormatter.format(row.current_price)}
                                              />
                                              <DetailItem
                                                label="Current Inventory"
                                                value={String(row.onHand)}
                                                valueClassName={getInventoryTextClass(row.onHand, row.par)}
                                              />
                                              <DetailItem label="Par Level" value={String(row.par)} />
                                              <div className="rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 md:col-span-2 xl:col-span-2">
                                                <div className="text-[11px] font-semibold tracking-[0.08em] text-zinc-400 uppercase">
                                                  Order Quantity Controls
                                                </div>
                                                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                                                  <QuantityStepper
                                                    value={row.suggested}
                                                    onDecrease={() => adjustSuggested(row.id, -1)}
                                                    onIncrease={() => adjustSuggested(row.id, 1)}
                                                    productName={row.product_name}
                                                  />
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    value={row.suggested}
                                                    onChange={(event) =>
                                                      updateSuggested(row.id, event.target.value)
                                                    }
                                                    className="w-full border-zinc-700 bg-zinc-900 font-sans text-white focus-visible:border-zinc-500 sm:w-28"
                                                    aria-label={`Order quantity input for ${row.product_name}`}
                                                  />
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border border-zinc-700 bg-zinc-800 font-sans text-white shadow-sm">
                <CardHeader className="gap-2 border-b border-zinc-700 pb-4">
                  <CardTitle className="font-sans text-xl font-semibold tracking-tight text-blue-400">
                    Ordering Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 pt-6">
                  <MetricCard label="Visible units ordered" value={String(totalOrderUnits)} />
                  <MetricCard
                    label="Current view mode"
                    value={viewMode === "compact" ? "Compact View" : "Expanded View"}
                  />
                  <MetricCard label="Vendor filter" value={vendorFilter} />
                </CardContent>
              </Card>

              <Card className="border border-zinc-700 bg-zinc-800 font-sans text-white shadow-sm">
                <CardHeader className="gap-2 border-b border-zinc-700 pb-4">
                  <CardTitle className="font-sans text-xl font-semibold tracking-tight text-blue-400">
                    Export by Vendor
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 pt-6">
                  {vendors
                    .filter((vendor) => vendor !== "All")
                    .map((vendor) => (
                      <Button
                        key={vendor}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                        onClick={() => exportVendorPO(vendor)}
                      >
                        <Download className="size-3.5" />
                        {vendor}
                      </Button>
                    ))}
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function ViewModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-medium transition",
        active ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-4">
      <div className="text-[11px] font-semibold tracking-[0.08em] text-zinc-400 uppercase">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</div>
    </div>
  );
}

function RowMetric({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3">
      <div className="text-[11px] font-semibold tracking-[0.08em] text-zinc-400 uppercase">
        {label}
      </div>
      <div className={cn("mt-2 text-lg font-semibold tracking-tight text-white", valueClassName)}>
        {value}
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3">
      <div className="text-[11px] font-semibold tracking-[0.08em] text-zinc-400 uppercase">
        {label}
      </div>
      <div className={cn("mt-1 text-sm font-medium text-white", valueClassName)}>{value}</div>
    </div>
  );
}

function QuantityStepper({
  onDecrease,
  onIncrease,
  productName,
  value,
}: {
  onDecrease: () => void;
  onIncrease: () => void;
  productName: string;
  value: number;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 p-1">
      <button
        type="button"
        onClick={onDecrease}
        className="inline-flex size-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
        aria-label={`Decrease order quantity for ${productName}`}
      >
        <Minus className="size-4" />
      </button>
      <span className="min-w-12 text-center text-base font-semibold text-white">{value}</span>
      <button
        type="button"
        onClick={onIncrease}
        className="inline-flex size-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
        aria-label={`Increase order quantity for ${productName}`}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function CompactQuantityStepper({
  onDecrease,
  onIncrease,
  productName,
  value,
}: {
  onDecrease: () => void;
  onIncrease: () => void;
  productName: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1 align-middle text-xs text-white">
      <button
        type="button"
        onClick={onDecrease}
        className="inline-flex size-5 items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
        aria-label={`Decrease order quantity for ${productName}`}
      >
        <Minus className="size-3" />
      </button>
      <span className="min-w-4 text-center text-xs font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        onClick={onIncrease}
        className="inline-flex size-5 items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
        aria-label={`Increase order quantity for ${productName}`}
      >
        <Plus className="size-3" />
      </button>
    </span>
  );
}
