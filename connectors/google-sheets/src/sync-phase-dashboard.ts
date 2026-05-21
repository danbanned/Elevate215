import { prisma } from '@lp-ai/db';
import { getAllSheetRows } from './sheets-client.js';

type TabConfig = {
  name: string;
  isHeaderRow: (row: string[]) => boolean;
  normalizeColumn: (raw: string, colIdx: number) => string | null;
};

const TAB_CONFIGS: TabConfig[] = [
  {
    name: 'global %',
    isHeaderRow: (row) => row.some((c) => c?.trim() === 'Account Number'),
    normalizeColumn: (raw) => {
      if (raw === 'Account Number') return 'account_number';
      if (raw === 'Account Name')   return 'account_name';
      if (raw === 'Amount')         return 'amount';
      if (raw === 'Global %?')      return 'global_pct';
      if (raw === '101')            return 'phase_101';
      if (raw === 'LiftOff')        return 'liftoff';
      if (raw === 'Inc')            return 'inc';
      return null;
    },
  },
  {
    name: 'Human capital %',
    isHeaderRow: (row) => row.some((c) => c?.trim() === 'Account Name' || c?.trim() === 'Account Numbers'),
    normalizeColumn: (raw) => {
      if (raw === 'Account Numbers' || raw === 'Account Number') return 'account_number';
      if (raw === 'Account Name')   return 'account_name';
      if (raw === 'Name')           return 'name';
      if (raw === 'LP HS %')        return 'lp_hs_pct';
      if (raw === 'LP LiftOff %')   return 'lp_liftoff_pct';
      if (raw === 'Inc')            return 'inc';
      return null;
    },
  },
  {
    name: 'actuals by phase',
    isHeaderRow: (row) => row.some((c) => c?.trim() === 'Account Number'),
    normalizeColumn: (raw, colIdx) => {
      if (raw === 'Account Number') return 'account_number';
      if (raw === 'Account Name')   return 'account_name';
      if (colIdx === 9  && raw === '101')     return 'actuals_101';
      if (colIdx === 10 && raw === 'LiftOff') return 'actuals_liftoff';
      if (colIdx === 11 && raw === 'Inc')     return 'actuals_inc';
      if (colIdx === 12 && raw === 'Admin')   return 'actuals_admin';
      return null;
    },
  },
];

export async function syncPhaseSheet(sheetId: string, tabNamePrefix: string): Promise<number> {
  let allSheets: Map<string, string[][]>;
  try {
    allSheets = await getAllSheetRows(sheetId, TAB_CONFIGS.map((c) => c.name));
  } catch (err) {
    console.warn(`  skipping phase sheet: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }

  let totalSynced = 0;
  for (const config of TAB_CONFIGS) {
    const tabStoreName = `${tabNamePrefix}${config.name}`;
    const rows = allSheets.get(config.name) ?? [];
    if (rows.length < 2) continue;

    let headerIdx = -1;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row && config.isHeaderRow(row)) { headerIdx = i; break; }
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

      const sourceId = `${tabStoreName}:${i + 1}`;
      await prisma.financeSnapshot.upsert({
        where: { sourceId },
        create: { sourceId, tabName: tabStoreName, period: null, rowData },
        update: { rowData },
      });
      totalSynced += 1;
    }
  }

  return totalSynced;
}

export async function syncPhaseActualsQ3_2026(): Promise<number> {
  const id = process.env['GOOGLE_SHEETS_BY_PHASE_Q3_2026_ACTUALS'];
  if (!id) throw new Error('GOOGLE_SHEETS_BY_PHASE_Q3_2026_ACTUALS not set');
  return syncPhaseSheet(id, 'q3_2026_actuals:');
}

export async function syncPhaseActuals2025(): Promise<number> {
  const id = process.env['GOOGLE_SHEETS_BUDGET_BY_PHASE_ACTUALS_2025'];
  if (!id) throw new Error('GOOGLE_SHEETS_BUDGET_BY_PHASE_ACTUALS_2025 not set');
  return syncPhaseSheet(id, 'phase_actuals_2025:');
}
