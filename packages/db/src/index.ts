import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient } from '@prisma/client';
export type { Prisma, StudentEmployment } from '@prisma/client';

export {
  resolveEntity,
  getAliases,
  linkAlias,
  recordPendingAlias,
} from './entity-resolution.js';
export type { EntityType, ResolvedEntity, ResolveOptions } from './entity-resolution.js';

export { runSync } from './sync-runs.js';
export type { SyncRunResult, SyncRunRecord } from './sync-runs.js';

export { seed } from './seed.js';
