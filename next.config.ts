import fs from "fs";
import path from "path";
import type { NextConfig } from "next";

const distributorBrandMapCsv = fs.readFileSync(
  path.resolve(__dirname, "data/distributor-brand-map.csv"),
  "utf8"
);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_DISTRIBUTOR_BRAND_MAP_CSV: distributorBrandMapCsv,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
