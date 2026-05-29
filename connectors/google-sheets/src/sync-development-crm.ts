import { prisma } from '@lp-ai/lib-db';
import { getAllSheetRows } from './sheets-client.js';

function headerToKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(auto\)/g, '')
    .replace(/[?]/g, '')
    .replace(/[$]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

type TabConfig = {
  sheetName: string;
  storedTabName: string;
  headerRowIdx: number;
};

const TAB_CONFIGS: TabConfig[] = [
  { sheetName: 'Contacts',           storedTabName: 'development:contacts',           headerRowIdx: 0 },
  { sheetName: 'Giving History',     storedTabName: 'development:giving history',     headerRowIdx: 0 },
  { sheetName: 'Prospect Pipeline',  storedTabName: 'development:prospect pipeline',  headerRowIdx: 3 },
  { sheetName: 'Denied',             storedTabName: 'development:denied',             headerRowIdx: 0 },
  { sheetName: 'Launchpad Pipeline', storedTabName: 'development:launchpad pipeline', headerRowIdx: 4 },
  { sheetName: 'Grants Tracker',     storedTabName: 'development:grants tracker',     headerRowIdx: 1 },
];

export async function syncDevelopmentCRM(): Promise<number> {
  const sheetId = process.env['GOOGLE_SHEETS_DEVELOPMENT_CRM'];
  if (!sheetId) throw new Error('GOOGLE_SHEETS_DEVELOPMENT_CRM not set');

  let allSheets: Map<string, string[][]>;
  try {
    allSheets = await getAllSheetRows(sheetId, TAB_CONFIGS.map((c) => c.sheetName));
  } catch (err) {
    console.warn(`  skipping development CRM: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }

  let totalSynced = 0;
  for (const config of TAB_CONFIGS) {
    const rows = allSheets.get(config.sheetName) ?? [];
    if (rows.length <= config.headerRowIdx) continue;

    const headers = rows[config.headerRowIdx] ?? [];
    const seenKeys = new Set<string>();
    const columnMap: { rawIdx: number; key: string }[] = [];
    for (let i = 0; i < headers.length; i += 1) {
      const raw = (headers[i] ?? '').trim();
      if (!raw) continue;
      const key = headerToKey(raw);
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      columnMap.push({ rawIdx: i, key });
    }
    if (columnMap.length === 0) continue;

    for (let i = config.headerRowIdx + 1; i < rows.length; i += 1) {
      const raw = rows[i];
      if (!raw || raw.every((c) => !c?.trim())) continue;

      const rowData: Record<string, string> = {};
      for (const { rawIdx, key } of columnMap) {
        rowData[key] = raw[rawIdx]?.trim() ?? '';
      }
      if (Object.values(rowData).every((v) => !v)) continue;

      const sourceId = `${config.storedTabName}:${i + 1}`;
      await prisma.financeSnapshot.upsert({
        where: { sourceId },
        create: { sourceId, tabName: config.storedTabName, period: null, rowData },
        update: { rowData },
      });
      totalSynced += 1;
    }
  }

  return totalSynced;
}
