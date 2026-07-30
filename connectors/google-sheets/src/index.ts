import { runSync, type SyncRunRecord } from '@lp-ai/lib-db';

export type SyncResult = SyncRunRecord;

// Template: this connector previously synced Launchpad's program-specific
// sheets (students, outcomes, attendance, etc.) — all removed. Add
// sync-<tab>.ts modules here for School Rollup data, following the
// upsert-by-sourceId + stale-cleanup pattern described in CLAUDE.md, and call
// them from this function the way the old sync-*.ts files were called.
export async function sync(): Promise<SyncResult> {
  return runSync('google-sheets', async () => {
    return { status: 'noop', recordsUpserted: 0, notes: 'School Rollup sync not yet implemented' };
  });
}
