export type CreditTransactionForTotals = {
  distributor: string | null;
  vendor_name: string | null;
  credit_type: string | null;
  credit_amount: number | string | null;
  status?: string | null;
};

export type VendorCreditTotals = {
  totalCredits: number;
  totalReturns: number;
  availableCredit: number;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function parseCreditAmount(value: number | string | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === "") return 0;

  const amount = Number(String(value).replace(/[$,]/g, "").trim());
  return Number.isFinite(amount) ? amount : 0;
}

export function formatCreditCurrency(value: number | string | null) {
  return currencyFormatter.format(parseCreditAmount(value));
}

export function vendorCreditKey(distributor: string, vendorName: string) {
  return `${normalizeMatchKey(distributor)}__${normalizeMatchKey(vendorName)}`;
}

function normalizeMatchKey(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[™®©]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function preferDisplayName(current: string | undefined, candidate: string) {
  if (!current) return candidate;
  if (current === current.toUpperCase() && candidate !== candidate.toUpperCase()) return candidate;
  return current;
}

function normalizeCreditStatus(value: string | null | undefined) {
  const status = (value || "").trim().toLowerCase();

  if (["used", "closed"].includes(status)) return "Used";
  if (status.includes("used") || status.includes("closed")) return "Used";

  return "Available";
}

export function summarizeCreditTransactions(
  transactions: CreditTransactionForTotals[]
): VendorCreditTotals {
  return transactions.reduce(
    (totals, transaction) => {
      const type = (transaction.credit_type || "").trim().toLowerCase();
      const amount = parseCreditAmount(transaction.credit_amount);
      const isAvailable = normalizeCreditStatus(transaction.status) === "Available";

      if (type === "credit") {
        totals.totalCredits += amount;
        if (isAvailable) totals.availableCredit += amount;
      }

      if (type === "return") {
        totals.totalReturns += amount;
        if (isAvailable) totals.availableCredit += amount;
      }

      return totals;
    },
    { totalCredits: 0, totalReturns: 0, availableCredit: 0 }
  );
}

export function groupCreditTotals(transactions: CreditTransactionForTotals[]) {
  const distributorMap = new Map<
    string,
    {
      displayName: string;
      vendors: Map<string, { displayName: string; transactions: CreditTransactionForTotals[] }>;
    }
  >();

  for (const transaction of transactions) {
    const distributor = transaction.distributor || "Unknown Distributor";
    const vendorName = transaction.vendor_name || "Unknown Vendor";
    const distributorKey = normalizeMatchKey(distributor);
    const vendorKey = normalizeMatchKey(vendorName);

    if (!distributorMap.has(distributorKey)) {
      distributorMap.set(distributorKey, { displayName: distributor, vendors: new Map() });
    }

    const distributorGroup = distributorMap.get(distributorKey);
    if (!distributorGroup) continue;

    distributorGroup.displayName = preferDisplayName(distributorGroup.displayName, distributor);

    if (!distributorGroup.vendors.has(vendorKey)) {
      distributorGroup.vendors.set(vendorKey, { displayName: vendorName, transactions: [] });
    }

    const vendorGroup = distributorGroup.vendors.get(vendorKey);
    if (!vendorGroup) continue;

    vendorGroup.displayName = preferDisplayName(vendorGroup.displayName, vendorName);
    vendorGroup.transactions.push(transaction);
  }

  const totals = new Map<string, VendorCreditTotals>();

  for (const distributorGroup of distributorMap.values()) {
    for (const vendorGroup of distributorGroup.vendors.values()) {
      totals.set(
        vendorCreditKey(distributorGroup.displayName, vendorGroup.displayName),
        summarizeCreditTransactions(vendorGroup.transactions)
      );
    }
  }

  return totals;
}

export function getCreditExportFields(
  creditTotals: Map<string, VendorCreditTotals>,
  distributor: string,
  vendorName: string
): { available_credit: string; credit_note: string } {
  const availableCredit =
    creditTotals.get(vendorCreditKey(distributor, vendorName))?.availableCredit ?? 0;

  return {
    available_credit: formatCreditCurrency(availableCredit),
    credit_note:
      availableCredit > 0 ? "Credit available — consider applying before payment." : "",
  };
}
