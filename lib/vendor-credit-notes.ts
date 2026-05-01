export type CreditTransactionForTotals = {
  distributor: string | null;
  vendor_name: string | null;
  credit_type: string | null;
  credit_amount: number | string | null;
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
  return `${distributor}__${vendorName}`;
}

export function summarizeCreditTransactions(
  transactions: CreditTransactionForTotals[]
): VendorCreditTotals {
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

export function groupCreditTotals(transactions: CreditTransactionForTotals[]) {
  const distributorMap = new Map<string, Map<string, CreditTransactionForTotals[]>>();

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

  const totals = new Map<string, VendorCreditTotals>();

  for (const [distributor, vendorMap] of distributorMap.entries()) {
    for (const [vendorName, vendorTransactions] of vendorMap.entries()) {
      totals.set(vendorCreditKey(distributor, vendorName), summarizeCreditTransactions(vendorTransactions));
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
