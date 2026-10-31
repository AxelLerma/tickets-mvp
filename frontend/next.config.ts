import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.2"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://localhost:4000/api/:path*" }];
  },
};

export default nextConfig;