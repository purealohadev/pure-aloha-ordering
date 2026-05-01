"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  FileSpreadsheet,
  LoaderCircle,
  Mail,
  Pencil,
  Phone,
  Plus,
  Save,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeHeader } from "@/lib/import/shared";
import {
  emptyVendorContactInput,
  type VendorContact,
  type VendorContactInput,
  type VendorContactImportRow,
} from "@/lib/vendor-contacts";

type VendorContactsManagerProps = {
  initialContacts: VendorContact[];
  initialError?: string;
};

type DraftMap = Record<string, VendorContactInput>;

const fieldLabels: Array<[keyof VendorContactInput, string, "text" | "email" | "tel" | "date"]> = [
  ["distributor", "Distributor", "text"],
  ["vendor_name", "Vendor", "text"],
  ["rep_name", "Rep", "text"],
  ["rep_email", "Rep email", "email"],
  ["rep_phone", "Rep phone", "tel"],
  ["ordering_email", "Ordering email", "email"],
  ["accounting_email", "Accounting email", "email"],
  ["payment_terms", "Payment terms", "text"],
  ["last_contacted", "Last contacted", "date"],
  ["status", "Status", "text"],
];

export default function VendorContactsManager({
  initialContacts,
  initialError,
}: VendorContactsManagerProps) {
  const [contacts, setContacts] = useState(initialContacts);
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [newDraft, setNewDraft] = useState<VendorContactInput>(emptyVendorContactInput);
  const [showNewForm, setShowNewForm] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState(initialError ?? "");
  const [isImporting, setIsImporting] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const groupedContacts = useMemo(() => groupContacts(contacts), [contacts]);
  const contactCount = contacts.length;

  function startEdit(contact: VendorContact) {
    setEditing((current) => ({ ...current, [contact.id]: true }));
    setDrafts((current) => ({ ...current, [contact.id]: contactToInput(contact) }));
  }

  function cancelEdit(id: string) {
    setEditing((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function updateDraft(id: string, field: keyof VendorContactInput, value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? emptyVendorContactInput),
        [field]: value || null,
      },
    }));
  }

  async function saveContact(id: string) {
    const draft = drafts[id];
    if (!draft) return;

    setSavingId(id);
    setStatus("");

    try {
      const res = await fetch("/api/vendor-contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, contact: draft }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Save failed.");
      }

      setContacts((current) =>
        current.map((contact) => (contact.id === id ? data.contact : contact))
      );
      cancelEdit(id);
      setStatus("Saved vendor contact.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSavingId(null);
    }
  }

  async function createContact() {
    setIsCreating(true);
    setStatus("");

    try {
      const res = await fetch("/api/vendor-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: newDraft }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Create failed.");
      }

      setContacts((current) => sortContacts([data.contact, ...current]));
      setNewDraft(emptyVendorContactInput);
      setShowNewForm(false);
      setStatus("Created vendor contact.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Create failed.");
    } finally {
      setIsCreating(false);
    }
  }

  async function importCsv() {
    if (!file) return;

    setIsImporting(true);
    setStatus("Parsing vendor_contacts.csv...");

    try {
      const rows = parseVendorContactsCsv(await file.text());

      if (!rows.length) {
        throw new Error("No valid rows found in that CSV.");
      }

      const res = await fetch("/api/import-vendor-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Import failed.");
      }

      setContacts((current) => sortContacts([...(data.contacts ?? []), ...current]));
      setStatus(`Imported ${data.count ?? rows.length} vendor contacts.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-700 bg-zinc-800/80 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-blue-400">
              Vendor Contacts
            </h1>
            <p className="text-sm text-zinc-400">
              {contactCount} contacts grouped by distributor and vendor.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 transition hover:bg-zinc-800">
              <FileSpreadsheet className="size-4" />
              <span>{file ? file.name : "vendor_contacts.csv"}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <Button
              type="button"
              size="sm"
              disabled={!file || isImporting}
              onClick={importCsv}
              className="bg-blue-500 text-white hover:bg-blue-400"
            >
              {isImporting ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Import CSV
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowNewForm(true)}
              className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
            >
              <Plus className="size-4" />
              New Vendor Contact
            </Button>
          </div>
        </div>

        {status ? (
          <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
            {status}
          </div>
        ) : null}
      </section>

      {showNewForm ? (
        <section className="rounded-xl border border-blue-500/40 bg-zinc-800 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-blue-300">
              New Vendor Contact
            </h2>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                setShowNewForm(false);
                setNewDraft(emptyVendorContactInput);
              }}
              aria-label="Cancel new vendor contact"
            >
              <X className="size-4" />
            </Button>
          </div>
          <ContactEditor
            draft={newDraft}
            onChange={(field, value) =>
              setNewDraft((current) => ({ ...current, [field]: value || null }))
            }
          />
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={isCreating}
              onClick={createContact}
              className="bg-blue-500 text-white hover:bg-blue-400"
            >
              {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save New Contact
            </Button>
          </div>
        </section>
      ) : null}

      <div className="space-y-5">
        {groupedContacts.map((distributorGroup) => (
          <section key={distributorGroup.distributor} className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-zinc-100">
                {distributorGroup.distributor}
              </h2>
              <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                {distributorGroup.count}
              </span>
            </div>

            <div className="space-y-3">
              {distributorGroup.vendors.map((vendorGroup) => (
                <div key={`${distributorGroup.distributor}-${vendorGroup.vendor}`}>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.08em] text-zinc-400">
                    {vendorGroup.vendor}
                  </h3>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {vendorGroup.contacts.map((contact) => {
                      const isEditing = Boolean(editing[contact.id]);
                      const draft = drafts[contact.id] ?? contactToInput(contact);

                      return (
                        <article
                          key={contact.id}
                          className="rounded-xl border border-zinc-700 bg-zinc-800 p-4 shadow-sm"
                        >
                          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-base font-semibold text-white">
                                {contact.rep_name || "No rep name"}
                              </div>
                              <div className="text-xs text-zinc-500">{contact.id}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300">
                                {contact.status || "active"}
                              </span>
                              {isEditing ? (
                                <>
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    disabled={savingId === contact.id}
                                    onClick={() => saveContact(contact.id)}
                                    aria-label="Save vendor contact"
                                    className="bg-blue-500 text-white hover:bg-blue-400"
                                  >
                                    {savingId === contact.id ? (
                                      <LoaderCircle className="size-4 animate-spin" />
                                    ) : (
                                      <Save className="size-4" />
                                    )}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    onClick={() => cancelEdit(contact.id)}
                                    aria-label="Cancel edit"
                                  >
                                    <X className="size-4" />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="outline"
                                  onClick={() => startEdit(contact)}
                                  aria-label="Edit vendor contact"
                                  className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              )}
                            </div>
                          </div>

                          {isEditing ? (
                            <ContactEditor
                              draft={draft}
                              onChange={(field, value) => updateDraft(contact.id, field, value)}
                            />
                          ) : (
                            <ContactDetails contact={contact} />
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ContactDetails({ contact }: { contact: VendorContact }) {
  return (
    <div className="grid gap-2 text-sm text-zinc-300 md:grid-cols-2">
      <Detail icon={<Mail className="size-4" />} label="Rep email" value={contact.rep_email} />
      <Detail icon={<Phone className="size-4" />} label="Rep phone" value={contact.rep_phone} />
      <Detail label="Ordering email" value={contact.ordering_email} />
      <Detail label="Accounting email" value={contact.accounting_email} />
      <Detail label="Payment terms" value={contact.payment_terms} />
      <Detail
        icon={<CalendarDays className="size-4" />}
        label="Last contacted"
        value={contact.last_contacted}
      />
      <div className="md:col-span-2">
        <Detail label="Notes" value={contact.notes} />
      </div>
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="min-h-5 break-words text-zinc-200">{value || "Not set"}</div>
    </div>
  );
}

function ContactEditor({
  draft,
  onChange,
}: {
  draft: VendorContactInput;
  onChange: (field: keyof VendorContactInput, value: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {fieldLabels.map(([field, label, type]) => (
        <label key={field} className="space-y-1 text-xs font-medium text-zinc-400">
          <span>{label}</span>
          <Input
            type={type}
            value={draft[field] ?? ""}
            onChange={(event) => onChange(field, event.target.value)}
            className="border-zinc-700 bg-zinc-900 text-zinc-100"
          />
        </label>
      ))}
      <label className="space-y-1 text-xs font-medium text-zinc-400 md:col-span-2">
        <span>Notes</span>
        <textarea
          value={draft.notes ?? ""}
          onChange={(event) => onChange("notes", event.target.value)}
          className="min-h-20 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 outline-none transition focus-visible:border-zinc-500 focus-visible:ring-3 focus-visible:ring-zinc-500/30"
        />
      </label>
    </div>
  );
}

function contactToInput(contact: VendorContact): VendorContactInput {
  return {
    distributor: contact.distributor,
    vendor_name: contact.vendor_name,
    rep_name: contact.rep_name,
    rep_email: contact.rep_email,
    rep_phone: contact.rep_phone,
    ordering_email: contact.ordering_email,
    accounting_email: contact.accounting_email,
    payment_terms: contact.payment_terms,
    notes: contact.notes,
    last_contacted: contact.last_contacted,
    status: contact.status || "active",
  };
}

function groupContacts(contacts: VendorContact[]) {
  const distributorMap = new Map<
    string,
    Map<string, VendorContact[]>
  >();

  for (const contact of sortContacts(contacts)) {
    const distributor = contact.distributor || "Unassigned Distributor";
    const vendor = contact.vendor_name || "Unassigned Vendor";

    if (!distributorMap.has(distributor)) {
      distributorMap.set(distributor, new Map());
    }

    const vendorMap = distributorMap.get(distributor)!;
    vendorMap.set(vendor, [...(vendorMap.get(vendor) ?? []), contact]);
  }

  return Array.from(distributorMap.entries()).map(([distributor, vendorMap]) => ({
    distributor,
    count: Array.from(vendorMap.values()).reduce((sum, items) => sum + items.length, 0),
    vendors: Array.from(vendorMap.entries()).map(([vendor, vendorContacts]) => ({
      vendor,
      contacts: vendorContacts,
    })),
  }));
}

function sortContacts(items: VendorContact[]) {
  return [...items].sort((a, b) => {
    const distributor = (a.distributor || "").localeCompare(b.distributor || "");
    if (distributor !== 0) return distributor;

    const vendor = (a.vendor_name || "").localeCompare(b.vendor_name || "");
    if (vendor !== 0) return vendor;

    return (a.rep_name || "").localeCompare(b.rep_name || "");
  });
}

function parseVendorContactsCsv(text: string): VendorContactImportRow[] {
  const table = parseCsv(text);
  const [headerRow, ...dataRows] = table;
  const headers = (headerRow ?? []).map((header) => normalizeHeader(header).replace(/^\uFEFF/, ""));

  return dataRows
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
    )
    .filter((row) => Object.values(row).some((value) => String(value).trim()));
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      value += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i += 1;
      row.push(value.trim());
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value || row.length) {
    row.push(value.trim());
    rows.push(row);
  }

  return rows;
}
