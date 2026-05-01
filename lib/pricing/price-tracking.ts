import { asNullableString, asNumber, asString, normalizeLooseName } from "@/lib/import/shared";

export type PriceChangeDirection = "increase" | "decrease" | "no_change";

export type PriceProductLookupRow = {
  id: string;
  sku: string | null;
  brand_name: string | null;
  product_name: string | null;
  distro: string | null;
};

export type PriceIdentity = {
  sku: string | null;
  brand_name: string | null;
  product_name: string | null;
  distributor: string | null;
};

export type PriceChange = {
  previous_unit_cost: number | null;
  change_amount: number | null;
  change_percent: number | null;
  change_direction: PriceChangeDirection | null;
};

export type PriceAlertRecord = {
  sku: string | null;
  brand_name: string | null;
  product_name: string | null;
  distributor: string | null;
  old_price: number;
  new_price: number;
  change_amount: number;
  change_percent: number | null;
  change_direction: "increase" | "decrease";
};

export type PriceSnapshotSource = {
  sku?: unknown;
  brand_name?: unknown;
  product_name?: unknown;
  distributor?: unknown;
  unit_cost?: unknown;
  price?: unknown;
  cost?: unknown;
  current_price?: unknown;
  source?: unknown;
};

export function cleanPriceIdentity(input: PriceSnapshotSource): PriceIdentity {
  return {
    sku: asNullableString(input.sku),
    brand_name: asNullableString(input.brand_name),
    product_name: asNullableString(input.product_name),
    distributor: asNullableString(input.distributor),
  };
}

export function cleanImportedUnitCost(input: PriceSnapshotSource) {
  return asNumber(input.unit_cost ?? (input as { price?: unknown }).price ?? (input as { cost?: unknown }).cost ?? (input as { current_price?: unknown }).current_price);
}

export function cleanPriceSource(input: PriceSnapshotSource) {
  return asNullableString(input.source);
}

export function normalizePriceKeyPart(value: unknown) {
  return normalizeLooseName(value);
}

export function buildPriceFallbackKey(identity: Pick<PriceIdentity, "brand_name" | "product_name" | "distributor">) {
  return [
    normalizePriceKeyPart(identity.brand_name),
    normalizePriceKeyPart(identity.product_name),
    normalizePriceKeyPart(identity.distributor),
  ].join("__");
}

export function buildPriceProductLookup(products: PriceProductLookupRow[]) {
  const skuMap = new Map<string, string>();
  const fallbackMap = new Map<string, string>();

  for (const product of products) {
    const sku = asString(product.sku);
    const fallbackKey = buildPriceFallbackKey({
      brand_name: product.brand_name,
      product_name: product.product_name,
      distributor: product.distro,
    });

    if (sku && !skuMap.has(sku)) {
      skuMap.set(sku, product.id);
    }

    if (fallbackKey && fallbackKey !== "__" && !fallbackMap.has(fallbackKey)) {
      fallbackMap.set(fallbackKey, product.id);
    }
  }

  return { skuMap, fallbackMap };
}

export function matchPriceProductId(
  identity: PriceIdentity,
  lookup: ReturnType<typeof buildPriceProductLookup>
) {
  const sku = asString(identity.sku);

  if (sku) {
    const skuMatch = lookup.skuMap.get(sku);
    if (skuMatch) return skuMatch;
  }

  const fallbackKey = buildPriceFallbackKey({
    brand_name: identity.brand_name,
    product_name: identity.product_name,
    distributor: identity.distributor,
  });

  if (fallbackKey && fallbackKey !== "__") {
    return lookup.fallbackMap.get(fallbackKey) ?? null;
  }

  return null;
}

export function calculatePriceChange(previousUnitCost: number, newUnitCost: number): PriceChange {
  const changeAmount = Number((newUnitCost - previousUnitCost).toFixed(2));
  const changePercent =
    previousUnitCost === 0
      ? null
      : Number((((changeAmount / previousUnitCost) * 100) || 0).toFixed(2));

  return {
    previous_unit_cost: previousUnitCost,
    change_amount: changeAmount,
    change_percent: changePercent,
    change_direction:
      changeAmount > 0 ? "increase" : changeAmount < 0 ? "decrease" : "no_change",
  };
}

export function shouldCreatePriceAlert(
  previousUnitCost: number | null | undefined,
  newUnitCost: number
) {
  return previousUnitCost != null && previousUnitCost !== newUnitCost;
}

export function buildPriceAlertRecord(
  identity: PriceIdentity,
  oldPrice: number,
  newPrice: number
): PriceAlertRecord | null {
  if (oldPrice === newPrice) return null;

  const change = calculatePriceChange(oldPrice, newPrice);

  if (change.change_direction !== "increase" && change.change_direction !== "decrease") {
    return null;
  }

  return {
    sku: identity.sku,
    brand_name: identity.brand_name,
    product_name: identity.product_name,
    distributor: identity.distributor,
    old_price: Number(oldPrice.toFixed(2)),
    new_price: Number(newPrice.toFixed(2)),
    change_amount: change.change_amount ?? 0,
    change_percent: change.change_percent,
    change_direction: change.change_direction,
  };
}

export async function maybeNotifyPriceAlertTeam(_alert: PriceAlertRecord) {
  return {
    sent: false,
    reason: "not_configured",
  };
}
