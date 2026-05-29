import { runSync, type SyncRunRecord } from '@lp-ai/lib-db';
import { syncAccounts } from './sync-accounts.js';
import { syncFunds } from './sync-funds.js';
import { syncTransactions } from './sync-transactions.js';

export type SyncResult = SyncRunRecord;

async function safeRun(label: string, fn: () => Promise<number>): Promise<number> {
  try {
    const n = await fn();
    console.log(`aplos: ${label} — ${n} rows`);
    return n;
  } catch (err) {
    console.error(`aplos: ${label} FAILED —`, err instanceof Error ? err.message : String(err));
    return 0;
  }
}

export async function sync(): Promise<SyncResult> {
  return runSync('aplos', async () => {
    const accounts = await safeRun('accounts', syncAccounts);
    const funds = await safeRun('funds', syncFunds);
    const transactions = await safeRun('transactions', syncTransactions);
    const total = accounts + funds + transactions;
    return {
      status: 'ok',
      recordsUpserted: total,
      notes: `accounts: ${accounts}; funds: ${funds}; transactions: ${transactions}`,
    };
  });
}

export { syncAccounts } from './sync-accounts.js';
export { syncFunds } from './sync-funds.js';
export { syncTransactions } from './sync-transactions.js';
