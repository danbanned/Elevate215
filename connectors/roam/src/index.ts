import { loadEnv } from '@lp-ai/lib-config';
import { runSync, type SyncRunRecord } from '@lp-ai/lib-db';

export type SyncResult = SyncRunRecord;

export async function sync(): Promise<SyncResult> {
  return runSync('roam', async () => {
    const env = await loadEnv();
    void env;
    return {
      status: 'noop',
      recordsUpserted: 0,
      notes: 'Skeleton — implementation pending (see docs/data-sources/roam-connector.md)',
    };
  });
}
