import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/lib-db';

import { runTool, parseStr } from '../tool-helpers.js';

const NAME = 'get_finance_brief';

const DESCRIPTION =
  'Get a high-level financial overview of the organization: fund balances and recent donor gifts. Use this as a starting point for any general finance question.';

const inputSchema = {
  period: z
    .enum(['ytd', 'last_30_days', 'last_quarter'])
    .optional()
    .describe('Time period for income/expense summary. Defaults to ytd.'),
};

export function registerGetFinanceBrief(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const period = parseStr(raw, 'period') ?? 'ytd';

      const [fundBalances, recentGifts] = await Promise.all([
        prisma.financeSnapshot.findMany({
          where: { tabName: 'fund_balances' },
          orderBy: { period: 'desc' },
          take: 50,
        }),
        prisma.donorGift.findMany({
          orderBy: { giftDate: 'desc' },
          take: 10,
          include: { donorContact: true },
        }),
      ]);

      return {
        period,
        fund_balances: fundBalances.map((f) => ({
          source_id: f.sourceId,
          period: f.period,
          row_data: f.rowData,
        })),
        recent_gifts: recentGifts.map((g) => ({
          amount: g.amount,
          gift_date: g.giftDate,
          campaign_name: g.campaignName,
          fund: g.fund,
          donor:
            g.donorContact?.organizationName ??
            ([g.donorContact?.firstName, g.donorContact?.lastName]
              .filter(Boolean)
              .join(' ') ||
              null),
        })),
        sources_active: ['google_sheets'],
        sources_deferred: ['aplos', 'givebutter'],
      };
    }),
  );
}
