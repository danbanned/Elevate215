import { runSync, type SyncRunRecord } from '@lp-ai/db';
import { syncMeetings } from './sync-meetings.js';

export type SyncResult = SyncRunRecord;

export async function sync(): Promise<SyncResult> {
  return runSync('notion', async () => {
    const stats = await syncMeetings();
    const notes = [
      `pages_discovered: ${stats.pages_discovered}`,
      `pages_synced: ${stats.pages_synced}`,
      `chunks_written: ${stats.chunks_written}`,
      `skipped_no_visibility: ${stats.pages_skipped_no_visibility}`,
      `skipped_archived: ${stats.pages_skipped_archived}`,
      `skipped_error: ${stats.pages_skipped_error}`,
    ].join('; ');
    console.log('notion: ' + notes);
    return {
      status: 'ok',
      recordsUpserted: stats.chunks_written,
      notes,
    };
  });
}

export { syncMeetings } from './sync-meetings.js';
