import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo root has the old prototype's lockfile; this app is web/.
  turbopack: { root: path.resolve(__dirname) },
  // The dev badge sits on top of the bottom nav.
  devIndicators: false,
  // Memoizes components automatically: a toast or a pending flag no longer
  // re-renders every card.
  reactCompiler: true,
};

export default nextConfig;
