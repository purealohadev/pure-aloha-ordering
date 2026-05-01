import { asNullableString } from "@/lib/import/shared";

export type VendorContact = {
  id: string;
  distributor: string | null;
  vendor_name: string | null;
  rep_name: string | null;
  rep_email: string | null;
  rep_phone: string | null;
  ordering_email: string | null;
  accounting_email: string | null;
  payment_terms: string | null;
  notes: string | null;
  last_contacted: string | null;
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type VendorContactInput = Omit<
  VendorContact,
  "id" | "created_at" | "updated_at"
>;

export type VendorContactImportRow = Partial<Record<keyof VendorContactInput, unknown>> &
  Record<string, unknown>;

export const emptyVendorContactInput: VendorContactInput = {
  distributor: null,
  vendor_name: null,
  rep_name: null,
  rep_email: null,
  rep_phone: null,
  ordering_email: null,
  accounting_email: null,
  payment_terms: null,
  notes: null,
  last_contacted: null,
  status: "active",
};

export function cleanVendorContact(row: VendorContactImportRow): VendorContactInput | null {
  const contact: VendorContactInput = {
    distributor: pickString(row, "distributor", "distro"),
    vendor_name: pickString(row, "vendor_name", "vendor", "brand", "brand_name"),
    rep_name: pickString(row, "rep_name", "representative", "sales_rep", "rep"),
    rep_email: pickString(row, "rep_email", "representative_email", "sales_rep_email"),
    rep_phone: pickString(row, "rep_phone", "representative_phone", "sales_rep_phone"),
    ordering_email: pickString(row, "ordering_email", "orders_email", "order_email"),
    accounting_email: pickString(row, "accounting_email", "accounts_email", "ap_email"),
    payment_terms: pickString(row, "payment_terms", "terms"),
    notes: pickString(row, "notes", "note"),
    last_contacted: normalizeDate(pickString(row, "last_contacted", "last_contact")),
    status: pickString(row, "status") || "active",
  };

  if (
    !contact.distributor &&
    !contact.vendor_name &&
    !contact.rep_name &&
    !contact.rep_email &&
    !contact.ordering_email &&
    !contact.accounting_email
  ) {
    return null;
  }

  return contact;
}

export function normalizeVendorContactInput(input: Partial<VendorContactInput>) {
  return {
    distributor: asNullableString(input.distributor),
    vendor_name: asNullableString(input.vendor_name),
    rep_name: asNullableString(input.rep_name),
    rep_email: asNullableString(input.rep_email),
    rep_phone: asNullableString(input.rep_phone),
    ordering_email: asNullableString(input.ordering_email),
    accounting_email: asNullableString(input.accounting_email),
    payment_terms: asNullableString(input.payment_terms),
    notes: asNullableString(input.notes),
    last_contacted: normalizeDate(asNullableString(input.last_contacted)),
    status: asNullableString(input.status) || "active",
  };
}

function pickString(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = asNullableString(row[key]);

    if (value) return value;
  }

  return null;
}

function normalizeDate(value: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}
