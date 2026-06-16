import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/lib-db';
import type { Prisma } from '@lp-ai/lib-db';

import { runTool, parseStr } from '../tool-helpers.js';

const NAME = 'query_competency';

const DESCRIPTION =
  'Per-student competency analytics (baseline, performance level, growth, progress, ER counts) or the rubric structure stored as finance_snapshots row data.';

const inputSchema = {
  query_type: z.enum(['scores', 'rubric']),
  student_number: z.string().optional(),
  competency: z.string().optional().describe('Partial match.'),
};

export function registerQueryCompetency(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const queryType = parseStr(raw, 'query_type') ?? 'scores';
      const studentNumber = parseStr(raw, 'student_number');
      const competency = parseStr(raw, 'competency');

      if (queryType === 'rubric') {
        const rubric = await prisma.financeSnapshot.findMany({
          where: { tabName: 'student_competency:rubric' },
          take: 1000,
        });
        return {
          query_type: 'rubric',
          record_count: rubric.length,
          records: rubric.map((r) => ({ source_id: r.sourceId, row_data: r.rowData })),
        };
      }

      const where: Prisma.StudentCompetencyWhereInput = {};
      if (studentNumber) where.studentNumber = studentNumber;
      if (competency)
        where.competency = { contains: competency, mode: 'insensitive' };

      const rows = await prisma.studentCompetency.findMany({
        where,
        take: 1000,
      });

      const studentMap = await loadStudentNames(rows.map((r) => r.studentNumber));

      return {
        query_type: 'scores',
        record_count: rows.length,
        records: rows.map((r) => ({
          student_number: r.studentNumber,
          student_name: studentMap.get(r.studentNumber) ?? null,
          competency: r.competency,
          portfolio: r.portfolio,
          baseline: r.baseline,
          performance_level: r.performanceLevel,
          growth: r.growth,
          progress: r.progress,
          total_er: r.totalEr,
          completed_er: r.completedEr,
          missed_er: r.missedEr,
          total_opportunities: r.totalOpportunities,
        })),
      };
    }),
  );
}

async function loadStudentNames(numbers: string[]): Promise<Map<string, string>> {
  if (numbers.length === 0) return new Map();
  const uniq = [...new Set(numbers)];
  const students = await prisma.student.findMany({
    where: { studentNumber: { in: uniq } },
    select: { studentNumber: true, canonicalName: true },
  });
  const map = new Map<string, string>();
  for (const s of students) {
    if (s.studentNumber) map.set(s.studentNumber, s.canonicalName);
  }
  return map;
}
