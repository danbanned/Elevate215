import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/db';
import type { Prisma } from '@lp-ai/db';

import { runTool } from '../tool-helpers.js';

const NAME = 'query_certifications';

const DESCRIPTION =
  'Certification data (PCEP, future certs) — pass/fail rates, scores, and breakdowns by cert type, LP phase, or date range.';

const inputSchema = {
  query_type: z.enum(['summary', 'by_type', 'by_phase', 'by_result', 'scores']),
  type: z.string().optional(),
  phase: z.string().optional(),
  result: z.enum(['Pass', 'Fail']).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
};

export function registerQueryCertifications(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const queryType = String(raw['query_type'] ?? '');
      const typeFilter =
        typeof raw['type'] === 'string' ? (raw['type'] as string) : undefined;
      const phaseFilter =
        typeof raw['phase'] === 'string' ? (raw['phase'] as string) : undefined;
      const resultFilter =
        typeof raw['result'] === 'string' ? (raw['result'] as string) : undefined;
      const startDate =
        typeof raw['start_date'] === 'string' ? (raw['start_date'] as string) : undefined;
      const endDate =
        typeof raw['end_date'] === 'string' ? (raw['end_date'] as string) : undefined;

      const where: Prisma.StudentCertificationWhereInput = {};
      if (typeFilter) where.type = { contains: typeFilter, mode: 'insensitive' };
      if (phaseFilter) where.phase = phaseFilter;
      if (resultFilter) where.result = resultFilter;
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = startDate;
        if (endDate) where.date.lte = endDate;
      }

      switch (queryType) {
        case 'scores': {
          const rows = await prisma.studentCertification.findMany({
            where,
            include: {
              student: { select: { canonicalName: true, studentNumber: true } },
            },
            orderBy: [{ date: 'desc' }],
            take: 500,
          });
          return {
            query_type: 'scores',
            record_count: rows.length,
            records: rows.map((r) => ({
              type: r.type,
              phase: r.phase,
              result: r.result,
              score: r.score,
              date: r.date,
              student_name: r.student.canonicalName,
              student_number: r.student.studentNumber,
            })),
          };
        }
        case 'by_type': {
          const grouped = await prisma.studentCertification.groupBy({
            by: ['type'],
            where,
            _count: { _all: true },
            _avg: { score: true },
          });
          return {
            query_type: 'by_type',
            breakdown: grouped.map((g) => ({
              type: g.type,
              count: g._count?._all ?? 0,
              avg_score: g._avg?.score ?? null,
            })),
          };
        }
        case 'by_phase': {
          const grouped = await prisma.studentCertification.groupBy({
            by: ['phase'],
            where,
            _count: { _all: true },
          });
          return {
            query_type: 'by_phase',
            breakdown: grouped.map((g) => ({
              phase: g.phase,
              count: g._count?._all ?? 0,
            })),
          };
        }
        case 'by_result': {
          const grouped = await prisma.studentCertification.groupBy({
            by: ['result'],
            where,
            _count: { _all: true },
          });
          return {
            query_type: 'by_result',
            breakdown: grouped.map((g) => ({
              result: g.result,
              count: g._count?._all ?? 0,
            })),
          };
        }
        case 'summary':
        default: {
          const total = await prisma.studentCertification.count({ where });
          const passed = await prisma.studentCertification.count({
            where: { ...where, result: 'Pass' },
          });
          return {
            query_type: 'summary',
            total,
            passed,
            failed: total - passed,
            pass_rate_pct:
              total === 0 ? null : Math.round((passed / total) * 1000) / 10,
          };
        }
      }
    }),
  );
}
