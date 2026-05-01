"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type PriceAlertRow = {
  id: string;
  sku: string | null;
  brand_name: string | null;
  product_name: string | null;
  distributor: string | null;
  old_price: number | string | null;
  new_price: number | string | null;
  change_amount: number | string | null;
  change_percent: number | string | null;
  change_direction: string | null;
  status: string | null;
  created_at: string | null;
};

type PriceAlertsTableProps = {
  alerts: PriceAlertRow[];
  canReview: boolean;
};

export default function PriceAlertsTable({ alerts, canReview }: PriceAlertsTableProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function markReviewed(id: string) {
    setPendingId(id);

    try {
      const res = await fetch("/api/price-alerts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        alert(data.error || "Failed to mark the alert reviewed.");
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    } finally {
      setPendingId(null);
    }
  }

  if (!alerts.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-8 text-sm text-muted-foreground">
        No open price alerts right now.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-[minmax(0,1.1fr)_120px_180px_120px_120px_120px_120px_160px_110px] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground max-xl:hidden">
        <span>Product</span>
        <span>SKU</span>
        <span>Distributor</span>
        <span className="text-right">Old</span>
        <span className="text-right">New</span>
        <span className="text-right">Delta</span>
        <span className="text-right">Percent</span>
        <span className="text-right">Created</span>
        <span className="text-right">Action</span>
      </div>

      <div className="divide-y divide-border">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="grid gap-3 px-3 py-4 text-sm transition hover:bg-muted/25 max-xl:grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_120px_180px_120px_120px_120px_120px_160px_110px]"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium text-foreground">{alert.brand_name || "Unknown Brand"}</div>
                <DirectionBadge direction={alert.change_direction} />
              </div>
              <div className="text-muted-foreground">{alert.product_name || "Unknown Product"}</div>
              <div className="text-xs text-muted-foreground xl:hidden">
                SKU {alert.sku || "—"} | {alert.distributor || "—"}
              </div>
            </div>

            <Cell className="xl:text-left" label="SKU">
              {alert.sku || "—"}
            </Cell>
            <Cell className="xl:text-left" label="Distributor">
              {alert.distributor || "—"}
            </Cell>
            <Cell className="text-right" label="Old">
              {formatMoney(alert.old_price)}
            </Cell>
            <Cell className="text-right" label="New">
              {formatMoney(alert.new_price)}
            </Cell>
            <Cell className="text-right" label="Delta">
              {formatDelta(alert.change_amount)}
            </Cell>
            <Cell className="text-right" label="Percent">
              {formatPercent(alert.change_percent)}
            </Cell>
            <Cell className="text-right" label="Created">
              {alert.created_at ? new Date(alert.created_at).toLocaleString() : "—"}
            </Cell>
            <div className="flex items-center justify-end gap-2">
              {canReview ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pendingId === alert.id || isPending}
                  onClick={() => markReviewed(alert.id)}
                >
                  {pendingId === alert.id ? "Saving..." : "Mark Reviewed"}
                </Button>
              ) : (
                <Badge variant="outline">Open</Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Cell({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground xl:hidden">{label}</div>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

function DirectionBadge({ direction }: { direction: string | null }) {
  if (direction === "increase") {
    return (
      <Badge variant="outline" className="border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300">
        Up
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    >
      Down
    </Badge>
  );
}

function formatMoney(value: number | string | null) {
  const numberValue = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numberValue) ? numberValue : 0);
}

function formatDelta(value: number | string | null) {
  const numberValue = Number(value ?? 0);
  const formatted = formatMoney(value);

  return numberValue > 0 ? `+${formatted}` : formatted;
}

function formatPercent(value: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return "—";
  }

  return `${numberValue > 0 ? "+" : ""}${numberValue.toFixed(2)}%`;
}
