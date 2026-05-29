import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(here, '..', '..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@lp-ai/lib-db', '@prisma/adapter-pg', 'pg'],
  experimental: {
    outputFileTracingRoot: monorepoRoot,
  },
  reactStrictMode: true,
};

export default nextConfig;
