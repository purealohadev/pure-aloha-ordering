"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import {
  UNKNOWN_DISTRIBUTOR,
  resolveDistributorBrand,
} from "@/lib/inventory/distributors";
import { createClient } from "@/lib/supabase/client";

type PurchaseOrderRow = {
  id: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  manager_note: string | null;
  created_by: string | null;
};

type PurchaseOrderLineRow = {
  id: string;
  purchase_order_id: string;
  order_qty: number | string | null;
  unit_price: number | string | null;
  products:
    | PurchaseOrderLineProduct
    | PurchaseOrderLineProduct[]
    | null;
};

type PurchaseOrderLineProduct = {
  brand_name: string | null;
  product_name: string | null;
  category: string | null;
  distro: string | null;
  sku: string | null;
};

type BrandGroup = {
  name: string;
  items: PurchaseOrderLineRow[];
};

type DistributorGroup = {
  name: string;
  itemsCount: number;
  totalUnits: number;
  estimatedTotalCost: number;
  brands: BrandGroup[];
};

type OrderCard = PurchaseOrderRow & {
  totalUnits: number;
  estimatedTotalCost: number;
  distributorGroups: DistributorGroup[];
  distributorSummary: string;
  totalDistributors: number;
};

type StatusKey = "draft" | "submitted" | "approved";

const STATUS_SECTIONS: Array<{ key: StatusKey; title: string; empty: string }> = [
  {
    key: "draft",
    title: "Draft Orders",
    empty: "No draft orders yet.",
  },
  {
    key: "submitted",
    title: "Pending Approval",
    empty: "No orders waiting on manager approval.",
  },
  {
    key: "approved",
    title: "Approved Orders",
    empty: "No approved orders yet.",
  },
];

const statusBadgeClassByKey: Record<StatusKey, string> = {
  draft: "border-slate-500/35 bg-slate-500/10 text-slate-200",
  submitted: "border-yellow-500/35 bg-yellow-500/10 text-yellow-200",
  approved: "border-green-500/35 bg-green-500/10 text-green-200",
};

export default function ApprovalsPage() {
  const [supabase] = useState(() => createClient());
  const [orders, setOrders] = useState<OrderCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailingOrderId, setEmailingOrderId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setActionError(null);

    const { data: ordersData, error: ordersError } = await supabase
      .from("purchase_orders")
      .select("id, status, created_at, approved_at, manager_note, created_by")
      .order("created_at", { ascending: false });

    if (ordersError) {
      setActionError(ordersError.message);
      setOrders([]);
      setLoading(false);
      return;
    }

    const orderRows = (ordersData ?? []) as PurchaseOrderRow[];
    const orderIds = orderRows.map((order) => order.id);

    const linesByOrder = new Map<string, PurchaseOrderLineRow[]>();

    if (orderIds.length > 0) {
      const { data: linesData, error: linesError } = await supabase
        .from("purchase_order_lines")
        .select(
          `
          id,
          purchase_order_id,
          order_qty,
          unit_price,
          products (
            brand_name,
            product_name,
            category,
            distro,
            sku
          )
        `
        )
        .in("purchase_order_id", orderIds);

      if (linesError) {
        setActionError(linesError.message);
      } else {
        for (const line of (linesData ?? []) as unknown as PurchaseOrderLineRow[]) {
          const existing = linesByOrder.get(line.purchase_order_id) ?? [];
          existing.push(line);
          linesByOrder.set(line.purchase_order_id, existing);
        }
      }
    }

    const nextOrders = orderRows.map((order) => {
      const lines = linesByOrder.get(order.id) ?? [];
      return buildOrderCard(order, lines);
    });

    setOrders(nextOrders);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadOrders();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadOrders]);

  const groupedByStatus = useMemo(() => {
    return {
      draft: orders.filter((order) => order.status === "draft"),
      submitted: orders.filter((order) => order.status === "submitted"),
      approved: orders.filter((order) => order.status === "approved"),
    };
  }, [orders]);

  async function submitOrder(orderId: string) {
    const res = await fetch("/api/submit-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id: orderId }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      setActionError(data.error || "Failed to submit order.");
      return;
    }

    setActionError(null);
    loadOrders();
  }

  async function approveOrder(orderId: string) {
    const res = await fetch("/api/approve-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id: orderId }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      setActionError(data.error || "Failed to approve order.");
      return;
    }

    setActionError(null);
    loadOrders();
  }

  async function rejectOrder(orderId: string) {
    const res = await fetch("/api/reject-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id: orderId }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      setActionError(data.error || "Failed to reject order.");
      return;
    }

    setActionError(null);
    loadOrders();
  }

  async function emailVendors(orderId: string) {
    setEmailingOrderId(orderId);

    try {
      const res = await fetch("/api/email-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ order_id: orderId }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setActionError(data.error || "Failed to email vendors.");
        return;
      }

      setActionError(null);
      loadOrders();
    } finally {
      setEmailingOrderId(null);
    }
  }

  async function deleteOrder(orderId: string, status: string) {
    const confirmed = window.confirm(
      status === "approved"
        ? "Delete this APPROVED order and all associated lines? This cannot be undone."
        : "Delete this order? This cannot be undone."
    )

    if (!confirmed) return

    const res = await fetch("/api/delete-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id: orderId }),
    })

    const data = await res.json()

    if (!res.ok || !data.success) {
      setActionError(data.error || "Failed to delete order.")
      return
    }

    setActionError(null)
    loadOrders()
  }

  if (loading) {
    return <div className="min-h-screen bg-background p-6 text-foreground">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="border-b border-border pb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-blue-600 dark:text-blue-400">
            Order Lifecycle
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft orders are editable in the workflow, pending orders wait on approval, and
            approved orders are ready to export or email.
          </p>
        </div>

        {actionError ? (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-sm text-red-200">
            {actionError}
          </div>
        ) : null}

        {STATUS_SECTIONS.map((section) => (
          <OrderStatusSection
            key={section.key}
            title={section.title}
            emptyMessage={section.empty}
            orders={groupedByStatus[section.key]}
            onSubmit={submitOrder}
            onApprove={approveOrder}
            onReject={rejectOrder}
            onDelete={deleteOrder}
            onEmail={emailVendors}
            emailingOrderId={emailingOrderId}
          />
        ))}
      </div>
    </div>
  );
}

