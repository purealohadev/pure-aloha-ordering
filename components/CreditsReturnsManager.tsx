"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CreditCard, FileSpreadsheet, UploadCloud } from "lucide-react";
import * as XLSX from "xlsx";
import NavBar from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  asNullableString,
  asNumber,
  asString,
  chunkArray,
  normalizeHeader,
} from "@/lib/import/shared";
import { createClient } from "@/lib/supabase/client";

type CreditTransaction = {
  id: string;
  distributor: string | null;
  vendor_name: string | null;
  credit_type: string | null;
  credit_amount: number | string | null;
  credit_date: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
};

type CreditTransactionImportRow = {
  distributor: string | null;
  vendor_name: string | null;
  credit_type: string | null;
  credit_amount: number;
  credit_date: string | null;
  status: string | null;
  notes: string | null;
};

type CreditReturnForm = {
  distributor: string;
  vendor_name: string;
  credit_type: "Credit" | "Return";
  credit_amount: string;
  credit_date: string;
  status: "Open" | "Used" | "Resolved";
  notes: string;
};

type VendorGroup = {
  vendorName: string;
  transactions: CreditTransaction[];
  totals: VendorCreditTotals;
};

type DistributorGroup = {
  distributor: string;
  vendors: VendorGroup[];
};

type VendorCreditTotals = {
  totalCredits: number;
  totalReturns: number;
  availableCredit: number;
};

type CreditDashboardSummary = {
  totalOpenCredit: number;
  totalUsedCredit: number;
  totalResolvedCredit: number;
  openTransactions: number;
};

type StatusFilter = "all" | "open" | "used" | "resolved";

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "used", label: "Used" },
  { value: "resolved", label: "Resolved" },
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function getTodayDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDefaultCreditReturnForm(): CreditReturnForm {
  return {
    distributor: "",
    vendor_name: "",
    credit_type: "Credit",
    credit_amount: "",
    credit_date: getTodayDateValue(),
    status: "Open",
    notes: "",
  };
}

function parseCreditAmount(value: number | string | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === "") return 0;

  const amount = Number(String(value).replace(/[$,]/g, "").trim());
  return Number.isFinite(amount) ? amount : 0;
}

function formatCurrency(value: number | string | null) {
  return currencyFormatter.format(parseCreditAmount(value));
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const [year, month, day] = value.split("-");
  if (year && month && day) return `${month}/${day}/${year}`;

  return value;
}

