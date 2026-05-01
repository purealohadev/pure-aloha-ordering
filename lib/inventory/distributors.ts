export const ACCESSORIES_GROUP_NAME = "Accessories / Non-Consumables";
export const UNKNOWN_DISTRIBUTOR = "Unknown Distributor";

export const DISTRIBUTOR_DISPLAY_ORDER = [
  "KSS",
  "Nabis",
  "UpNorth",
  "Big Oil",
  "Other",
  UNKNOWN_DISTRIBUTOR,
  ACCESSORIES_GROUP_NAME,
];

const BRAND_DISTRIBUTOR_GROUPS = {
  KSS: [
    "Kiva",
    "Lost Farm",
    "Pacific Stone",
    "Garden Society",
    "Seed Junky",
    "Uncle Arnie's",
    "Arcata Fire",
    "Nasha",
    "CANN",
    "The Tablet",
    "Emerald Sky",
    "Gelato",
    "Keef",
    "Level",
    "Big Pete's",
    "Autumn Brands",
    "Pax Labs",
    "The Pairist",
    "CLSICS",
    "El Blunto",
    "PRESHA",
    "Tiny Fires",
    "Awesome Dope",
    "Ultra",
    "Northern Harvest",
    "Saida",
  ],
  Nabis: [
    "ABX",
    "Auntie Aloha",
    "Dompen",
    "KOA",
    "Delighted",
    "Liquid Flower",
    "Mary's Medicinals",
    "Kikoko",
    "Green Vibe",
    "Moon Valley",
    "OM",
    "Raw Garden",
    "Yummi Karma",
    "Vet CBD",
    "Statehouse",
  ],
  UpNorth: ["UpNorth", "Fig Farm", "Globs", "Daze Off"],
  "Big Oil": ["Bear Labs", "WVY"],
  Other: ["Boutiq", "Sherbinski"],
} as const;

export const DISTRIBUTOR_ORDER_INDEX = new Map(
  DISTRIBUTOR_DISPLAY_ORDER.map((name, index) => [name, index])
);

export const NON_CONSUMABLE_CATEGORIES = new Set(
  [
    "Accessory",
    "Accessories",
    "Battery",
    "Batteries",
    "Charger",
    "Hardware",
    "Glass",
    "Dab Tool",
    "Grinder",
    "Lighter",
    "Lighters",
    "Merchandise",
    "Non Consumable",
    "Non-consumable",
    "Papers",
    "Pipe",
    "Water Pipe",
    "Torch",
    "Rolling Papers",
    "Tray",
    "Trays",
    "Merch",
  ].map(normalizeGroupKey)
);

const BRAND_DISTRIBUTOR_FALLBACK = new Map<string, string>(
  Object.entries(BRAND_DISTRIBUTOR_GROUPS).flatMap(([distributor, brands]) =>
    brands.map((brand) => [normalizeGroupKey(brand), distributor])
  )
);

export function normalizeGroupKey(value: string) {
  return value.trim().toLowerCase();
}

export function getDistributorFromBrand(brandName: string | null | undefined) {
  const cleanBrand = brandName?.toLowerCase().trim();
  if (!cleanBrand) return null;

  return BRAND_DISTRIBUTOR_FALLBACK.get(cleanBrand) ?? null;
}

export function isNonConsumableCategory(category: string | null | undefined) {
  return category ? NON_CONSUMABLE_CATEGORIES.has(normalizeGroupKey(category)) : false;
}

export function getDisplayDistributorName(item: {
  brand: string | null;
  distributor: string | null;
  category: string | null;
}) {
  if (isNonConsumableCategory(item.category)) {
    return ACCESSORIES_GROUP_NAME;
  }

  const distributorName = item.distributor?.trim();
  if (distributorName) {
    return distributorName;
  }

  return getDistributorFromBrand(item.brand) ?? UNKNOWN_DISTRIBUTOR;
}
