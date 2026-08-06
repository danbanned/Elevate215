import { runSync, prisma, type SyncRunRecord } from '@lp-ai/lib-db';

import { syncCompanyInfo } from './sync-company-info.js';
import { syncProfitAndLoss, syncProfitAndLossByYear } from './sync-profit-and-loss.js';

export type SyncResult = SyncRunRecord;

// Mirrors aplos/src/index.ts's safeRun — one realm's Company Info failure
// shouldn't block another realm's (or that realm's Profit & Loss) sync.
async function safeRun(label: string, fn: () => Promise<number>): Promise<number> {
  try {
    const n = await fn();
    console.log(`quickbooks: ${label} — ${n} rows`);
    return n;
  } catch (err) {
    console.error(`quickbooks: ${label} FAILED —`, err instanceof Error ? err.message : String(err));
    return 0;
  }
}

// Phase 2: pulls Company Info (smoke test) and the Profit & Loss report for
// every realm with a saved credential, upserting both into finance_snapshots
// following the same tabName/sourceId/rowData JSON-sink pattern Aplos uses
// (see connectors/aplos/src/sync-funds.ts). Multiple realms can be connected
// (each OAuth connect flow saves its own ConnectorCredential row keyed by
// realmId), so this loops over all of them rather than assuming exactly one.
export async function sync(): Promise<SyncResult> {
  return runSync(
    'quickbooks',
    async () => {
      const credentials = await prisma.connectorCredential.findMany({ where: { connector: 'quickbooks' } });
      if (credentials.length === 0) {
        return {
          status: 'noop',
          recordsUpserted: 0,
          notes: 'No QuickBooks credential connected yet — run the OAuth connect flow first.',
        };
      }

      let total = 0;
      const notes: string[] = [];
      for (const credential of credentials) {
        const realmId = credential.externalAccountId;
        const companyInfoCount = await safeRun(`company_info:${realmId}`, () => syncCompanyInfo(realmId));
        const profitAndLossCount = await safeRun(`profit_and_loss:${realmId}`, () => syncProfitAndLoss(realmId));
        const profitAndLossByYearCount = await safeRun(`profit_and_loss_by_year:${realmId}`, () =>
          syncProfitAndLossByYear(realmId),
        );
        total += companyInfoCount + profitAndLossCount + profitAndLossByYearCount;
        notes.push(
          `${realmId}: company_info=${companyInfoCount}, profit_and_loss=${profitAndLossCount}, profit_and_loss_by_year=${profitAndLossByYearCount}`,
        );
      }

      return { status: total > 0 ? 'ok' : 'error', recordsUpserted: total, notes: notes.join('; ') };
    },
    { tables: ['finance_snapshots'] },
  );
}

export {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  saveQuickBooksCredentials,
  getQuickBooksAccessToken,
  quickBooksRequest,
} from './quickbooks-client.js';
export type { SaveQuickBooksCredentialsInput, QuickBooksRequestOptions } from './quickbooks-client.js';
export {
  QuickBooksNotConnectedError,
  QuickBooksReauthRequiredError,
  QuickBooksApiError,
  QuickBooksValidationError,
  QuickBooksTransientError,
  classifyQuickBooksApiError,
  isQuickBooksError,
} from './errors.js';
export type { QuickBooksError, QuickBooksErrorContext, QuickBooksApiErrorDetail } from './errors.js';
export { logQuickBooksError } from './quickbooks-error-logging.js';
export type { QuickBooksErrorLogEntry, QuickBooksErrorLogSink } from './quickbooks-error-logging.js';
export { fetchCompanyInfo, fetchProfitAndLoss } from './quickbooks-accounting-client.js';
export type { ProfitAndLossOptions } from './quickbooks-accounting-client.js';
export { syncCompanyInfo } from './sync-company-info.js';
export { syncProfitAndLoss, syncProfitAndLossByYear } from './sync-profit-and-loss.js';