function normalizeDate(value: unknown) {
  const raw = asString(value);
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${slashMatch[1].padStart(2, "0")}-${slashMatch[2].padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString().slice(0, 10);
}

function normalizeType(value: string | null) {
  const type = value?.trim();
  if (!type) return "Credit";

  return type.charAt(0).toUpperCase() + type.slice(1);
}

function typeTone(value: string | null) {
  const type = (value || "").toLowerCase();

  if (type.includes("return")) return "border-yellow-500/40 bg-yellow-500/10 text-yellow-300";
  if (type.includes("credit")) return "border-green-500/40 bg-green-500/10 text-green-300";

  return "border-zinc-600 bg-zinc-900 text-zinc-300";
}

function statusTone(value: string | null) {
  const status = (value || "").toLowerCase();

  if (status.includes("open") || status.includes("pending")) {
    return "border-blue-500/40 bg-blue-500/10 text-blue-300";
  }

  if (status.includes("applied") || status.includes("paid") || status.includes("closed")) {
    return "border-green-500/40 bg-green-500/10 text-green-300";
  }

  return "border-zinc-600 bg-zinc-900 text-zinc-300";
}

function summarizeVendorTransactions(transactions: CreditTransaction[]): VendorCreditTotals {
  return transactions.reduce(
    (totals, transaction) => {
      const type = (transaction.credit_type || "").trim().toLowerCase();
      const amount = parseCreditAmount(transaction.credit_amount);

      if (type === "credit") {
        totals.totalCredits += amount;
      }

      if (type === "return") {
        totals.totalReturns += amount;
      }

      totals.availableCredit = totals.totalCredits + totals.totalReturns;
      return totals;
    },
    { totalCredits: 0, totalReturns: 0, availableCredit: 0 }
  );
}

function groupTransactions(transactions: CreditTransaction[]): DistributorGroup[] {
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

  return Array.from(distributorMap.entries()).map(([distributor, vendorMap]) => ({
    distributor,
    vendors: Array.from(vendorMap.entries()).map(([vendorName, vendorTransactions]) => ({
      vendorName,
      transactions: vendorTransactions,
      totals: summarizeVendorTransactions(vendorTransactions),
    })),
  }));
}

function summarizeByStatus(transactions: CreditTransaction[]): CreditDashboardSummary {
  return transactions.reduce(
    (summary, transaction) => {
      const status = (transaction.status || "").trim().toLowerCase();
      const amount = summarizeVendorTransactions([transaction]).availableCredit;

      if (status === "open") {
        summary.totalOpenCredit += amount;
        summary.openTransactions += 1;
      }

      if (status === "used") {
        summary.totalUsedCredit += amount;
      }

      if (status === "resolved") {
        summary.totalResolvedCredit += amount;
      }

      return summary;
    },
    {
      totalOpenCredit: 0,
      totalUsedCredit: 0,
      totalResolvedCredit: 0,
      openTransactions: 0,
    }
  );
}

export default function CreditsReturnsManager() {
  const [supabase] = useState(() => createClient());
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [collapsedVendors, setCollapsedVendors] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<CreditReturnForm>(() => getDefaultCreditReturnForm());
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<CreditTransactionImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updatingStatusIds, setUpdatingStatusIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadTransactions();
  }, []);

  async function loadTransactions(nextMessage?: string) {
    setLoading(true);

    const res = await fetchTransactions();

    setTransactions(res.transactions);
    setMessage(res.error || nextMessage || "");
    setLoading(false);
  }

  const filteredTransactions = useMemo(() => {
    if (statusFilter === "all") return transactions;

    return transactions.filter(
      (transaction) => (transaction.status || "").trim().toLowerCase() === statusFilter
    );
  }, [statusFilter, transactions]);

  const dashboardSummary = useMemo(() => summarizeByStatus(transactions), [transactions]);
  const groups = useMemo(() => groupTransactions(filteredTransactions), [filteredTransactions]);
  const previewText = parsedRows.length ? `${parsedRows.length} parsed rows ready` : "No parsed rows";

  function updateFormField<Key extends keyof CreditReturnForm>(
    field: Key,
    value: CreditReturnForm[Key]
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function createTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setMessage("");

    const amount = parseCreditAmount(form.credit_amount);
    const newTransaction = {
      distributor: form.distributor.trim() || null,
      vendor_name: form.vendor_name.trim() || null,
      credit_type: form.credit_type,
      credit_amount: amount,
      credit_date: form.credit_date || null,
      status: form.status,
      notes: form.notes.trim() || null,
    };

    const { data, error } = await supabase
      .from("credit_transactions")
      .insert(newTransaction)
      .select(
        "id, distributor, vendor_name, credit_type, credit_amount, credit_date, status, notes, created_at"
      )
      .single();

    if (error) {
      setMessage(error.message);
      setIsCreating(false);
      return;
    }

    setTransactions((current) => [data as CreditTransaction, ...current]);
    setForm(getDefaultCreditReturnForm());
    setMessage("Credit / return added.");
    setIsCreating(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setParsedRows([]);
    setMessage("");
  }

  async function parseCsv() {
    if (!file) return;

    setIsParsing(true);
    setMessage("Reading CSV...");
    setParsedRows([]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
        header: 1,
        defval: "",
        raw: false,
      });

      const headers = (raw[0] || []).map((header) => normalizeHeader(header));
      const rows = raw.slice(1);

      const normalized = rows
        .map((values) => {
          const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));

          return {
            distributor: asNullableString(row.distributor || row.distro),
            vendor_name: asNullableString(
              row.vendor_name || row.vendor || row.vendor_brand || row.brand || row.brand_name
            ),
            credit_type: asNullableString(row.credit_type || row.type || row.transaction_type),
            credit_amount: asNumber(row.credit_amount || row.amount || row.credit || row.value) ?? 0,
            credit_date: normalizeDate(row.credit_date || row.date || row.transaction_date),
            status: asNullableString(row.status || row.credit_status),
            notes: asNullableString(row.notes || row.note || row.memo || row.description),
          };
        })
        .filter((row) => row.distributor || row.vendor_name || row.credit_amount || row.credit_date);

      setParsedRows(normalized);
      setMessage(`Parsed ${normalized.length} credit transactions.`);
    } catch {
      setMessage("Could not parse that CSV.");
    } finally {
      setIsParsing(false);
    }
  }

  async function importRows() {
    if (!parsedRows.length) return;

    setIsImporting(true);
    setMessage("");

    try {
      const chunks = chunkArray(parsedRows, 500);
      let importedCount = 0;

      for (let i = 0; i < chunks.length; i++) {
        setMessage(`Importing batch ${i + 1} of ${chunks.length}...`);

        const res = await fetch("/api/import-credit-transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunks[i] }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || `Batch ${i + 1} failed`);
        }

        importedCount += data.count ?? chunks[i].length;
      }

      setParsedRows([]);
      await loadTransactions(`Import complete: ${importedCount} credit transactions added.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Credit transaction import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  function toggleVendor(distributor: string, vendorName: string) {
    const key = `${distributor}__${vendorName}`;
    setCollapsedVendors((current) => ({ ...current, [key]: !current[key] }));
  }

  async function updateTransactionStatus(transactionId: string, status: "Used" | "Resolved" | "Open") {
    setUpdatingStatusIds((current) => ({ ...current, [transactionId]: true }));
    setMessage("");

    const { error } = await supabase
      .from("credit_transactions")
      .update({ status })
      .eq("id", transactionId);

    if (error) {
      setMessage(error.message);
      setUpdatingStatusIds((current) => {
        const next = { ...current };
        delete next[transactionId];
        return next;
      });
      return;
    }

    setTransactions((current) =>
      current.map((transaction) =>
        transaction.id === transactionId ? { ...transaction, status } : transaction
      )
    );
    setUpdatingStatusIds((current) => {
      const next = { ...current };
      delete next[transactionId];
      return next;
    });
  }

  return (
    <div className="dark min-h-screen bg-zinc-900 font-sans text-white">
      <NavBar />

      <main className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-blue-300 uppercase">
              <CreditCard className="size-3.5" />
              Credits & Returns
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-blue-400">
              Credit & Return Transactions
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-zinc-400">
              Import Base44 credit rows and review credits or returns by distributor and vendor.
            </p>
          </div>

          <section className="rounded border border-zinc-700 bg-zinc-800 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <FileSpreadsheet className="size-4 text-blue-300" />
              CSV Import
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="max-w-full text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-zinc-600"
              />
              <Button
                type="button"
                variant="outline"
                className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-700"
                onClick={parseCsv}
                disabled={!file || isParsing || isImporting}
              >
                Parse CSV
              </Button>
              <Button
                type="button"
                onClick={importRows}
                disabled={!parsedRows.length || isParsing || isImporting}
              >
                <UploadCloud className="size-4" />
                Import
              </Button>
            </div>
            <div className="mt-2 text-xs text-zinc-400">
              {file ? `${file.name} - ${previewText}` : previewText}
            </div>
          </section>
        </div>

        {message ? (
          <div className="rounded border border-zinc-700 bg-zinc-800 p-3 text-sm text-zinc-300">
            {message}
          </div>
        ) : null}

        <form
          onSubmit={createTransaction}
          className="rounded border border-zinc-700 bg-zinc-800 p-3"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">New Credit / Return</h2>
              <p className="text-xs text-zinc-400">
                Add a manual tracker entry without changing imported history.
              </p>
            </div>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Adding..." : "Add Record"}
            </Button>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            <label className="grid gap-1 text-xs font-semibold text-zinc-400">
              Distributor
              <Input
                value={form.distributor}
                onChange={(event) => updateFormField("distributor", event.target.value)}
                className="border-zinc-700 bg-zinc-900 text-white"
                placeholder="Distributor"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-zinc-400">
              Vendor
              <Input
                value={form.vendor_name}
                onChange={(event) => updateFormField("vendor_name", event.target.value)}
                className="border-zinc-700 bg-zinc-900 text-white"
                placeholder="Vendor / brand"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-zinc-400">
              Type
              <select
                value={form.credit_type}
                onChange={(event) =>
                  updateFormField(
                    "credit_type",
                    event.target.value as CreditReturnForm["credit_type"]
                  )
                }
                className="h-8 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-sm text-white outline-none focus:border-zinc-500"
              >
                <option value="Credit">Credit</option>
                <option value="Return">Return</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-zinc-400">
              Amount
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.credit_amount}
                onChange={(event) => updateFormField("credit_amount", event.target.value)}
                className="border-zinc-700 bg-zinc-900 text-white"
                placeholder="0.00"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-zinc-400">
              Date
              <Input
                type="date"
                value={form.credit_date}
                onChange={(event) => updateFormField("credit_date", event.target.value)}
                className="border-zinc-700 bg-zinc-900 text-white"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-zinc-400">
              Status
              <select
                value={form.status}
                onChange={(event) =>
                  updateFormField("status", event.target.value as CreditReturnForm["status"])
                }
                className="h-8 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-sm text-white outline-none focus:border-zinc-500"
              >
                <option value="Open">Open</option>
                <option value="Used">Used</option>
                <option value="Resolved">Resolved</option>
              </select>
            </label>
          </div>

          <label className="mt-2 grid gap-1 text-xs font-semibold text-zinc-400">
            Notes
            <textarea
              value={form.notes}
              onChange={(event) => updateFormField("notes", event.target.value)}
              className="min-h-16 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm leading-snug text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              placeholder="Internal note"
            />
          </label>
        </form>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded border border-zinc-700 bg-zinc-800 p-3">
            <div className="text-xs font-semibold tracking-[0.08em] text-zinc-400 uppercase">
              Total Open Credit
            </div>
            <div className="mt-1 text-xl font-bold text-green-300">
              {formatCurrency(dashboardSummary.totalOpenCredit)}
            </div>
          </div>
          <div className="rounded border border-zinc-700 bg-zinc-800 p-3">
            <div className="text-xs font-semibold tracking-[0.08em] text-zinc-400 uppercase">
              Total Used Credit
            </div>
            <div className="mt-1 text-xl font-bold text-white">
              {formatCurrency(dashboardSummary.totalUsedCredit)}
            </div>
          </div>
          <div className="rounded border border-zinc-700 bg-zinc-800 p-3">
            <div className="text-xs font-semibold tracking-[0.08em] text-zinc-400 uppercase">
              Total Resolved Credit
            </div>
            <div className="mt-1 text-xl font-bold text-white">
              {formatCurrency(dashboardSummary.totalResolvedCredit)}
            </div>
          </div>
          <div className="rounded border border-zinc-700 bg-zinc-800 p-3">
            <div className="text-xs font-semibold tracking-[0.08em] text-zinc-400 uppercase">
              Open Transactions
            </div>
            <div className="mt-1 text-xl font-bold text-blue-300">
              {dashboardSummary.openTransactions}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-[0.08em] text-zinc-400 uppercase">
            Status
          </span>
          <div className="flex overflow-hidden rounded border border-zinc-700">
            {statusFilters.map((filter) => (
              <Button
                key={filter.value}
                type="button"
                variant="ghost"
                className={`rounded-none border-l border-zinc-700 px-3 first:border-l-0 ${
                  statusFilter === filter.value
                    ? "bg-white text-black hover:bg-zinc-200"
                    : "bg-zinc-800 text-white hover:bg-zinc-700"
                }`}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="rounded border border-zinc-700 bg-zinc-800 p-4 text-zinc-400">
            Loading credit transactions...
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded border border-zinc-700 bg-zinc-800 p-4 text-zinc-400">
            No credit transactions imported yet.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <section key={group.distributor} className="space-y-2">
                <div className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2">
                  <h2 className="text-sm font-semibold tracking-[0.08em] text-blue-300 uppercase">
                    {group.distributor}
                  </h2>
                </div>

                <div className="grid gap-2">
                  {group.vendors.map((vendor) => {
                    const key = `${group.distributor}__${vendor.vendorName}`;
                    const collapsed = collapsedVendors[key] ?? false;

                    return (
                      <article
                        key={key}
                        className="overflow-hidden rounded border border-zinc-700 bg-zinc-800"
                      >
                        <button
                          type="button"
                          onClick={() => toggleVendor(group.distributor, vendor.vendorName)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-zinc-700"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {collapsed ? (
                              <ChevronRight className="size-4 shrink-0 text-zinc-400" />
                            ) : (
                              <ChevronDown className="size-4 shrink-0 text-zinc-400" />
                            )}
                            <span className="truncate text-sm font-semibold text-white">
                              {vendor.vendorName}
                            </span>
                          </span>
                          <span className="shrink-0 rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-300">
                            {vendor.transactions.length} rows
                          </span>
                        </button>

                        {!collapsed ? (
                          <div className="divide-y divide-zinc-700 border-t border-zinc-700">
                            <div className="grid gap-2 bg-zinc-900 px-3 py-3 sm:grid-cols-3">
                              <div className="rounded border border-zinc-700 bg-zinc-950 p-3">
                                <div className="text-xs font-semibold tracking-[0.08em] text-zinc-400 uppercase">
                                  Total Credits
                                </div>
                                <div className="mt-1 text-lg font-bold text-white">
                                  {formatCurrency(vendor.totals.totalCredits)}
                                </div>
                              </div>
                              <div className="rounded border border-zinc-700 bg-zinc-950 p-3">
                                <div className="text-xs font-semibold tracking-[0.08em] text-zinc-400 uppercase">
                                  Total Returns
                                </div>
                                <div className="mt-1 text-lg font-bold text-white">
                                  {formatCurrency(vendor.totals.totalReturns)}
                                </div>
                              </div>
                              <div className="rounded border border-green-500/40 bg-zinc-950 p-3 shadow-[inset_0_0_0_1px_rgba(34,197,94,0.08)]">
                                <div className="text-xs font-semibold tracking-[0.08em] text-green-300 uppercase">
                                  Total Available Credit
                                </div>
                                <div className="mt-1 text-2xl font-black text-white">
                                  {formatCurrency(vendor.totals.availableCredit)}
                                </div>
                              </div>
                            </div>
                            {vendor.transactions.map((transaction) => (
                              <div
                                key={transaction.id}
                                className="grid gap-2 px-3 py-2 text-sm md:grid-cols-[92px_110px_110px_110px_minmax(0,1fr)_auto] md:items-center"
                              >
                                <div className="text-zinc-300">
                                  {formatDate(transaction.credit_date)}
                                </div>
                                <div>
                                  <span
                                    className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${typeTone(
                                      transaction.credit_type
                                    )}`}
                                  >
                                    {normalizeType(transaction.credit_type)}
                                  </span>
                                </div>
                                <div className="font-semibold text-white">
                                  {formatCurrency(transaction.credit_amount)}
                                </div>
                                <div>
                                  <span
                                    className={`inline-flex rounded border px-2 py-0.5 text-xs ${statusTone(
                                      transaction.status
                                    )}`}
                                  >
                                    {transaction.status || "No status"}
                                  </span>
                                </div>
                                <div className="min-w-0 whitespace-pre-wrap text-zinc-400">
                                  {transaction.notes || "-"}
                                </div>
                                <div className="flex flex-wrap items-center gap-1 md:justify-end">
                                  {(["Used", "Resolved", "Open"] as const).map((status) => (
                                    <Button
                                      key={status}
                                      type="button"
                                      variant="outline"
                                      className="h-7 border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 hover:bg-zinc-700"
                                      onClick={() => updateTransactionStatus(transaction.id, status)}
                                      disabled={updatingStatusIds[transaction.id]}
                                    >
                                      {status === "Open" ? "Reopen" : `Mark ${status}`}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

async function fetchTransactions() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("credit_transactions")
    .select(
      "id, distributor, vendor_name, credit_type, credit_amount, credit_date, status, notes, created_at"
    )
    .order("distributor", { ascending: true })
    .order("vendor_name", { ascending: true })
    .order("credit_date", { ascending: false });

  return {
    transactions: (data as CreditTransaction[] | null) ?? [],
    error: error?.message,
  };
}