function buildOrderCard(order: PurchaseOrderRow, lines: PurchaseOrderLineRow[]): OrderCard {
  const totalUnits = lines.reduce((sum, line) => sum + toNumber(line.order_qty), 0);
  const estimatedTotalCost = lines.reduce(
    (sum, line) => sum + toNumber(line.order_qty) * toNumber(line.unit_price),
    0
  );

  const distributorMap = new Map<string, Map<string, PurchaseOrderLineRow[]>>();

  for (const line of lines) {
    const product = getLineProduct(line.products);
    const distributor = getLineDistributor(product?.brand_name ?? null, product?.distro ?? null);
    const brandName = product?.brand_name?.trim() || "Unknown Brand";

    const brandMap = distributorMap.get(distributor) ?? new Map<string, PurchaseOrderLineRow[]>();
    const brandItems = brandMap.get(brandName) ?? [];

    brandItems.push(line);
    brandMap.set(brandName, brandItems);
    distributorMap.set(distributor, brandMap);
  }

  const distributorGroups = Array.from(distributorMap.entries())
    .map(([name, brandMap]) => {
      const brands = Array.from(brandMap.entries())
        .map(([brandName, items]) => ({
          name: brandName,
          items: items.sort((a, b) =>
            (getLineProduct(a.products)?.product_name ?? "").localeCompare(
              getLineProduct(b.products)?.product_name ?? ""
            )
          ),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const distributorUnits = brands.reduce(
        (sum, brand) => sum + brand.items.reduce((brandSum, line) => brandSum + toNumber(line.order_qty), 0),
        0
      );
      const distributorCost = brands.reduce(
        (sum, brand) =>
          sum + brand.items.reduce((brandSum, line) => brandSum + toNumber(line.order_qty) * toNumber(line.unit_price), 0),
        0
      );

      return {
        name,
        itemsCount: brands.reduce((sum, brand) => sum + brand.items.length, 0),
        totalUnits: distributorUnits,
        estimatedTotalCost: distributorCost,
        brands,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...order,
    totalUnits,
    estimatedTotalCost,
    distributorGroups,
    distributorSummary:
      distributorGroups.length > 0
        ? distributorGroups.map((group) => group.name).join(" · ")
        : "No distributor lines",
    totalDistributors: distributorGroups.length,
  };
}

function getLineDistributor(brandName: string | null, distro: string | null) {
  const resolution = resolveDistributorBrand(brandName, distro);

  if (
    !distro?.trim() &&
    resolution?.match_type === "soft" &&
    resolution.confidence === "medium"
  ) {
    return UNKNOWN_DISTRIBUTOR;
  }

  if (resolution?.review_required) return UNKNOWN_DISTRIBUTOR;

  return resolution?.distributor ?? UNKNOWN_DISTRIBUTOR;
}

function getLineProduct(products: PurchaseOrderLineProduct | PurchaseOrderLineProduct[] | null) {
  if (Array.isArray(products)) {
    return products[0] ?? null;
  }

  return products;
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function getStatusLabel(status: string) {
  if (status === "draft") return "Draft";
  if (status === "submitted") return "Pending Approval";
  if (status === "approved") return "Approved";
  return status || "Unknown";
}

function getStatusBadgeClass(status: string) {
  if (status === "approved") {
    return "border-green-500/35 bg-green-500/10 text-green-200";
  }

  if (status === "submitted") {
    return "border-yellow-500/35 bg-yellow-500/10 text-yellow-200";
  }

  if (status === "draft") {
    return "border-slate-500/35 bg-slate-500/10 text-slate-200";
  }

  return "border-border bg-muted text-muted-foreground";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function OrderStatusSection({
  title,
  emptyMessage,
  orders,
  onSubmit,
  onApprove,
  onReject,
  onDelete,
  onEmail,
  emailingOrderId,
}: {
  title: string;
  emptyMessage: string;
  orders: OrderCard[];
  onSubmit: (orderId: string) => Promise<void>;
  onApprove: (orderId: string) => Promise<void>;
  onReject: (orderId: string) => Promise<void>;
  onDelete: (orderId: string, status: string) => Promise<void>;
  onEmail: (orderId: string) => Promise<void>;
  emailingOrderId: string | null;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
          {orders.length} orders
        </span>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <article key={order.id} className="rounded-2xl border border-border bg-background p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-semibold tracking-tight text-foreground">
                      {order.id}
                    </h3>
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${getStatusBadgeClass(
                        order.status
                      )}`}
                    >
                      {getStatusLabel(order.status)}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Distributor: {order.distributorSummary}</span>
                    <span>Units: {order.totalUnits}</span>
                    <span>Est. Cost: {formatCurrency(order.estimatedTotalCost)}</span>
                    <span>Created: {formatDateTime(order.created_at)}</span>
                    {order.approved_at ? <span>Approved: {formatDateTime(order.approved_at)}</span> : null}
                  </div>

                  {order.manager_note ? (
                    <div className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Manager Note:</span>{" "}
                      {order.manager_note}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Link
                    className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                    href={`/order-history/${order.id}`}
                  >
                    View
                  </Link>

                  {order.status === "draft" ? (
                    <>
                      <Button onClick={() => onSubmit(order.id)} className="min-h-10">
                        Submit for Approval
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-10 border-red-600/60 bg-red-500/15 text-red-100 hover:bg-red-500 hover:text-white"
                        onClick={() => onDelete(order.id, order.status)}
                      >
                        Delete Order
                      </Button>
                    </>
                  ) : null}

                  {order.status === "submitted" ? (
                    <>
                      <Button onClick={() => onApprove(order.id)} className="min-h-10 bg-green-600 hover:bg-green-700">
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-10 border-red-500/50 text-red-200 hover:bg-red-500 hover:text-red-50"
                        onClick={() => onReject(order.id)}
                      >
                        Reject
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-10 border-red-600/60 bg-red-500/15 text-red-100 hover:bg-red-500 hover:text-white"
                        onClick={() => onDelete(order.id, order.status)}
                      >
                        Delete Order
                      </Button>
                    </>
                  ) : null}

                  {order.status === "approved" ? (
                    <>
                      <Button
                        variant="outline"
                        className="min-h-10 border-border bg-card text-foreground hover:bg-muted"
                        onClick={() => {
                          window.location.href = `/api/export-order?order_id=${encodeURIComponent(
                            order.id
                          )}`;
                        }}
                      >
                        Export ZIP
                      </Button>
                      <Button
                        className="min-h-10 bg-blue-600 hover:bg-blue-700"
                        disabled={emailingOrderId === order.id}
                        onClick={() => onEmail(order.id)}
                      >
                        {emailingOrderId === order.id ? "Sending..." : "Email Vendors"}
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-9 border-red-700/70 bg-red-500/20 px-2.5 text-[11px] font-semibold text-red-100 hover:bg-red-500 hover:text-white"
                        onClick={() => onDelete(order.id, order.status)}
                      >
                        Delete Approved
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Order Summary:</span>{" "}
                  {order.totalDistributors} distributors
                </div>

                {order.distributorGroups.map((distributorGroup) => (
                  <section key={distributorGroup.name} className="rounded-xl border border-border">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {distributorGroup.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {distributorGroup.itemsCount} lines · {distributorGroup.totalUnits} units
                        </div>
                      </div>
                      <div className="text-xs font-medium text-muted-foreground">
                        {formatCurrency(distributorGroup.estimatedTotalCost)}
                      </div>
                    </div>

                    <div className="space-y-3 p-3">
                      {distributorGroup.brands.map((brandGroup) => (
                        <div key={`${distributorGroup.name}__${brandGroup.name}`} className="space-y-2">
                          <div className="flex items-center justify-between gap-2 px-1">
                            <div className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              {brandGroup.name}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {brandGroup.items.length} lines
                            </div>
                          </div>

                          <div className="space-y-2">
                            {brandGroup.items.map((line) => {
                              const product = getLineProduct(line.products);

                              return (
                                <div
                                  key={line.id}
                                  className="rounded-xl border border-border bg-background/80 p-3"
                                >
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-foreground">
                                        {product?.product_name ?? "-"}
                                      </div>
                                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                                        <span>SKU {product?.sku ?? "-"}</span>
                                        <span>Qty {toNumber(line.order_qty)}</span>
                                        <span>Unit {formatCurrency(line.unit_price)}</span>
                                        <span>
                                          Line{" "}
                                          {formatCurrency(
                                            toNumber(line.order_qty) * toNumber(line.unit_price)
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                                      {product?.category ?? "-"}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatCurrency(value: number | string | null | undefined) {
  const amount = toNumber(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}
