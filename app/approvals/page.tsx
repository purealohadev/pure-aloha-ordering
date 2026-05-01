"use client";

import { useCallback, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Order = {
  id: string;
  status: string;
  created_at: string;
};

export default function ApprovalsPage() {
  const [supabase] = useState(() => createClient());
  const [submitted, setSubmitted] = useState<Order[]>([]);
  const [approved, setApproved] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailingOrderId, setEmailingOrderId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from("purchase_orders")
      .select("id, status, created_at")
      .order("created_at", { ascending: false });

    const submittedOrders = (data || []).filter(
      (o) => o.status === "submitted"
    );
    const approvedOrders = (data || []).filter(
      (o) => o.status === "approved"
    );

    setSubmitted(submittedOrders);
    setApproved(approvedOrders);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadOrders();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadOrders]);

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
      alert(data.error || "Failed to approve.");
      return;
    }

    alert("Order approved.");
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
      alert(data.error || "Failed to reject.");
      return;
    }

    alert("Order rejected.");
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
        alert(data.error || "Failed to email vendors.");
        return;
      }

      alert("Vendor emails sent.");
    } finally {
      setEmailingOrderId(null);
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

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="border-b border-border pb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-blue-600 dark:text-blue-400">
            Approvals
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review submitted orders and export approved vendor packets.
          </p>
        </div>

        {/* SUBMITTED */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-foreground">Submitted Orders</h2>

          {submitted.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              No submitted orders.
            </div>
          )}

          {submitted.map((order) => (
            <div
              key={order.id}
              className="mb-2 flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="font-semibold text-foreground">{order.id}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(order.created_at).toLocaleString()}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => approveOrder(order.id)}
                >
                  Approve
                </Button>

                <Button
                  variant="outline"
                  className="border-red-500/50 text-red-600 hover:bg-red-500 hover:text-red-50 dark:text-red-400"
                  onClick={() => rejectOrder(order.id)}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </section>

        {/* APPROVED */}
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-foreground">Approved Orders</h2>

          {approved.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              No approved orders.
            </div>
          )}

          {approved.map((order) => (
            <div
              key={order.id}
              className="mb-2 flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="font-semibold text-foreground">{order.id}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(order.created_at).toLocaleString()}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border-border bg-background text-foreground hover:bg-muted"
                  onClick={() => {
                    window.location.href = `/api/export-order?order_id=${encodeURIComponent(
                      order.id
                    )}`;
                  }}
                >
                  Export ZIP
                </Button>

                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={emailingOrderId === order.id}
                  onClick={() => emailVendors(order.id)}
                >
                  {emailingOrderId === order.id
                    ? "Sending..."
                    : "Email Vendors"}
                </Button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
