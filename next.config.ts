import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tree-sitter", "tree-sitter-swift"],
};

export default nextConfig;
