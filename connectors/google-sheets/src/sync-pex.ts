import { prisma } from '@lp-ai/db';
import { getAllSheetRows } from './sheets-client.js';

function monthColKey(raw: string): string | null {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  return `${m[1]!.toLowerCase()}_${m[2]!}`;
}

function normalizeFyColumn(raw: string): string | null {
  switch (raw.trim()) {
    case 'Date':                                return 'date';
    case 'Description':                         return 'description';
    case 'Amount':                              return 'amount';
    case 'Created By':                          return 'created_by';
    case 'Method':                              return 'method';
    case 'Funding Request':                     return 'funding_request';
    case 'Program':                             return 'program';
    case 'Business Account Transaction ID':     return 'business_acct_trans_id';
    case 'Card Funding Transaction ID':         return 'card_funding_trans_id';
    case 'Request ID':                          return 'request_id';
    case 'Comments':                            return 'comments';
    default:                                    return null;
  }
}

type TabConfig = {
  sheetName: string;
  tabStoreName: string;
  isHeaderRow: (row: string[]) => boolean;
  normalizeColumn: (raw: string, colIdx: number) => string | null;
};

const FY_TABS: string[] = ['FY2022', 'FY2023', 'FY2024', 'FY2025', 'FY2026'];

const TAB_CONFIGS: TabConfig[] = [
  {
    sheetName: 'Dashboard',
    tabStoreName: 'pex:Dashboard',
    isHeaderRow: (row) => row.some((c) => /^[A-Za-z]+ 20\d{2}$/.test(c?.trim() ?? '')),
    normalizeColumn: (raw, colIdx) => {
      if (colIdx === 0) return 'account_name';
      return monthColKey(raw);
    },
  },
  ...FY_TABS.map((fy): TabConfig => ({
    sheetName: fy,
    tabStoreName: `pex:${fy}`,
    isHeaderRow: (row) => row.some((c) => c?.trim() === 'Date') && row.some((c) => c?.trim() === 'Description'),
    normalizeColumn: (raw) => normalizeFyColumn(raw),
  })),
];

export async function syncPex(): Promise<number> {
  const sheetId = process.env['GOOGLE_SHEETS_PEX'];
  if (!sheetId) throw new Error('GOOGLE_SHEETS_PEX not set');

  let allSheets: Map<string, string[][]>;
  try {
    allSheets = await getAllSheetRows(sheetId, TAB_CONFIGS.map((c) => c.sheetName));
  } catch (err) {
    console.warn(`  skipping pex: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }

  let totalSynced = 0;
  for (const config of TAB_CONFIGS) {
    const rows = allSheets.get(config.sheetName) ?? [];
    if (rows.length < 2) continue;

    let headerIdx = -1;
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i] && config.isHeaderRow(rows[i]!)) { headerIdx = i; break; }
    }
    if (headerIdx === -1) continue;

    const headers = rows[headerIdx] ?? [];
    const columnMap: { rawIdx: number; key: string }[] = headers
      .map((h, i) => {
        const key = config.normalizeColumn(h?.trim() ?? '', i);
        return key === null ? null : { rawIdx: i, key };
      })
      .filter((e): e is { rawIdx: number; key: string } => e !== null);

    for (let i = headerIdx + 1; i < rows.length; i += 1) {
      const raw = rows[i];
      if (!raw || raw.every((c) => !c?.trim())) continue;

      const rowData: Record<string, string> = {};
      for (const { rawIdx, key } of columnMap) {
        rowData[key] = raw[rawIdx]?.trim() ?? '';
      }
      if (Object.values(rowData).every((v) => !v)) continue;

      const sourceId = `${config.tabStoreName}:${i + 1}`;
      await prisma.financeSnapshot.upsert({
        where: { sourceId },
        create: { sourceId, tabName: config.tabStoreName, period: null, rowData },
        update: { rowData },
      });
      totalSynced += 1;
    }
  }

  return totalSynced;
}
