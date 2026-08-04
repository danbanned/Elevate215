import { runSync, type SyncRunRecord } from '@lp-ai/lib-db';
import { extractSchoolRollupRows } from './school-rollup-extract.js';
import { cleanSchoolRollupRows } from './school-rollup-clean.js';
import { buildHeaderIndex, normalizeSchoolRollupRow } from './school-rollup-normalize.js';
import { validateSchoolRollupRows } from './school-rollup-validate.js';
import { loadSchoolRollupRows } from './school-rollup-load.js';

export type SyncResult = SyncRunRecord;

// A single linear pipeline (unlike aplos's several independent sync targets),
// so there's one runSync-wrapped body rather than a per-target safeRun() —
// a failure at any stage here genuinely should halt the run (you can't
// validate/load without a successful extract), and runSync's own try/catch
// already captures that into the sync_runs row as status: 'error'.
export async function sync(): Promise<SyncResult> {
  return runSync('google-sheets', async () => {
    const { headerRow, dataRows } = await extractSchoolRollupRows();
    console.log(`school-rollup: extracted ${dataRows.length} raw rows`);

    const { rows: cleanedRows, droppedBlankKey, dedupedCount } = cleanSchoolRollupRows(dataRows);
    console.log(
      `school-rollup: cleaned — ${droppedBlankKey} dropped (blank key), ${dedupedCount} deduped, ${cleanedRows.length} remaining`,
    );

    const headerIndex = buildHeaderIndex(headerRow);
    const normalizedRows = cleanedRows.map((row) => normalizeSchoolRollupRow(row, headerIndex));

    const { validRows, skipped } = validateSchoolRollupRows(normalizedRows);
    console.log(`school-rollup: validated — ${validRows.length} valid, ${skipped.length} skipped`);

    const { recordsUpserted, recordsSkipped, recordsDeleted } = await loadSchoolRollupRows(validRows);
    console.log(
      `school-rollup: loaded — ${recordsUpserted} upserted, ${recordsSkipped} load failures, ${recordsDeleted} stale rows deleted`,
    );

    return {
      status: 'ok',
      recordsUpserted,
      notes:
        `extracted: ${dataRows.length}; dropped_blank_key: ${droppedBlankKey}; deduped: ${dedupedCount}; ` +
        `validated: ${validRows.length}; validation_skipped: ${skipped.length}; load_skipped: ${recordsSkipped}; ` +
        `deleted_stale: ${recordsDeleted}`,
    };
  }, {
    tables: ['school_rollup'],
  });
}
