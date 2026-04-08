"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PageShell from "@/components/PageShell";

type ProductRow = {
  id: string;
  brand_name: string;
  product_name: string;
  category: string;
  distro: string;
  current_price: number;
  inventory?: {
    on_hand: number;
    par_level: number;
  }[];
};

type OrderRow = {
  id: string;
  brand_name: string;
  product_name: string;
  category: string;
  distro: string;
  current_price: number;
  onHand: number;
  par: number;
  suggested: number;
  status: string;
  lineTotal: number;
};

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
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(",")),
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

function getStatusStyle(status: string) {
  if (status === "Out") {
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

  if (status === "Needs Reorder") {
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

export default function OrdersPage() {
  const supabase = createClient();

  const [rows, setRows] = useState<OrderRow[]>([]);
  const [role, setRole] = useState<string>("unknown");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showOnlyReorders, setShowOnlyReorders] = useState(true);
  const [search, setSearch] = useState("");
  const [distroFilter, setDistroFilter] = useState("All");

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

      const mapped: OrderRow[] = (products as ProductRow[]).map((row) => {
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
          brand_name: row.brand_name,
          product_name: row.product_name,
          category: row.category,
          distro: row.distro || "Other",
          current_price: Number(row.current_price ?? 0),
          onHand,
          par,
          suggested,
          status,
          lineTotal: suggested * Number(row.current_price ?? 0),
        };
      });

      setRows(mapped);
      setLoading(false);
    }

    loadData();
  }, [supabase]);

  function updateSuggested(id: string, value: string) {
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

  async function createOrder() {
    setMessage("");

    const lines = rows
      .filter((r) => r.suggested > 0)
      .map((r) => ({
        product_id: r.id,
        qty: r.suggested,
        price: r.current_price,
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

  const distros = useMemo(() => {
    return ["All", ...Array.from(new Set(rows.map((r) => r.distro || "Other"))).sort()];
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesReorder = showOnlyReorders ? row.suggested > 0 : true;
      const matchesSearch =
        !search ||
        `${row.brand_name} ${row.product_name} ${row.category} ${row.distro}`
          .toLowerCase()
          .includes(search.toLowerCase());
      const matchesDistro = distroFilter === "All" ? true : row.distro === distroFilter;

      return matchesReorder && matchesSearch && matchesDistro;
    });
  }, [rows, showOnlyReorders, search, distroFilter]);

  const totalOrderValue = filteredRows.reduce((sum, row) => sum + row.lineTotal, 0);

  function exportAllOpenPO() {
    const exportRows = filteredRows
      .filter((r) => r.suggested > 0)
      .map((r) => ({
        distro: r.distro,
        brand_name: r.brand_name,
        product_name: r.product_name,
        category: r.category,
        on_hand: r.onHand,
        par_level: r.par,
        order_qty: r.suggested,
        unit_price: r.current_price,
        line_total: r.lineTotal.toFixed(2),
      }));

    if (!exportRows.length) {
      setMessage("No reorder lines to export.");
      return;
    }

    exportCsv("all-open-purchase-orders.csv", exportRows);
    setMessage("Exported all open purchase order lines.");
  }

  function exportDistroPO(distro: string) {
    const exportRows = rows
      .filter((r) => r.distro === distro && r.suggested > 0)
      .map((r) => ({
        brand_name: r.brand_name,
        product_name: r.product_name,
        category: r.category,
        on_hand: r.onHand,
        par_level: r.par,
        order_qty: r.suggested,
        unit_price: r.current_price,
        line_total: r.lineTotal.toFixed(2),
      }));

    if (!exportRows.length) {
      setMessage(`No reorder lines for ${distro}.`);
      return;
    }

    const safeName = distro.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    exportCsv(`${safeName}-purchase-order.csv`, exportRows);
    setMessage(`Exported ${distro} purchase order.`);
  }

  return (
    <PageShell
      title="Orders"
      subtitle="Review reorder items, edit quantities, submit drafts, and export by distro."
    >
      <div style={{ marginBottom: 18 }}>
        <p style={{ margin: "0 0 8px 0" }}>
          <strong>Role:</strong> {role}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Visible PO Value:</strong> ${totalOrderValue.toFixed(2)}
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={createOrder} style={primaryBtn}>
          Create Order
        </button>

        <button onClick={submitLatestDraft} style={secondaryBtn}>
          Submit Latest Draft
        </button>

        <button onClick={exportAllOpenPO} style={secondaryBtn}>
          Export All Open POs
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={showOnlyReorders}
            onChange={(e) => setShowOnlyReorders(e.target.checked)}
          />
          Show only reorder items
        </label>

        <input
          type="text"
          placeholder="Search brand or product"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: 10,
            minWidth: 240,
            borderRadius: 10,
            border: "1px solid #cbd5e1",
          }}
        />

        <select
          value={distroFilter}
          onChange={(e) => setDistroFilter(e.target.value)}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #cbd5e1",
          }}
        >
          {distros.map((distro) => (
            <option key={distro} value={distro}>
              {distro}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {distros
          .filter((d) => d !== "All")
          .map((distro) => (
            <button
              key={distro}
              onClick={() => exportDistroPO(distro)}
              style={secondaryBtn}
            >
              Export {distro}
            </button>
          ))}
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
                <th style={th}>Brand</th>
                <th style={th}>Product</th>
                <th style={th}>Category</th>
                <th style={th}>Distro</th>
                <th style={th}>On Hand</th>
                <th style={th}>Par</th>
                <th style={th}>Suggested</th>
                <th style={th}>Status</th>
                <th style={th}>Price</th>
                <th style={th}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td style={td}>{row.brand_name}</td>
                  <td style={td}>{row.product_name}</td>
                  <td style={td}>{row.category}</td>
                  <td style={td}>{row.distro}</td>
                  <td style={td}>{row.onHand}</td>
                  <td style={td}>{row.par}</td>
                  <td style={td}>
                    <input
                      type="number"
                      min="0"
                      value={row.suggested}
                      onChange={(e) => updateSuggested(row.id, e.target.value)}
                      style={{
                        width: 72,
                        padding: 6,
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </td>
                  <td style={td}>
                    <span style={getStatusStyle(row.status)}>
                      {row.status}
                    </span>
                  </td>
                  <td style={td}>${Number(row.current_price ?? 0).toFixed(2)}</td>
                  <td style={td}>${row.lineTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
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
};

const primaryBtn = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #0f172a",
  background: "#0f172a",
  color: "#fff",
  cursor: "pointer",
};

const secondaryBtn = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  cursor: "pointer",
};

