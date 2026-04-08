"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NavBar() {
  const supabase = createClient();
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    async function loadRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      setRole(profile?.role ?? "");
    }

    loadRole();
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 20px",
        borderBottom: "1px solid #e5e7eb",
        background: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <strong>Pure Aloha</strong>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/inventory">Inventory</Link>
        <Link href="/orders">Orders</Link>
        <Link href="/order-history">Order History</Link>
        {role === "manager" || role === "admin" ? (
          <Link href="/approvals">Approvals</Link>
        ) : null}
        <Link href="/import">Import</Link>
      </div>

      <button
        onClick={signOut}
        style={{
          padding: "8px 12px",
          border: "1px solid #d1d5db",
          borderRadius: 8,
          background: "#fff",
          cursor: "pointer",
        }}
      >
        Log Out
      </button>
    </div>
  );
}

