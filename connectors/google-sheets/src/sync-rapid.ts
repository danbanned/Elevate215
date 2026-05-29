import { prisma } from '@lp-ai/lib-db';
import { getAllSheetRows } from './sheets-client.js';

function monthColKey(raw: string): string | null {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  return `${m[1]!.toLowerCase()}_${m[2]!}`;
}

function normalizeFyColumn(raw: string): string | null {
  switch (raw.trim()) {
    case 'TransID/UserID/IP Address': return 'trans_id';
    case 'Date/Time':                 return 'date_time';
    case 'Tran Code':                 return 'tran_code';
    case 'Transaction Description':   return 'transaction_description';
    case 'Reference Information':     return 'reference_info';
    case 'Base Amount':               return 'base_amount';
    case 'Program':                   return 'program';
    case 'Fee':                       return 'fee';
    case 'Total Amount':              return 'total_amount';
    case 'Running Balance':           return 'running_balance';
    default:                          return null;
  }
}

type TabConfig = {
  sheetName: string;
  tabStoreName: string;
  isHeaderRow: (row: string[]) => boolean;
  normalizeColumn: (raw: string, colIdx: number) => string | null;
};

const TAB_CONFIGS: TabConfig[] = [
  {
    sheetName: 'Dashboard',
    tabStoreName: 'rapid:Dashboard',
    isHeaderRow: (row) => row.some((c) => /^[A-Za-z]+ 20\d{2}$/.test(c?.trim() ?? '')),
    normalizeColumn: (raw, colIdx) => {
      if (colIdx === 0) return 'account_number';
      if (colIdx === 1) return 'account_name';
      return monthColKey(raw);
    },
  },
  {
    sheetName: 'FY2023',
    tabStoreName: 'rapid:FY2023',
    isHeaderRow: (row) => row.some((c) => c?.trim() === 'TransID/UserID/IP Address'),
    normalizeColumn: (raw) => normalizeFyColumn(raw),
  },
  {
    sheetName: 'FY2024',
    tabStoreName: 'rapid:FY2024',
    isHeaderRow: (row) => row.some((c) => c?.trim() === 'TransID/UserID/IP Address'),
    normalizeColumn: (raw) => normalizeFyColumn(raw),
  },
  {
    sheetName: 'FY2025',
    tabStoreName: 'rapid:FY2025',
    isHeaderRow: (row) => row.some((c) => c?.trim() === 'TransID/UserID/IP Address'),
    normalizeColumn: (raw) => normalizeFyColumn(raw),
  },
];

export async function syncRapid(): Promise<number> {
  const sheetId = process.env['GOOGLE_SHEETS_RAPID'];
  if (!sheetId) throw new Error('GOOGLE_SHEETS_RAPID not set');

  let allSheets: Map<string, string[][]>;
  try {
    allSheets = await getAllSheetRows(sheetId, TAB_CONFIGS.map((c) => c.sheetName));
  } catch (err) {
    console.warn(`  skipping rapid: ${err instanceof Error ? err.message : String(err)}`);
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
