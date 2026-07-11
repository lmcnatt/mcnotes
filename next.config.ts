import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle (server.js + minimal node_modules)
  // for a small production Docker image.
  output: "standalone",
  // Keep the native SQLite module external so it is loaded from node_modules at
  // runtime instead of being bundled (bundling breaks native .node binaries).
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
