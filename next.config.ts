import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@github/copilot-sdk"],
  // The SDK resolves its platform package dynamically; static tracing misses it.
  outputFileTracingIncludes: {
    "/api/copilot": ["./node_modules/@github/copilot-sdk-*/**/*"],
    "/api/copilot/check": ["./node_modules/@github/copilot-sdk-*/**/*"],
  },
  devIndicators: false,
};

export default nextConfig;
