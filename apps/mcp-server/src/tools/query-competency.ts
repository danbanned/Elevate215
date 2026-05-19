import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/db';
import type { Prisma } from '@lp-ai/db';

import { runTool } from '../tool-helpers.js';

const NAME = 'query_competency';

const DESCRIPTION =
  'Per-student competency data (scores) or the rubric structure (skills + opportunity totals by phase and term).';

const inputSchema = {
  query_type: z.enum(['scores', 'rubric']),
  student_number: z.string().optional(),
  competency: z.string().optional().describe('Partial match.'),
};

export function registerQueryCompetency(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const queryType = String(raw['query_type'] ?? 'scores');
      const studentNumber =
        typeof raw['student_number'] === 'string'
          ? (raw['student_number'] as string)
          : undefined;
      const competency =
        typeof raw['competency'] === 'string'
          ? (raw['competency'] as string)
          : undefined;

      const where: Prisma.StudentCompetencyWhereInput = {};
      if (competency) {
        where.competencyArea = { contains: competency, mode: 'insensitive' };
      }
      if (studentNumber) {
        where.student = { studentNumber };
      }

      if (queryType === 'rubric') {
        const grouped = await prisma.studentCompetency.groupBy({
          by: ['competencyArea', 'skillName', 'term'],
          where,
          _count: { _all: true },
        });
        return {
          query_type: 'rubric',
          rubric: grouped.map((g) => ({
            competency_area: g.competencyArea,
            skill: g.skillName,
            term: g.term,
            opportunity_count: g._count._all,
          })),
        };
      }

      const rows = await prisma.studentCompetency.findMany({
        where,
        include: {
          student: { select: { canonicalName: true, studentNumber: true } },
        },
        orderBy: [{ assessedDate: 'desc' }],
        take: 1000,
      });
      return {
        query_type: 'scores',
        record_count: rows.length,
        records: rows.map((r) => ({
          student_name: r.student.canonicalName,
          student_number: r.student.studentNumber,
          competency: r.competencyArea,
          skill: r.skillName,
          score: r.score,
          rubric_level: r.rubricLevel,
          assessed_date: r.assessedDate,
          term: r.term,
        })),
      };
    }),
  );
}
