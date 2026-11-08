import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return {
      fallback: [{ source: "/:path*", destination: "/legacy/:path*" }],
    };
  },
};

export default nextConfig;
