import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@github/copilot-sdk"],
  devIndicators: false,
};

export default nextConfig;
