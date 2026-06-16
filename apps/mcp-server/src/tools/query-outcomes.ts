import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma, resolveEntity } from '@lp-ai/lib-db';

import { runTool, parseStr } from '../tool-helpers.js';
import { toolError } from '../errors.js';

const NAME = 'query_outcomes';

const DESCRIPTION =
  'Look up competency outcomes for a student (baseline, performance level, growth, progress, ER counts). Use this when asked about a student\'s competency development.';

const inputSchema = {
  student_name: z
    .string()
    .optional()
    .describe('Name, nickname, or ID of the student.'),
  competency: z
    .string()
    .optional()
    .describe('Optional: filter to a specific competency name (partial match).'),
};

export function registerQueryOutcomes(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const studentName = parseStr(raw, 'student_name') ?? '';
      const competency = parseStr(raw, 'competency');

      if (!studentName.trim()) {
        return toolError(
          'entity_not_found',
          'student_name is required for query_outcomes.',
        );
      }

      const resolved = await resolveEntity(studentName, { entityType: 'student' });
      if (!resolved?.student) {
        return toolError(
          'entity_not_found',
          `Could not resolve '${studentName}' to a known student.`,
        );
      }

      const sn = resolved.student.studentNumber;
      if (!sn) {
        return toolError(
          'no_records',
          `Student '${resolved.student.canonicalName}' has no student_number to join on.`,
        );
      }

      const rows = await prisma.studentCompetency.findMany({
        where: {
          studentNumber: sn,
          ...(competency
            ? { competency: { contains: competency, mode: 'insensitive' } }
            : {}),
        },
        orderBy: [{ competency: 'asc' }],
      });

      if (rows.length === 0) {
        return toolError(
          'no_records',
          `No competency outcomes recorded for ${resolved.student.canonicalName}.`,
        );
      }

      return {
        student: {
          id: resolved.student.id,
          canonical_name: resolved.student.canonicalName,
          student_number: sn,
        },
        outcomes: rows.map((r) => ({
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
        entity_resolved: true,
        entity_confidence: resolved.confidence,
      };
    }),
  );
}
