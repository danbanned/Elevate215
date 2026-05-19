import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/db';
import type { Prisma } from '@lp-ai/db';

import { runTool } from '../tool-helpers.js';

const NAME = 'query_enrollment';

const DESCRIPTION =
  'Aggregate student enrollment data. Supports total headcount, phase breakdowns with optional status filter, date-range active queries, school / cohort / race breakdowns, per-student rows with the full demographic filter set, and per-Launchpad-cohort grad/retention rates.';

const inputSchema = {
  query_type: z.enum([
    'total',
    'by_phase',
    'active_during',
    'by_school',
    'by_cohort',
    'by_race',
    'by_student',
    'by_program_year',
  ]),
  phase: z.string().optional(),
  status: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  current_phase: z.string().optional(),
  enrollment_status: z.string().optional(),
  cohort: z.string().optional(),
  limit: z.number().optional(),
};

export function registerQueryEnrollment(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const queryType = String(raw['query_type'] ?? 'total');
      const phaseFilter =
        typeof raw['phase'] === 'string' ? (raw['phase'] as string) : undefined;
      const statusFilter =
        typeof raw['status'] === 'string' ? (raw['status'] as string) : undefined;
      const currentPhase =
        typeof raw['current_phase'] === 'string'
          ? (raw['current_phase'] as string)
          : undefined;
      const enrollmentStatus =
        typeof raw['enrollment_status'] === 'string'
          ? (raw['enrollment_status'] as string)
          : undefined;
      const cohort =
        typeof raw['cohort'] === 'string' ? (raw['cohort'] as string) : undefined;
      const startDate =
        typeof raw['start_date'] === 'string'
          ? (raw['start_date'] as string)
          : undefined;
      const endDate =
        typeof raw['end_date'] === 'string' ? (raw['end_date'] as string) : undefined;
      const limit =
        typeof raw['limit'] === 'number' ? Math.min(raw['limit'] as number, 1000) : 500;

      const studentWhere: Prisma.StudentWhereInput = {
        ...(currentPhase ? { currentPhase } : {}),
        ...(enrollmentStatus ? { enrollmentStatus } : {}),
        ...(cohort ? { cohort } : {}),
      };

      switch (queryType) {
        case 'total': {
          const count = await prisma.student.count({ where: studentWhere });
          return { query_type: 'total', student_count: count };
        }
        case 'by_phase': {
          const where: Prisma.StudentPhaseOutcomeWhereInput = {};
          if (phaseFilter) where.phase = phaseFilter;
          if (statusFilter) where.outcome = statusFilter;
          const grouped = await prisma.studentPhaseOutcome.groupBy({
            by: ['phase', 'outcome'],
            where,
            _count: { _all: true },
          });
          return {
            query_type: 'by_phase',
            breakdown: grouped.map((g) => ({
              phase: g.phase,
              outcome: g.outcome,
              count: g._count._all,
            })),
          };
        }
        case 'active_during': {
          if (!phaseFilter) {
            return {
              query_type: 'active_during',
              error: 'phase is required for active_during',
            };
          }
          const where: Prisma.StudentPhaseOutcomeWhereInput = { phase: phaseFilter };
          if (startDate) where.endDate = { gte: startDate };
          if (endDate) where.startDate = { lte: endDate };
          const rows = await prisma.studentPhaseOutcome.findMany({
            where,
            include: {
              student: { select: { canonicalName: true, studentNumber: true } },
            },
            take: limit,
          });
          return {
            query_type: 'active_during',
            phase: phaseFilter,
            student_count: rows.length,
            students: rows.map((r) => ({
              student_number: r.student.studentNumber,
              canonical_name: r.student.canonicalName,
              start_date: r.startDate,
              end_date: r.endDate,
              outcome: r.outcome,
            })),
          };
        }
        case 'by_cohort': {
          const grouped = await prisma.student.groupBy({
            by: ['cohort'],
            where: studentWhere,
            _count: { _all: true },
          });
          return {
            query_type: 'by_cohort',
            breakdown: grouped.map((g) => ({
              cohort: g.cohort,
              count: g._count._all,
            })),
          };
        }
        case 'by_student': {
          const rows = await prisma.student.findMany({
            where: studentWhere,
            include: {
              phaseOutcomes: { orderBy: { startDate: 'desc' } },
            },
            take: limit,
          });
          return {
            query_type: 'by_student',
            student_count: rows.length,
            students: rows.map((s) => ({
              id: s.id,
              student_number: s.studentNumber,
              canonical_name: s.canonicalName,
              current_phase: s.currentPhase,
              enrollment_status: s.enrollmentStatus,
              cohort: s.cohort,
              phase_outcomes: s.phaseOutcomes.map((p) => ({
                phase: p.phase,
                outcome: p.outcome,
                start_date: p.startDate,
                end_date: p.endDate,
              })),
            })),
          };
        }
        case 'by_school':
        case 'by_race':
        case 'by_program_year':
        default: {
          return {
            query_type: queryType,
            note: 'Requires student demographic fields not yet ingested. Add the column to the schema and ingest from Google Sheets to enable.',
          };
        }
      }
    }),
  );
}
