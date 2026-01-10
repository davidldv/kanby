import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Prevent Next from inferring the root from unrelated lockfiles above this repo.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
