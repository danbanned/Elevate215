import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/db';
import type { Prisma } from '@lp-ai/db';

import { runTool } from '../tool-helpers.js';

const NAME = 'query_finances';

const DESCRIPTION =
  'Look up financial data from finance_snapshots. Each query_type maps to one or more sheet tabs. Returns the raw rowData JSON so the caller can read whichever columns matter for the question.';

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
  tab_name: z.string().optional().describe('Override tab_name match (advanced).'),
  period: z.string().optional(),
  contains: z.string().optional().describe('Substring match against the JSON-serialized rowData.'),
  limit: z.number().optional(),
};

const QUERY_TYPE_TO_TAB: Record<string, string> = {
  prior_month: 'Prior Month Budget vs Actual',
  ytd: 'YTD Budget vs Actual',
  forecast: 'Rolling Forecast',
  monthly: 'Monthly',
  fund_balances: 'fund_balances',
  annual: 'Annual',
  phase_budget_dashboard: 'phase_dashboard:2025 Actuals',
  phase_budget_monthly_liftoff: 'phase_dashboard:Monthly LiftOff Only',
  phase_budget_monthly_hs: 'phase_dashboard:Monthly HS Only',
  q3_2026_actuals_global_pct: 'q3_2026_actuals:global %',
  q3_2026_actuals_hc_pct: 'q3_2026_actuals:Human capital %',
  q3_2026_actuals: 'q3_2026_actuals:actuals by phase',
  phase_actuals_2025_global_pct: 'phase_actuals_2025:global %',
  phase_actuals_2025_hc_pct: 'phase_actuals_2025:Human capital %',
  phase_actuals_2025_actuals: 'phase_actuals_2025:actuals by phase',
  rapid_dashboard: 'rapid:Dashboard',
  pex_dashboard: 'pex:Dashboard',
  dev_giving_history: 'development:Giving History',
  dev_prospect_pipeline: 'development:Prospect Pipeline',
  dev_denied: 'development:Denied',
  dev_launchpad_pipeline: 'development:Launchpad Pipeline',
  dev_grants_tracker: 'development:Grants Tracker',
  dev_contacts: 'development:Contacts',
};

const QUERY_TYPE_TO_TAB_PREFIX: Record<string, string> = {
  rapid_transactions: 'rapid:FY',
  pex_transactions: 'pex:FY',
};

export function registerQueryFinances(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const queryType = String(raw['query_type'] ?? '');
      const tabOverride =
        typeof raw['tab_name'] === 'string' ? (raw['tab_name'] as string) : undefined;
      const periodFilter =
        typeof raw['period'] === 'string' ? (raw['period'] as string) : undefined;
      const limit = Math.min(typeof raw['limit'] === 'number' ? (raw['limit'] as number) : 500, 1000);

      const where: Prisma.FinanceSnapshotWhereInput = {};
      const mappedTab = QUERY_TYPE_TO_TAB[queryType];
      const mappedPrefix = QUERY_TYPE_TO_TAB_PREFIX[queryType];
      if (tabOverride) {
        where.tabName = tabOverride;
      } else if (mappedTab) {
        where.tabName = mappedTab;
      } else if (mappedPrefix) {
        where.tabName = { startsWith: mappedPrefix };
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
        sources: ['google_sheets'],
      };
    }),
  );
}
