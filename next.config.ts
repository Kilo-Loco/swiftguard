import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tree-sitter", "tree-sitter-swift"],
  outputFileTracingIncludes: {
    "/api/v1/review": [
      "./node_modules/tree-sitter/**/*",
      "./node_modules/tree-sitter-swift/**/*",
    ],
  },
};

export default nextConfig;
