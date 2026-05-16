import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Transpile the local SDK package
  transpilePackages: ['survey-engine-sdk'],
  // Explicitly pin Turbopack's root to this directory so it doesn't walk up
  // the tree and pick a parent workspace when multiple package-lock.json
  // files exist in ancestor directories.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
