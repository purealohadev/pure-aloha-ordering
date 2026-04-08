"use client";

import Link from "next/link";
import { useState } from "react";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");

  async function uploadFile() {
    if (!file) {
      setMessage("Choose a file first.");
      return;
    }

    setMessage("Parsing Excel...");

    const XLSX = await import("xlsx");
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);

    let allRows: any[] = [];

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet);

const mapped = rows.map((row: any) => ({
  brand_name: row.brand_name,
  product_name: row.name,
  category: row.category_group,
  distro: row.Distro || sheetName,
  current_price: Number(row.base_price ?? 0),
  on_hand: Number(row.current_inventory ?? 0),
  par_level: 0,
}));


      allRows.push(...mapped);
    });

    const res = await fetch("/api/import-full", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rows: allRows }),
    });

    const result = await res.json();

    if (result.success) {
      setMessage(`Imported ${result.count} rows`);
    } else {
      setMessage(result.error);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Import Order Guide</h1>
      <p>
        <Link href="/dashboard">← Back to Dashboard</Link>
      </p>

      <div style={{ marginTop: 24 }}>
        <input
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        {file ? <p>Loaded: {file.name}</p> : null}

        <button
          onClick={uploadFile}
          style={{ marginTop: 12, padding: "10px 14px" }}
        >
          Import File
        </button>
      </div>

      {message ? (
        <div style={{ marginTop: 20 }}>
          <p>{message}</p>
        </div>
      ) : null}
    </main>
  );
}


