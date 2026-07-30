import { runSync, type SyncRunRecord } from '@lp-ai/lib-db';

export type SyncResult = SyncRunRecord;

// Phase 1 built the OAuth connect/callback flow and the token-refresh helper
// (see quickbooks-client.ts). Actual QuickBooks accounting-data sync is not
// yet implemented — add sync-<entity>.ts modules here in a later phase,
// following the upsert-by-sourceId + stale-cleanup pattern in CLAUDE.md, and
// call getQuickBooksAccessToken(realmId) from quickbooks-client.ts to
// authenticate each request.
export async function sync(): Promise<SyncResult> {
  return runSync('quickbooks', async () => {
    return {
      status: 'noop',
      recordsUpserted: 0,
      notes: 'QuickBooks data sync not yet implemented — Phase 1 built OAuth connect + token refresh only',
    };
  });
}

export {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  saveQuickBooksCredentials,
  getQuickBooksAccessToken,
} from './quickbooks-client.js';
export type { SaveQuickBooksCredentialsInput } from './quickbooks-client.js';
export { QuickBooksNotConnectedError, QuickBooksReauthRequiredError } from './errors.js';
