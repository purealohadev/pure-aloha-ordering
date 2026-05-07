export const ACCESSORIES_GROUP_NAME = "Accessories / Non-Consumables";
export const UNKNOWN_DISTRIBUTOR = "Unknown Distributor";

export const DISTRIBUTOR_DISPLAY_ORDER = [
  "KSS",
  "Nabis",
  "Kindhouse",
  "UpNorth",
  "Big Oil",
  "Self Distro",
  "Other",
  UNKNOWN_DISTRIBUTOR,
  ACCESSORIES_GROUP_NAME,
];

export type DistributorBrandMatchType = "hard" | "soft";
export type DistributorBrandConfidence = "high" | "medium" | "low";

export type DistributorBrandMapEntry = {
  distributor: string;
  brand: string;
  match_type: DistributorBrandMatchType;
  confidence: DistributorBrandConfidence;
  notes: string;
};

export type DistributorBrandResolution = DistributorBrandMapEntry & {
  locked: boolean;
  review_required: boolean;
};

const BRAND_DISTRIBUTOR_GROUPS = {
  Nabis: [
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
  Kindhouse: [
    "CannaCraft",
    "ABX",
    "Farmer and the Felon",
    "Care By Design",
    "Humboldt Terp Council",
    "Loud + Clear",
    "Lagunitas Hi-Fi Sessions",
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

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());

  return values;
}

function isDistributorBrandMatchType(value: string): value is DistributorBrandMatchType {
  return value === "hard" || value === "soft";
}

function isDistributorBrandConfidence(value: string): value is DistributorBrandConfidence {
  return value === "high" || value === "medium" || value === "low";
}

function parseDistributorBrandMap(csv: string): DistributorBrandMapEntry[] {
  const [headerLine, ...lines] = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (!headerLine) return [];

  const headers = parseCsvLine(headerLine).map((header) => header.trim().toLowerCase());

  return lines.flatMap((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const matchType = row.match_type?.toLowerCase() ?? "";
    const confidence = row.confidence?.toLowerCase() ?? "";

    if (
      !row.distributor ||
      !row.brand ||
      !isDistributorBrandMatchType(matchType) ||
      !isDistributorBrandConfidence(confidence)
    ) {
      return [];
    }

    return [
      {
        distributor: row.distributor,
        brand: row.brand,
        match_type: matchType,
        confidence,
        notes: row.notes ?? "",
      },
    ];
  });
}

export const DISTRIBUTOR_BRAND_MAP: DistributorBrandMapEntry[] =
  parseDistributorBrandMap(process.env.NEXT_PUBLIC_DISTRIBUTOR_BRAND_MAP_CSV ?? "");

const BRAND_DISTRIBUTOR_FALLBACK = new Map<string, string>(
  Object.entries(BRAND_DISTRIBUTOR_GROUPS).flatMap(([distributor, brands]) =>
    brands.map((brand) => [normalizeGroupKey(brand), distributor])
  )
);

const DISTRIBUTOR_BRAND_MATCHES = new Map<string, DistributorBrandMapEntry>(
  DISTRIBUTOR_BRAND_MAP.map((entry) => [normalizeGroupKey(entry.brand), entry])
);

export function normalizeGroupKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[™®©]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u02BC\uFF07']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getDistributorFromBrand(brandName: string | null | undefined) {
  const cleanBrand = brandName ? normalizeGroupKey(brandName) : "";
  if (!cleanBrand) return null;

  const match = getDistributorBrandMatch(brandName);
  if (match?.match_type === "hard" && match.confidence === "high") return match.distributor;

  return BRAND_DISTRIBUTOR_FALLBACK.get(cleanBrand) ?? null;
}

export function getDistributorBrandMatch(brandName: string | null | undefined) {
  const cleanBrand = brandName ? normalizeGroupKey(brandName) : "";
  if (!cleanBrand) return null;

  return DISTRIBUTOR_BRAND_MATCHES.get(cleanBrand) ?? null;
}

export function resolveDistributorBrand(
  brandName: string | null | undefined,
  distributorName: string | null | undefined
): DistributorBrandResolution | null {
  const explicitDistributor = distributorName?.trim() || null;
  const match = getDistributorBrandMatch(brandName);

  if (explicitDistributor) {
    return {
      distributor: explicitDistributor,
      brand: brandName?.trim() || match?.brand || "",
      match_type: match?.match_type ?? "soft",
      confidence: "high",
      notes: "Distributor supplied by import/feed",
      locked: false,
      review_required: false,
    };
  }

  if (!match) {
    const fallbackDistributor = BRAND_DISTRIBUTOR_FALLBACK.get(
      brandName ? normalizeGroupKey(brandName) : ""
    );

    return fallbackDistributor
      ? {
          distributor: fallbackDistributor,
          brand: brandName?.trim() || "",
          match_type: "soft",
          confidence: "medium",
          notes: "Legacy fallback",
          locked: false,
          review_required: false,
        }
      : null;
  }

  if (match.match_type === "hard" && match.confidence === "high") {
    return {
      ...match,
      locked: true,
      review_required: false,
    };
  }

  return {
    ...match,
    locked: false,
    review_required: match.confidence === "low",
  };
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

  const resolution = resolveDistributorBrand(item.brand, item.distributor);

  if (resolution?.review_required) return UNKNOWN_DISTRIBUTOR;

  return resolution?.distributor ?? UNKNOWN_DISTRIBUTOR;
}
