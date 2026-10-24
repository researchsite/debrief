import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ['falkordb', 'pdf-parse', 'zxing-wasm', 'sharp'],
  outputFileTracingIncludes: {
    '/api/import/classify': ['./node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'],
  },
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
