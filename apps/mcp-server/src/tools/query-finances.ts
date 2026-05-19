import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/db';
import type { Prisma } from '@lp-ai/db';

import { runTool } from '../tool-helpers.js';

const NAME = 'query_finances';

const DESCRIPTION =
  'Look up financial data — budgets, actuals, forecasts, fund balances, stipend transactions, and Building21 fundraising/development records. Use for spending, budget vs. actual variances, phase cost allocations, Rapid/PEX payment history, year-over-year trends, donor gifts, prospect pipeline, and grant lifecycle. Development CRM types (dev_*) cover all B21 fundraising; pass launchpad_only=false to see non-Launchpad data.';

const inputSchema = {
  query_type: z.enum([
    'prior_month',
    'ytd',
    'forecast',
    'monthly',
    'fund_balances',
    'annual',
    'budget_actuals',
    'phase_budget_dashboard',
    'phase_budget_monthly_liftoff',
    'phase_budget_monthly_hs',
    'q3_2026_actuals_global_pct',
    'q3_2026_actuals_hc_pct',
    'q3_2026_actuals',
    'phase_actuals_2025_global_pct',
    'phase_actuals_2025_hc_pct',
    'phase_actuals_2025_actuals',
    'rapid_dashboard',
    'rapid_transactions',
    'pex_dashboard',
    'pex_transactions',
    'dev_giving_history',
    'dev_prospect_pipeline',
    'dev_denied',
    'dev_launchpad_pipeline',
    'dev_grants_tracker',
    'dev_contacts',
  ]),
  fund: z.string().optional(),
  category: z.string().optional(),
  row_type: z.enum(['detail', 'summary', 'all']).optional(),
  launchpad_only: z.boolean().optional(),
  donor: z.string().optional(),
};

const QUERY_TYPE_TO_TAB: Record<string, string> = {
  prior_month: 'prior_month',
  ytd: 'ytd',
  forecast: 'forecast',
  monthly: 'monthly',
  fund_balances: 'fund_balances',
  annual: 'annual',
};

export function registerQueryFinances(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const queryType = String(raw['query_type'] ?? '');
      const fundFilter =
        typeof raw['fund'] === 'string' ? (raw['fund'] as string) : undefined;
      const categoryFilter =
        typeof raw['category'] === 'string' ? (raw['category'] as string) : undefined;

      const tab = QUERY_TYPE_TO_TAB[queryType] ?? queryType;
      const where: Prisma.FinanceSnapshotWhereInput = { tab };
      if (fundFilter) {
        where.fundOrPhase = { contains: fundFilter, mode: 'insensitive' };
      }
      if (categoryFilter) {
        where.category = { contains: categoryFilter, mode: 'insensitive' };
      }

      const rows = await prisma.financeSnapshot.findMany({
        where,
        orderBy: [{ period: 'desc' }, { category: 'asc' }],
        take: 1000,
      });

      return {
        query_type: queryType,
        tabs_queried: [tab],
        record_count: rows.length,
        records: rows.map((r) => ({
          category: r.category,
          subcategory: r.subcategory,
          amount: r.amount,
          period: r.period,
          fund_or_phase: r.fundOrPhase,
          source: r.source,
          row_data: r.rowData,
        })),
        sources: ['google_sheets'],
      };
    }),
  );
}
