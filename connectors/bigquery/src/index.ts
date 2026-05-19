import { loadEnv } from '@lp-ai/config';
import { runSync, type SyncRunRecord } from '@lp-ai/db';

export type SyncResult = SyncRunRecord;

export async function sync(): Promise<SyncResult> {
  return runSync('bigquery', async () => {
    const env = await loadEnv();
    void env;
    return {
      status: 'noop',
      recordsUpserted: 0,
      notes: 'Skeleton — implementation pending (see docs/data-sources/bigquery-connector.md)',
    };
  });
}
