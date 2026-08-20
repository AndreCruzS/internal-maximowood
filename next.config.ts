import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Legacy URLs from the previous internal-maximowood portal (/maximo/*).
  async redirects() {
    return [
      { source: "/maximo", destination: "/", permanent: false },
      { source: "/maximo/calculator", destination: "/", permanent: false },
      { source: "/maximo/inventory", destination: "/inventory", permanent: false },
      { source: "/maximo/pricing", destination: "/pricing", permanent: false },
      { source: "/maximo/b2b", destination: "/b2b", permanent: false },
    ];
  },
};

export default nextConfig;
