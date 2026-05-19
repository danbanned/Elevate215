import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma, resolveEntity, getAliases } from '@lp-ai/db';
import { embedText } from '@lp-ai/embedding';

import { runTool } from '../tool-helpers.js';
import { toolError } from '../errors.js';

const NAME = 'search_by_person';

const DESCRIPTION =
  "Search all conversations (Slack and meeting transcripts) for content about or involving a specific person. Resolves the person's identity across sources before searching. Use this tool when you want to find everything that's been said about a particular student or staff member.";

const inputSchema = {
  person_name: z
    .string()
    .describe('Name, nickname, or handle of the student or staff member.'),
  query: z
    .string()
    .optional()
    .describe('Optional: narrow the search with a semantic query within results for this person.'),
  top_k: z.number().int().optional(),
};

const MIN_SIMILARITY = 0.7;

interface Row {
  id: string;
  source: string;
  source_id: string;
  title: string | null;
  content: string;
  metadata: unknown;
  similarity: number;
}

export function registerSearchByPerson(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const personName =
        typeof raw['person_name'] === 'string' ? raw['person_name'] : '';
      if (!personName.trim()) {
        return toolError(
          'entity_not_found',
          'person_name is required.',
        );
      }
      const query = typeof raw['query'] === 'string' ? raw['query'] : undefined;
      const topK = Math.min(
        typeof raw['top_k'] === 'number' ? (raw['top_k'] as number) : 10,
        20,
      );

      const resolved = await resolveEntity(personName);
      if (!resolved) {
        return toolError(
          'entity_not_found',
          `Could not resolve '${personName}' to a known person.`,
        );
      }

      const entityId = resolved.student?.id ?? resolved.staff?.id ?? null;
      if (!entityId) {
        return toolError('entity_not_found', 'Resolved entity has no id.');
      }

      const aliases = await getAliases(entityId);
      const aliasStrings = aliases.map((a) => a.alias.toLowerCase());

      const effectiveQuery = query?.trim() ?? personName;
      const embedding = await embedText(effectiveQuery);
      const embeddingLiteral = `[${embedding.join(',')}]`;

      const candidateLimit = topK * 5;
      const rows = await prisma.$queryRaw<Row[]>`
        SELECT id, source, source_id, title, content, metadata,
               1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity
        FROM document_chunks
        WHERE embedding IS NOT NULL
          AND 1 - (embedding <=> ${embeddingLiteral}::vector) >= ${MIN_SIMILARITY}
        ORDER BY embedding <=> ${embeddingLiteral}::vector
        LIMIT ${candidateLimit}
      `;

      const filtered = rows.filter((r) => {
        const text = r.content.toLowerCase();
        return aliasStrings.some((a) => text.includes(a));
      });

      return {
        entity: {
          id: entityId,
          canonical_name:
            resolved.student?.canonicalName ?? resolved.staff?.canonicalName ?? null,
          entity_type: resolved.entityType,
        },
        entity_resolved: true,
        results: filtered.slice(0, topK).map((r) => ({
          source: r.source,
          source_id: r.source_id,
          title: r.title,
          content: r.content,
          metadata: r.metadata,
          score: r.similarity,
        })),
      };
    }),
  );
}
