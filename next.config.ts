import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@github/copilot-sdk"],
  devIndicators: false,
};

export default nextConfig;
