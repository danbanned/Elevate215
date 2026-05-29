import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './client.js';
import {
  getAliases,
  linkAlias,
  recordPendingAlias,
  resolveEntity,
} from './entity-resolution.js';

const isLocalDb = (process.env['DATABASE_URL'] ?? '').includes('localhost');
const describeLocal = isLocalDb ? describe : describe.skip;

describeLocal('entity resolution (live local Postgres)', () => {
  beforeAll(async () => {
    await prisma.$queryRaw`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  });

  beforeEach(async () => {
    await prisma.entityAlias.deleteMany({});
    await prisma.pendingAlias.deleteMany({});
    await prisma.studentEmployment.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.staff.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedMaria(): Promise<string> {
    const maria = await prisma.student.create({
      data: { canonicalName: 'Maria Garcia', studentNumber: 'LP1042' },
    });
    await linkAlias({
      alias: 'Maria Garcia',
      entityType: 'student',
      entityId: maria.id,
      source: 'drive',
    });
    await linkAlias({
      alias: '@maria.g',
      entityType: 'student',
      entityId: maria.id,
      source: 'slack',
    });
    await linkAlias({
      alias: 'LP1042',
      entityType: 'student',
      entityId: maria.id,
      source: 'bigquery',
    });
    return maria.id;
  }

  it('exact match returns confidence 1.0', async () => {
    const id = await seedMaria();
    const resolved = await resolveEntity('@maria.g');
    expect(resolved?.matchType).toBe('exact');
    expect(resolved?.confidence).toBe(1.0);
    expect(resolved?.student?.id).toBe(id);
  });

  it('fuzzy match handles minor typos at the configured threshold', async () => {
    await seedMaria();
    const resolved = await resolveEntity('Maria Garca', {
      entityType: 'student',
      minFuzzyConfidence: 0.7,
    });
    expect(resolved).not.toBeNull();
    expect(resolved?.matchType).toBe('fuzzy');
    expect(resolved?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(resolved?.student?.canonicalName).toBe('Maria Garcia');
  });

  it('rejects typos below default 0.85 threshold', async () => {
    await seedMaria();
    const resolved = await resolveEntity('Maria Garca', { entityType: 'student' });
    expect(resolved).toBeNull();
  });

  it('returns null for unrelated strings', async () => {
    await seedMaria();
    const resolved = await resolveEntity('Xyzabc Foobar');
    expect(resolved).toBeNull();
  });

  it('refuses ambiguous fuzzy matches within the configured margin', async () => {
    const a = await prisma.student.create({ data: { canonicalName: 'Maria Garcia' } });
    const b = await prisma.student.create({ data: { canonicalName: 'Mario Garcia' } });
    await linkAlias({ alias: 'Maria Garcia', entityType: 'student', entityId: a.id });
    await linkAlias({ alias: 'Mario Garcia', entityType: 'student', entityId: b.id });

    const resolved = await resolveEntity('Marii Garcia', { entityType: 'student' });
    expect(resolved).toBeNull();
  });

  it('getAliases returns all aliases for an entity', async () => {
    const id = await seedMaria();
    const aliases = await getAliases(id);
    const aliasStrings = aliases.map((a) => a.alias).sort();
    expect(aliasStrings).toEqual(['@maria.g', 'LP1042', 'Maria Garcia']);
  });

  it('recordPendingAlias persists for manual review', async () => {
    await recordPendingAlias({
      alias: 'unknown person',
      entityType: 'student',
      source: 'slack',
      context: 'mentioned in #general',
    });
    const rows = await prisma.pendingAlias.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.alias).toBe('unknown person');
  });
});
