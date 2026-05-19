import { prisma } from './index.js';
import type { Student, Staff, EntityAlias } from '@prisma/client';

export type EntityType = 'student' | 'staff';

export interface ResolvedEntity {
  entityType: EntityType;
  student: Student | null;
  staff: Staff | null;
  alias: EntityAlias;
  confidence: number;
  matchType: 'exact' | 'fuzzy';
}

export interface ResolveOptions {
  entityType?: EntityType;
  minFuzzyConfidence?: number;
  fuzzyMarginRequired?: number;
}

const DEFAULT_MIN_FUZZY = 0.85;
const DEFAULT_FUZZY_MARGIN = 0.05;

export async function resolveEntity(
  rawAlias: string,
  options: ResolveOptions = {},
): Promise<ResolvedEntity | null> {
  const alias = rawAlias.trim();
  if (!alias) return null;

  const exact = await prisma.entityAlias.findFirst({
    where: {
      alias,
      ...(options.entityType ? { entityType: options.entityType } : {}),
    },
    include: { student: true, staff: true },
  });

  if (exact) {
    return {
      entityType: exact.entityType as EntityType,
      student: exact.student,
      staff: exact.staff,
      alias: stripRelations(exact),
      confidence: exact.confidence,
      matchType: 'exact',
    };
  }

  const candidates = await findFuzzyMatches(alias, options);
  if (candidates.length === 0) return null;

  const [best, second] = candidates;
  if (!best) return null;
  const minConf = options.minFuzzyConfidence ?? DEFAULT_MIN_FUZZY;
  const margin = options.fuzzyMarginRequired ?? DEFAULT_FUZZY_MARGIN;
  if (best.similarity < minConf) return null;
  if (second && best.similarity - second.similarity < margin) return null;

  const full = await prisma.entityAlias.findUnique({
    where: { id: best.id },
    include: { student: true, staff: true },
  });
  if (!full) return null;

  return {
    entityType: full.entityType as EntityType,
    student: full.student,
    staff: full.staff,
    alias: stripRelations(full),
    confidence: best.similarity,
    matchType: 'fuzzy',
  };
}

export async function getAliases(entityId: string): Promise<EntityAlias[]> {
  return prisma.entityAlias.findMany({
    where: { OR: [{ studentId: entityId }, { staffId: entityId }] },
    orderBy: [{ confidence: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function linkAlias(params: {
  alias: string;
  entityType: EntityType;
  entityId: string;
  source?: string;
  confidence?: number;
}): Promise<EntityAlias> {
  const { alias, entityType, entityId, source, confidence = 1.0 } = params;
  const idField = entityType === 'student' ? 'studentId' : 'staffId';

  const updateData: Record<string, unknown> = {
    [idField]: entityId,
    confidence,
  };
  if (source !== undefined) updateData['source'] = source;

  return prisma.entityAlias.upsert({
    where: { alias_entityType: { alias, entityType } },
    create: {
      alias,
      entityType,
      [idField]: entityId,
      source: source ?? null,
      confidence,
    },
    update: updateData,
  });
}

export async function recordPendingAlias(params: {
  alias: string;
  entityType: EntityType;
  source?: string;
  context?: string;
}): Promise<void> {
  await prisma.pendingAlias.create({
    data: {
      alias: params.alias,
      entityType: params.entityType,
      source: params.source ?? null,
      context: params.context ?? null,
    },
  });
}

interface FuzzyCandidate {
  id: string;
  similarity: number;
}

async function findFuzzyMatches(
  alias: string,
  options: ResolveOptions,
): Promise<FuzzyCandidate[]> {
  const entityType = options.entityType ?? null;
  const min = (options.minFuzzyConfidence ?? DEFAULT_MIN_FUZZY) - 0.1;

  if (entityType) {
    return prisma.$queryRaw<FuzzyCandidate[]>`
      SELECT id, similarity(alias, ${alias})::float8 AS similarity
      FROM entity_aliases
      WHERE entity_type = ${entityType}
        AND similarity(alias, ${alias}) >= ${min}
      ORDER BY similarity DESC
      LIMIT 2
    `;
  }
  return prisma.$queryRaw<FuzzyCandidate[]>`
    SELECT id, similarity(alias, ${alias})::float8 AS similarity
    FROM entity_aliases
    WHERE similarity(alias, ${alias}) >= ${min}
    ORDER BY similarity DESC
    LIMIT 2
  `;
}

function stripRelations(
  row: EntityAlias & { student: Student | null; staff: Staff | null },
): EntityAlias {
  const { student: _student, staff: _staff, ...rest } = row;
  void _student;
  void _staff;
  return rest;
}
