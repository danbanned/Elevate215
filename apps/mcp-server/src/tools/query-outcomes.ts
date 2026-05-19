import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma, resolveEntity } from '@lp-ai/db';

import { runTool } from '../tool-helpers.js';
import { toolError } from '../errors.js';

const NAME = 'query_outcomes';

const DESCRIPTION =
  'Look up Beacon Learning Management System outcomes and competency assessments for a student. Returns competency levels and scores. Use this tool when asked about student progress, competency development, or academic outcomes.';

const inputSchema = {
  student_name: z
    .string()
    .optional()
    .describe('Name, nickname, or ID of the student.'),
  competency: z
    .string()
    .optional()
    .describe('Optional: filter to a specific competency name (partial match supported).'),
  term: z
    .string()
    .optional()
    .describe('Optional: filter to a specific term (e.g. "Spring 2024").'),
};

export function registerQueryOutcomes(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as {
        student_name?: unknown;
        competency?: unknown;
        term?: unknown;
      };
      const studentName =
        typeof raw.student_name === 'string' ? raw.student_name : '';
      const competency =
        typeof raw.competency === 'string' ? raw.competency : undefined;
      const term = typeof raw.term === 'string' ? raw.term : undefined;

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

      const rows = await prisma.studentCompetency.findMany({
        where: {
          studentId: resolved.student.id,
          ...(competency
            ? { competencyArea: { contains: competency, mode: 'insensitive' } }
            : {}),
          ...(term ? { term } : {}),
        },
        orderBy: [{ assessedDate: 'desc' }, { competencyArea: 'asc' }],
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
        },
        outcomes: rows.map((r) => ({
          competency: r.competencyArea,
          skill: r.skillName,
          level: r.rubricLevel,
          score: r.score,
          assessed_at: r.assessedDate,
          term: r.term,
        })),
        entity_resolved: true,
        entity_confidence: resolved.confidence,
      };
    }),
  );
}
