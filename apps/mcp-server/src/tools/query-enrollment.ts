import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/db';
import type { Prisma } from '@lp-ai/db';

import { runTool } from '../tool-helpers.js';

const NAME = 'query_enrollment';

const DESCRIPTION =
  'Aggregate student enrollment data. Supports total headcount, phase status breakdowns, date-range active queries, cohort breakdowns, and per-student rows.';

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
  phase: z.enum(['Foundations', '101', 'Lightspeed', 'LiftOff']).optional(),
  status: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  current_phase: z.string().optional(),
  enrollment_status: z.string().optional(),
  cohort: z.string().optional(),
  limit: z.number().optional(),
};

const PHASE_FIELDS = {
  Foundations: { status: 'foundationsStatus', start: 'foundationsStartDate', end: 'foundationsEndDate' },
  '101': { status: 'phase101Status', start: 'phase101StartDate', end: 'phase101EndDate' },
  Lightspeed: { status: 'lightspeedStatus', start: 'lightspeedStartDate', end: 'lightspeedEndDate' },
  LiftOff: { status: 'liftoffStatus', start: 'liftoffStartDate', end: 'liftoffEndDate' },
} as const;

type PhaseName = keyof typeof PHASE_FIELDS;

export function registerQueryEnrollment(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const queryType = String(raw['query_type'] ?? 'total');
      const phaseFilter =
        typeof raw['phase'] === 'string' ? (raw['phase'] as PhaseName) : undefined;
      const statusFilter =
        typeof raw['status'] === 'string' ? (raw['status'] as string) : undefined;
      const currentPhase =
        typeof raw['current_phase'] === 'string' ? (raw['current_phase'] as string) : undefined;
      const enrollmentStatus =
        typeof raw['enrollment_status'] === 'string' ? (raw['enrollment_status'] as string) : undefined;
      const cohort = typeof raw['cohort'] === 'string' ? (raw['cohort'] as string) : undefined;
      const startDate = typeof raw['start_date'] === 'string' ? (raw['start_date'] as string) : undefined;
      const endDate = typeof raw['end_date'] === 'string' ? (raw['end_date'] as string) : undefined;
      const limit = typeof raw['limit'] === 'number' ? Math.min(raw['limit'] as number, 1000) : 500;

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
          const phases = phaseFilter ? [phaseFilter] : (Object.keys(PHASE_FIELDS) as PhaseName[]);
          const breakdown: Array<{ phase: string; status: string | null; count: number }> = [];
          for (const p of phases) {
            const f = PHASE_FIELDS[p];
            const where: Prisma.StudentPhaseOutcomeWhereInput = {
              [f.status]: statusFilter ? statusFilter : { not: null },
            } as Prisma.StudentPhaseOutcomeWhereInput;
            const rows = await prisma.studentPhaseOutcome.findMany({ where, select: { [f.status]: true } as Prisma.StudentPhaseOutcomeSelect });
            const counts = new Map<string | null, number>();
            for (const r of rows) {
              const s = (r as unknown as Record<string, string | null>)[f.status] ?? null;
              counts.set(s, (counts.get(s) ?? 0) + 1);
            }
            for (const [status, count] of counts) {
              breakdown.push({ phase: p, status, count });
            }
          }
          return { query_type: 'by_phase', breakdown };
        }
        case 'active_during': {
          if (!phaseFilter) {
            return {
              query_type: 'active_during',
              error: 'phase is required for active_during',
            };
          }
          const f = PHASE_FIELDS[phaseFilter];
          const where: Prisma.StudentPhaseOutcomeWhereInput = {};
          if (endDate) (where as Record<string, unknown>)[f.start] = { lte: new Date(endDate) };
          if (startDate) (where as Record<string, unknown>)[f.end] = { gte: new Date(startDate) };
          const rows = await prisma.studentPhaseOutcome.findMany({
            where,
            include: { student: { select: { canonicalName: true, studentNumber: true } } },
            take: limit,
          });
          return {
            query_type: 'active_during',
            phase: phaseFilter,
            student_count: rows.length,
            students: rows.map((r) => ({
              student_number: r.student.studentNumber,
              canonical_name: r.student.canonicalName,
              start_date: (r as unknown as Record<string, Date | null>)[f.start],
              end_date: (r as unknown as Record<string, Date | null>)[f.end],
              status: (r as unknown as Record<string, string | null>)[f.status],
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
              count: g._count?._all ?? 0,
            })),
          };
        }
        case 'by_school': {
          const grouped = await prisma.student.groupBy({
            by: ['schoolName'],
            where: studentWhere,
            _count: { _all: true },
          });
          return {
            query_type: 'by_school',
            breakdown: grouped.map((g) => ({
              school: g.schoolName,
              count: g._count?._all ?? 0,
            })),
          };
        }
        case 'by_race': {
          const grouped = await prisma.student.groupBy({
            by: ['raceEthnicity'],
            where: studentWhere,
            _count: { _all: true },
          });
          return {
            query_type: 'by_race',
            breakdown: grouped.map((g) => ({
              race_ethnicity: g.raceEthnicity,
              count: g._count?._all ?? 0,
            })),
          };
        }
        case 'by_program_year': {
          const grouped = await prisma.student.groupBy({
            by: ['hsGraduationYear'],
            where: studentWhere,
            _count: { _all: true },
          });
          return {
            query_type: 'by_program_year',
            breakdown: grouped.map((g) => ({
              hs_graduation_year: g.hsGraduationYear,
              count: g._count?._all ?? 0,
            })),
          };
        }
        case 'by_student': {
          const rows = await prisma.student.findMany({
            where: studentWhere,
            include: { phaseOutcomes: true },
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
              phase_outcomes: s.phaseOutcomes.flatMap((po) => unpackPhases(po)),
            })),
          };
        }
        default: {
          return { query_type: queryType, note: 'Unsupported query_type' };
        }
      }
    }),
  );
}

function unpackPhases(po: {
  foundationsStatus: string | null;
  foundationsStartDate: Date | null;
  foundationsEndDate: Date | null;
  phase101Status: string | null;
  phase101StartDate: Date | null;
  phase101EndDate: Date | null;
  lightspeedStatus: string | null;
  lightspeedStartDate: Date | null;
  lightspeedEndDate: Date | null;
  liftoffStatus: string | null;
  liftoffStartDate: Date | null;
  liftoffEndDate: Date | null;
}): Array<{ phase: string; status: string | null; start_date: Date | null; end_date: Date | null }> {
  return [
    { phase: 'Foundations', status: po.foundationsStatus, start_date: po.foundationsStartDate, end_date: po.foundationsEndDate },
    { phase: '101', status: po.phase101Status, start_date: po.phase101StartDate, end_date: po.phase101EndDate },
    { phase: 'Lightspeed', status: po.lightspeedStatus, start_date: po.lightspeedStartDate, end_date: po.lightspeedEndDate },
    { phase: 'LiftOff', status: po.liftoffStatus, start_date: po.liftoffStartDate, end_date: po.liftoffEndDate },
  ].filter((p) => p.status !== null || p.start_date !== null);
}
