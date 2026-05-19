import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(here, '..', '..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '.prisma/client'],
  },
  reactStrictMode: true,
};

export default nextConfig;
