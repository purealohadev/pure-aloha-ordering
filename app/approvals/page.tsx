"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PageShell from "@/components/PageShell";

type ApprovalOrder = {
  id: string;
  created_at: string;
  status: string;
  manager_note: string | null;
};

function getStatusStyle(status: string) {
  if (status === "approved") {
    return {
      background: "#dcfce7",
      color: "#166534",
      padding: "4px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      display: "inline-block",
    };
  }

  if (status === "rejected") {
    return {
      background: "#fee2e2",
      color: "#991b1b",
      padding: "4px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      display: "inline-block",
    };
  }

  return {
    background: "#fef3c7",
    color: "#92400e",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    display: "inline-block",
  };
}

export default function ApprovalsPage() {
  const supabase = createClient();

  const [orders, setOrders] = useState<ApprovalOrder[]>([]);
  const [role, setRole] = useState("unknown");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState("submitted");

  async function loadOrders() {
    setMessage("");
    setLoading(true);

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

    if (profile?.role !== "manager" && profile?.role !== "admin") {
      setMessage("You do not have access to approvals.");
      setLoading(false);
      return;
    }

    let query = supabase
      .from("purchase_orders")
      .select("id, created_at, status, manager_note")
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setOrders(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  function updateNote(orderId: string, value: string) {
    setNoteDrafts((prev) => ({
      ...prev,
      [orderId]: value,
    }));
  }

  async function approveOrder(orderId: string) {
    const note = noteDrafts[orderId] ?? "";

    const res = await fetch("/api/approve-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orderId, note }),
    });

    const data = await res.json();

    if (data.success) {
      setMessage("Order approved.");
      loadOrders();
    } else {
      setMessage(`Error: ${data.error}`);
    }
  }

  async function rejectOrder(orderId: string) {
    const note = noteDrafts[orderId] ?? "";

    const res = await fetch("/api/reject-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orderId, note }),
    });

    const data = await res.json();

    if (data.success) {
      setMessage("Order rejected.");
      loadOrders();
    } else {
      setMessage(`Error: ${data.error}`);
    }
  }

  const submittedCount = useMemo(
    () => orders.filter((o) => o.status === "submitted").length,
    [orders]
  );
  const approvedCount = useMemo(
    () => orders.filter((o) => o.status === "approved").length,
    [orders]
  );
  const rejectedCount = useMemo(
    () => orders.filter((o) => o.status === "rejected").length,
    [orders]
  );

  return (
    <PageShell
      title="Approvals"
      subtitle="Manager review for submitted purchase orders, with notes and approval actions."
    >
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          marginBottom: 24,
        }}
      >
        <StatCard label="Role" value={role} />
        <StatCard label="Submitted" value={String(submittedCount)} />
        <StatCard label="Approved" value={String(approvedCount)} />
        <StatCard label="Rejected" value={String(rejectedCount)} />
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <label style={{ fontWeight: 600 }}>Filter Status</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #cbd5e1",
          }}
        >
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>

        <button onClick={loadOrders} style={secondaryBtn}>
          Refresh
        </button>
      </div>

      {message ? (
        <div
          style={{
            marginBottom: 18,
            padding: 12,
            borderRadius: 10,
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1d4ed8",
          }}
        >
          {message}
        </div>
      ) : null}

      {loading ? (
        <p>Loading...</p>
      ) : role !== "manager" && role !== "admin" ? (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "#fee2e2",
            border: "1px solid #fecaca",
            color: "#991b1b",
          }}
        >
          You do not have access to approvals.
        </div>
      ) : orders.length === 0 ? (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "#f8fafc",
            border: "1px solid #e5e7eb",
            color: "#475569",
          }}
        >
          No orders found for this filter.
        </div>
      ) : (
        <div
          style={{
            marginTop: 8,
            overflowX: "auto",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead style={{ background: "#f8fafc" }}>
              <tr>
                <th style={th}>Order ID</th>
                <th style={th}>Created</th>
                <th style={th}>Status</th>
                <th style={th}>Existing Note</th>
                <th style={th}>Manager Note</th>
                <th style={th}>Actions</th>
                <th style={th}>Open</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td style={td}>{order.id}</td>
                  <td style={td}>{order.created_at}</td>
                  <td style={td}>
                    <span style={getStatusStyle(order.status)}>
                      {order.status}
                    </span>
                  </td>
                  <td style={td}>{order.manager_note ?? "-"}</td>
                  <td style={td}>
                    <textarea
                      value={noteDrafts[order.id] ?? ""}
                      onChange={(e) => updateNote(order.id, e.target.value)}
                      placeholder="Optional note"
                      rows={2}
                      style={{
                        width: 220,
                        padding: 8,
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                        resize: "vertical",
                      }}
                    />
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={() => approveOrder(order.id)}
                        style={approveBtn}
                        disabled={order.status !== "submitted"}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => rejectOrder(order.id)}
                        style={rejectBtn}
                        disabled={order.status !== "submitted"}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                  <td style={td}>
                    <Link href={`/order-history/${order.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 18,
        background: "#f8fafc",
      }}
    >
      <div style={{ color: "#64748b", fontSize: 14 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 8 }}>{value}</div>
    </div>
  );
}

const th = {
  borderBottom: "1px solid #ddd",
  textAlign: "left" as const,
  padding: "12px 10px",
  fontSize: 14,
};

const td = {
  borderBottom: "1px solid #eee",
  padding: "10px",
  fontSize: 14,
  verticalAlign: "top" as const,
};

const secondaryBtn = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  cursor: "pointer",
};

const approveBtn = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #166534",
  background: "#166534",
  color: "#fff",
  cursor: "pointer",
};

const rejectBtn = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #991b1b",
  background: "#991b1b",
  color: "#fff",
  cursor: "pointer",
};

