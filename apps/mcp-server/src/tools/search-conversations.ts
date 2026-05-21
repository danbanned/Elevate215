import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/db';
import { embedText } from '@lp-ai/embedding';

import { runTool } from '../tool-helpers.js';
import { toolError } from '../errors.js';

const NAME = 'search_conversations';

const DESCRIPTION =
  'Search Slack messages and Notion meeting transcripts for content relevant to a query. Returns the most semantically similar passages. Use this tool when asked about team discussions, decisions, or anything said in Slack or meetings.';

const inputSchema = {
  query: z.string().describe('Natural language search query.'),
  sources: z
    .array(z.enum(['slack', 'notion']))
    .optional()
    .describe('Optional: limit to specific source(s). Searches both by default. Use "notion" for meeting transcripts.'),
  top_k: z
    .number()
    .int()
    .optional()
    .describe('Number of results to return. Default 8, max 20.'),
};

const MIN_SIMILARITY = 0.75;

interface Row {
  id: string;
  source: string;
  source_id: string;
  title: string | null;
  content: string;
  metadata: unknown;
  similarity: number;
}

export function registerSearchConversations(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const query = typeof raw['query'] === 'string' ? raw['query'] : '';
      if (!query.trim()) {
        return toolError('search_failed', 'query is required.');
      }
      const sourcesRaw = Array.isArray(raw['sources']) ? raw['sources'] : undefined;
      const sources = sourcesRaw?.filter(
        (s): s is string => typeof s === 'string',
      ) ?? ['slack', 'notion'];
      const topK = Math.min(
        typeof raw['top_k'] === 'number' ? (raw['top_k'] as number) : 8,
        20,
      );

      const embedding = await embedText(query);
      const embeddingLiteral = `[${embedding.join(',')}]`;

      const rows = await prisma.$queryRaw<Row[]>`
        SELECT id, source, source_id, title, content, metadata,
               1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity
        FROM document_chunks
        WHERE embedding IS NOT NULL
          AND source = ANY(${sources}::text[])
          AND 1 - (embedding <=> ${embeddingLiteral}::vector) >= ${MIN_SIMILARITY}
        ORDER BY embedding <=> ${embeddingLiteral}::vector
        LIMIT ${topK}
      `;

      return {
        query,
        results: rows.map((r) => ({
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
