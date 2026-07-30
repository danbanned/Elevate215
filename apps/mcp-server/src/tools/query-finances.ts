import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/lib-db';
import type { Prisma } from '@lp-ai/lib-db';

import { runTool, parseStr, parseNum } from '../tool-helpers.js';

const NAME = 'query_finances';

const DESCRIPTION =
  'Look up financial data from finance_snapshots (Aplos accounting). Each query_type maps to a data source tab. Returns the raw rowData JSON so the caller can read whichever columns matter for the question.';

const inputSchema = {
  query_type: z.enum([
    'aplos_accounts',
    'aplos_funds',
    'aplos_transactions',
  ]),
  tab_name: z.string().optional().describe('Override tab_name match (advanced).'),
  period: z.string().optional(),
  contains: z.string().optional().describe('Substring match against the JSON-serialized rowData.'),
  limit: z.number().optional(),
};

// TODO: extend with QuickBooks / School Rollup tab conventions once those
// connectors are rebuilt (see CLAUDE.md connector pattern).
const QUERY_TYPE_TO_TAB: Record<string, string> = {
  aplos_accounts: 'aplos:accounts',
  aplos_funds: 'aplos:funds',
  aplos_transactions: 'aplos:transactions',
};

export function registerQueryFinances(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const queryType = parseStr(raw, 'query_type') ?? '';
      const tabOverride = parseStr(raw, 'tab_name');
      const periodFilter = parseStr(raw, 'period');
      const limit = Math.min(parseNum(raw, 'limit') ?? 500, 1000);

      const where: Prisma.FinanceSnapshotWhereInput = {};
      const mappedTab = QUERY_TYPE_TO_TAB[queryType];
      if (tabOverride) {
        where.tabName = tabOverride;
      } else if (mappedTab) {
        where.tabName = mappedTab;
      } else {
        where.tabName = queryType;
      }
      if (periodFilter) where.period = periodFilter;

      const rows = await prisma.financeSnapshot.findMany({
        where,
        orderBy: [{ period: 'desc' }, { sourceId: 'asc' }],
        take: limit,
      });

      return {
        query_type: queryType,
        record_count: rows.length,
        records: rows.map((r) => ({
          source_id: r.sourceId,
          tab_name: r.tabName,
          period: r.period,
          row_data: r.rowData,
        })),
        sources: ['aplos'],
      };
    }),
  );
}
