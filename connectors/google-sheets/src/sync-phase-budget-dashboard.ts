import { prisma } from '@lp-ai/db';
import { getAllSheetRows } from './sheets-client.js';
import { SheetSettingsMismatchError, logSheetSettingsMismatch, type SheetSettingsMismatch } from './errors.js';

function normalize2025ActualsColumn(raw: string): string | null {
  switch (raw.trim()) {
    case 'Expense':
    case 'Account Number':  return 'account_number';
    case 'Expenses':
    case 'Account Name':    return 'account_name';
    case 'Total Launchpad': return 'total_launchpad';
    case 'HS %':            return 'hs_pct';
    case 'HS':              return 'hs';
    case 'LiftOff %':       return 'liftoff_pct';
    case 'LiftOff':         return 'liftoff';
    default:                return null;
  }
}

const MONTHLY_HEADER_ROW_IDX = 6;
const MONTHLY_SETTINGS_ROW_IDX = 2;

function currentFiscalYear(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

function currentFiscalYearLabel(): string {
  return `FY ${currentFiscalYear()}`;
}

function monthColKey(raw: string): string | null {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  return `${m[1]!.toLowerCase()}_${m[2]!}`;
}

function projectedTotalKey(raw: string): string | null {
  const m = /^Projected Total FY\s*(\d{4})$/i.exec(raw.trim());
  if (!m) return null;
  return `projected_total_fy${m[1]!}`;
}

function normalizeMonthlyColumn(raw: string, colIdx: number): string | null {
  if (colIdx < 3) return null;
  const trimmed = raw.trim();
  if (colIdx === 3 && trimmed === 'Account Number') return 'account_number';
  if (colIdx === 4 && trimmed === 'Account Name')   return 'account_name';
  if (colIdx === 5) return projectedTotalKey(trimmed);
  if (colIdx >= 6)  return monthColKey(trimmed);
  return null;
}

function settingsExpectations(): Array<{ colIdx: number; colLetter: string; label: string; expected: string }> {
  return [
    { colIdx: 4, colLetter: 'E', label: 'View',           expected: 'Detail' },
    { colIdx: 6, colLetter: 'G', label: 'Fiscal Year',    expected: currentFiscalYearLabel() },
    { colIdx: 7, colLetter: 'H', label: 'Revenue Type',   expected: 'Projected' },
    { colIdx: 8, colLetter: 'I', label: 'Filter (blank)', expected: '' },
  ];
}

function verifySettings(spreadsheetId: string, tabName: string, settingsRow: string[]): void {
  const mismatches: SheetSettingsMismatch[] = [];
  for (const e of settingsExpectations()) {
    const actual = (settingsRow[e.colIdx] ?? '').trim();
    if (actual !== e.expected) {
      mismatches.push({ spreadsheetId, tabName, cell: `${e.colLetter}3`, label: e.label, expected: e.expected, actual });
    }
  }
  if (mismatches.length > 0) throw new SheetSettingsMismatchError(mismatches);
}

type ColumnMap = { rawIdx: number; key: string }[];

async function upsertRows(
  storedTabName: string,
  rows: string[][],
  startRowIdx: number,
  columnMap: ColumnMap,
): Promise<number> {
  let synced = 0;
  for (let i = startRowIdx; i < rows.length; i += 1) {
    const raw = rows[i];
    if (!raw || raw.every((c) => !c?.trim())) continue;

    const rowData: Record<string, string> = {};
    for (const { rawIdx, key } of columnMap) {
      rowData[key] = raw[rawIdx]?.trim() ?? '';
    }
    if (Object.values(rowData).every((v) => !v)) continue;

    const sourceId = `${storedTabName}:${i + 1}`;
    await prisma.financeSnapshot.upsert({
      where: { sourceId },
      create: { sourceId, tabName: storedTabName, period: null, rowData },
      update: { rowData },
    });
    synced += 1;
  }
  return synced;
}

const TAB_2025_ACTUALS = '2025 Actuals';
const TAB_MONTHLY_LIFTOFF = 'Monthly LiftOff Only';
const TAB_MONTHLY_HS = 'Monthly HS Only';

const STORED_NAMES: Record<string, string> = {
  [TAB_2025_ACTUALS]:    'phase_dashboard:2025 actuals',
  [TAB_MONTHLY_LIFTOFF]: 'phase_dashboard:monthly liftoff only',
  [TAB_MONTHLY_HS]:      'phase_dashboard:monthly hs only',
};

async function sync2025Actuals(rows: string[][]): Promise<number> {
  const stored = STORED_NAMES[TAB_2025_ACTUALS]!;
  if (rows.length < 2) return 0;

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (row.some((c) => c?.trim() === 'HS %') && row.some((c) => c?.trim() === 'LiftOff %')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return 0;

  const headers = rows[headerIdx] ?? [];
  const columnMap = headers
    .map((h, i) => {
      const key = normalize2025ActualsColumn(h?.trim() ?? '');
      return key === null ? null : { rawIdx: i, key };
    })
    .filter((e): e is { rawIdx: number; key: string } => e !== null);

  return upsertRows(stored, rows, headerIdx + 1, columnMap);
}

async function syncMonthlyTab(spreadsheetId: string, tabName: string, rows: string[][]): Promise<number> {
  const stored = STORED_NAMES[tabName]!;
  if (rows.length <= MONTHLY_HEADER_ROW_IDX) return 0;

  verifySettings(spreadsheetId, tabName, rows[MONTHLY_SETTINGS_ROW_IDX] ?? []);

  const headers = rows[MONTHLY_HEADER_ROW_IDX] ?? [];
  const columnMap = headers
    .map((h, i) => {
      const key = normalizeMonthlyColumn(h?.trim() ?? '', i);
      return key === null ? null : { rawIdx: i, key };
    })
    .filter((e): e is { rawIdx: number; key: string } => e !== null);

  if (columnMap.length === 0) return 0;
  return upsertRows(stored, rows, MONTHLY_HEADER_ROW_IDX + 1, columnMap);
}

async function trySyncMonthlyTab(spreadsheetId: string, tabName: string, rows: string[][]): Promise<number> {
  try {
    return await syncMonthlyTab(spreadsheetId, tabName, rows);
  } catch (err) {
    if (err instanceof SheetSettingsMismatchError) {
      logSheetSettingsMismatch(err);
      return 0;
    }
    throw err;
  }
}

export async function syncPhaseBudgetDashboard(): Promise<number> {
  const spreadsheetId = process.env['GOOGLE_SHEETS_PHASE_DASHBOARD_ID'];
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_PHASE_DASHBOARD_ID not set');
  const allTabs = [TAB_2025_ACTUALS, TAB_MONTHLY_LIFTOFF, TAB_MONTHLY_HS];

  let allSheets: Map<string, string[][]>;
  try {
    allSheets = await getAllSheetRows(spreadsheetId, allTabs);
  } catch (err) {
    console.warn(`  skipping phase budget dashboard: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }

  let total = 0;
  total += await sync2025Actuals(allSheets.get(TAB_2025_ACTUALS) ?? []);
  total += await trySyncMonthlyTab(spreadsheetId, TAB_MONTHLY_LIFTOFF, allSheets.get(TAB_MONTHLY_LIFTOFF) ?? []);
  total += await trySyncMonthlyTab(spreadsheetId, TAB_MONTHLY_HS,      allSheets.get(TAB_MONTHLY_HS)      ?? []);
  return total;
}
