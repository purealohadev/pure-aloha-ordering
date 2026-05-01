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
      <div className="p-6 text-white bg-zinc-900 min-h-screen">Loading...</div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <NavBar />

      <div className="p-6 space-y-6">
        <h1 className="text-xl font-semibold">Approvals</h1>

        {/* SUBMITTED */}
        <div>
          <h2 className="text-lg mb-2 text-zinc-400">Submitted Orders</h2>

          {submitted.length === 0 && (
            <div className="text-zinc-500">No submitted orders.</div>
          )}

          {submitted.map((order) => (
            <div
              key={order.id}
              className="bg-zinc-800 p-4 rounded flex justify-between items-center mb-2"
            >
              <div>
                <div className="font-semibold">{order.id}</div>
                <div className="text-xs text-zinc-500">
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
                  className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                  onClick={() => rejectOrder(order.id)}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* APPROVED */}
        <div>
          <h2 className="text-lg mb-2 text-zinc-400">Approved Orders</h2>

          {approved.length === 0 && (
            <div className="text-zinc-500">No approved orders.</div>
          )}

          {approved.map((order) => (
            <div
              key={order.id}
              className="bg-zinc-800 p-4 rounded flex justify-between items-center mb-2"
            >
              <div>
                <div className="font-semibold">{order.id}</div>
                <div className="text-xs text-zinc-500">
                  {new Date(order.created_at).toLocaleString()}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700"
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
        </div>
      </div>
    </div>
  );
}
