import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo root has the old prototype's lockfile; this app is web/.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
