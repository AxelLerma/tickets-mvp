import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.10", "192.168.1.10:3000", "*.trycloudflare.com"],
  serverExternalPackages: ["sharp"],
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;