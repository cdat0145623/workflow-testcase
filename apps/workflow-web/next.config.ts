import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["workflow-web"],
  devIndicators: false,
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
};

export default nextConfig;
