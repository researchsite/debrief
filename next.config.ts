import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: { position: "top-right" },
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ['falkordb', 'pdf-parse'],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
