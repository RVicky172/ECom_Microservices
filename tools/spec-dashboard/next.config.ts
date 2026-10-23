import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // This app lives inside the store's repo, which has its own lockfile; pin the root to this folder.
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
