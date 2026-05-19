import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/db';
import { embedText } from '@lp-ai/embedding';

import { runTool } from '../tool-helpers.js';
import { toolError } from '../errors.js';

const NAME = 'search_documents';

const DESCRIPTION =
  'Generic pgvector semantic search across all ingested document_chunks (Drive docs, Slack, Roam, and future sources). Use when a question may have its answer in any narrative content the org has ingested, with optional source filter and similarity threshold.';

const inputSchema = {
  query: z.string().describe('Natural language search query.'),
  source: z
    .string()
    .optional()
    .describe('Optional: restrict to a single source (e.g. "drive", "slack", "roam").'),
  top_k: z.number().int().optional(),
  min_similarity: z.number().optional(),
};

interface SearchRow {
  id: string;
  source: string;
  source_id: string;
  title: string | null;
  content: string;
  metadata: unknown;
  similarity: number;
}

export async function searchDocuments(params: {
  query: string;
  source?: string;
  topK?: number;
  minSimilarity?: number;
}): Promise<SearchRow[]> {
  const topK = Math.min(params.topK ?? 8, 20);
  const minSim = params.minSimilarity ?? 0.7;
  const embedding = await embedText(params.query);
  const embeddingLiteral = `[${embedding.join(',')}]`;

  if (params.source) {
    return prisma.$queryRaw<SearchRow[]>`
      SELECT id, source, source_id, title, content, metadata,
             1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity
      FROM document_chunks
      WHERE embedding IS NOT NULL
        AND source = ${params.source}
        AND 1 - (embedding <=> ${embeddingLiteral}::vector) >= ${minSim}
      ORDER BY embedding <=> ${embeddingLiteral}::vector
      LIMIT ${topK}
    `;
  }
  return prisma.$queryRaw<SearchRow[]>`
    SELECT id, source, source_id, title, content, metadata,
           1 - (embedding <=> ${embeddingLiteral}::vector) AS similarity
    FROM document_chunks
    WHERE embedding IS NOT NULL
      AND 1 - (embedding <=> ${embeddingLiteral}::vector) >= ${minSim}
    ORDER BY embedding <=> ${embeddingLiteral}::vector
    LIMIT ${topK}
  `;
}

export function registerSearchDocuments(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const query = typeof raw['query'] === 'string' ? raw['query'] : '';
      if (!query.trim()) {
        return toolError('search_failed', 'query is required.');
      }
      const source = typeof raw['source'] === 'string' ? raw['source'] : undefined;
      const topK = typeof raw['top_k'] === 'number' ? raw['top_k'] : undefined;
      const minSimilarity =
        typeof raw['min_similarity'] === 'number' ? raw['min_similarity'] : undefined;

      const rows = await searchDocuments({
        query,
        ...(source ? { source } : {}),
        ...(topK !== undefined ? { topK } : {}),
        ...(minSimilarity !== undefined ? { minSimilarity } : {}),
      });
      return {
        query,
        result_count: rows.length,
        results: rows.map((r) => ({
          id: r.id,
          source: r.source,
          source_id: r.source_id,
          title: r.title,
          content: r.content,
          metadata: r.metadata,
          similarity: r.similarity,
        })),
      };
    }),
  );
}
