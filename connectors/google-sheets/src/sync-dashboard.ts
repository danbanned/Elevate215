import { prisma } from '@lp-ai/db';
import { getSheetRows } from './sheets-client.js';
import { SheetSettingsMismatchError, logSheetSettingsMismatch, type SheetSettingsMismatch } from './errors.js';

type SelectorCheck = {
  col: number;
  expected: string;
  label: string;
};

type SummarySection = {
  rowStart: number;
  rowEnd: number;
  labelCol: number;
  dataStartCol: number;
};

type TabConfig = {
  name: string;
  range: string;
  selectorRowIndex: number;
  selectorChecks: SelectorCheck[];
  isHeaderRow?: (row: string[]) => boolean;
  normalizeColumn?: (raw: string) => string | null;
  summarySection?: SummarySection;
};

const TAB_CONFIGS: TabConfig[] = [
  {
    name: 'Prior Month Budget vs Actual',
    range: "'Prior Month Budget vs Actual'!A1:Z",
    selectorRowIndex: 2,
    selectorChecks: [
      { col: 4, expected: 'Detail',    label: 'View'         },
      { col: 7, expected: 'Projected', label: 'Revenue Type' },
      { col: 8, expected: '',          label: 'Fund'         },
    ],
    normalizeColumn: (raw) => {
      if (raw === 'Account Number')          return 'account_number';
      if (raw === 'Account Name')            return 'account_name';
      if (raw.startsWith('Actuals for '))    return 'actuals';
      if (raw.startsWith('Budgets for '))    return 'budget';
      if (raw === 'Difference Actual-Budget') return 'variance';
      return null;
    },
  },
  {
    name: 'YTD Budget vs Actual',
    range: "'YTD Budget vs Actual'!A1:Z",
    selectorRowIndex: 2,
    selectorChecks: [
      { col: 4, expected: 'Detail',    label: 'View'         },
      { col: 7, expected: 'Projected', label: 'Revenue Type' },
      { col: 8, expected: '',          label: 'Fund'         },
    ],
    normalizeColumn: (raw) => {
      if (raw === 'Account Number')                  return 'account_number';
      if (raw === 'Account Name')                    return 'account_name';
      if (raw === 'hide')                            return null;
      if (raw.startsWith('Actual thru '))            return 'actuals';
      if (raw.startsWith('Budget thru '))            return 'budget';
      if (raw === 'Difference Actual-Budget')        return 'variance';
      if (raw.match(/^FY \d+ Funds Remaining$/))     return 'funds_remaining';
      if (raw.match(/^FY \d+ Budget$/))              return 'fy_budget';
      if (raw.match(/^FY \d+ Actual \+ Projected$/)) return 'fy_actual_projected';
      return null;
    },
  },
  {
    name: 'Rolling Forecast',
    range: "'Rolling Forecast'!A1:AZ",
    selectorRowIndex: 2,
    selectorChecks: [
      { col: 4, expected: 'Summary',    label: 'View'         },
      { col: 7, expected: 'Projected', label: 'Revenue Type' },
      { col: 9, expected: '',          label: 'Fund'         },
    ],
    normalizeColumn: (raw) => {
      if (raw === 'Account Number')                  return 'account_number';
      if (raw === 'Account Name')                    return 'account_name';
      if (raw === 'Format' || raw === 'Start Number' || raw === 'End Number' || raw === 'hide') return null;
      if (raw === 'Variance')                        return 'variance';
      if (raw.match(/^FY \d+ Actual \+ Projected$/)) return 'fy_actual_projected';
      if (raw.match(/^FY \d+ Budget$/))              return 'fy_budget';
      const monthMatch = raw.match(/^([A-Za-z]{3}) (\d{4})$/);
      if (monthMatch) return `${monthMatch[1]!.toLowerCase()}_${monthMatch[2]}`;
      return null;
    },
  },
  {
    name: 'Monthly',
    range: "'Monthly'!A1:AZ",
    selectorRowIndex: 2,
    selectorChecks: [
      { col: 4, expected: 'Detail',    label: 'View'         },
      { col: 7, expected: 'Projected', label: 'Revenue Type' },
      { col: 8, expected: '',          label: 'Fund'         },
    ],
    summarySection: { rowStart: 5, rowEnd: 8, labelCol: 4, dataStartCol: 6 },
    normalizeColumn: (raw) => {
      if (raw === 'Account Number')                  return 'account_number';
      if (raw === 'Account Name')                    return 'account_name';
      if (raw === 'hide' || raw === 'End')           return null;
      if (raw.match(/^Projected Total FY \d+$/))     return 'projected_total';
      if (raw.match(/^FY \d+ Actual \+ Projected$/)) return 'fy_actual_projected';
      if (raw.match(/^FY \d+ Budget$/))              return 'fy_budget';
      const monthMatch = raw.match(/^([A-Za-z]{3}) (\d{4})$/);
      if (monthMatch) return `${monthMatch[1]!.toLowerCase()}_${monthMatch[2]}`;
      return null;
    },
  },
  {
    name: 'Combined Funds',
    range: "'Combined Funds'!A1:Z",
    selectorRowIndex: 2,
    selectorChecks: [
      { col: 4, expected: 'Detail',    label: 'View'         },
      { col: 7, expected: 'Projected', label: 'Revenue Type' },
    ],
    summarySection: { rowStart: 5, rowEnd: 7, labelCol: 4, dataStartCol: 5 },
    normalizeColumn: (raw) => {
      if (raw === 'Account Number')             return 'account_number';
      if (raw === 'Account Name')               return 'account_name';
      if (raw === 'hide' || raw === 'End')      return null;
      if (raw.match(/^Total FY \d+$/))          return 'total';
      return raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || null;
    },
  },
  {
    name: 'Annual',
    range: "'Annual'!A1:AZ",
    selectorRowIndex: 2,
    selectorChecks: [
      { col: 4, expected: 'Detail',    label: 'View'         },
      { col: 7, expected: 'Projected', label: 'Revenue Type' },
    ],
    summarySection: { rowStart: 5, rowEnd: 7, labelCol: 4, dataStartCol: 5 },
    normalizeColumn: (raw) => {
      if (raw === 'Account Number')             return 'account_number';
      if (raw === 'Account Name')               return 'account_name';
      if (raw === 'hide' || raw === 'End')      return null;
      if (raw.match(/^Total FY \d+$/))          return 'total';
      return raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || null;
    },
  },
];

function findHeaderRowIndex(rows: string[][], isHeaderRow?: TabConfig['isHeaderRow']): number {
  const predicate = isHeaderRow ?? ((row) => row.some((cell) => cell?.trim() === 'Account Number'));
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row && predicate(row)) return i;
  }
  return -1;
}

function colLetter(idx: number): string {
  let result = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function validateSelectors(
  spreadsheetId: string,
  tabName: string,
  selectorRow: string[],
  selectorRowIndex: number,
  checks: SelectorCheck[],
): void {
  if (checks.length === 0) return;
  const mismatches: SheetSettingsMismatch[] = [];
  for (const check of checks) {
    const actual = selectorRow[check.col]?.trim() ?? '';
    if (actual !== check.expected) {
      mismatches.push({
        spreadsheetId,
        tabName,
        cell: `${colLetter(check.col)}${selectorRowIndex + 1}`,
        label: check.label,
        expected: check.expected,
        actual,
      });
    }
  }
  if (mismatches.length > 0) throw new SheetSettingsMismatchError(mismatches);
}

export async function syncDashboard(): Promise<number> {
  const sheetId = process.env['GOOGLE_SHEETS_DASHBOARD_ID'];
  if (!sheetId) throw new Error('GOOGLE_SHEETS_DASHBOARD_ID not set');
  let totalSynced = 0;

  for (const config of TAB_CONFIGS) {
    let rows: string[][];
    try {
      rows = await getSheetRows(sheetId, config.range);
    } catch (err) {
      console.warn(`  skipping tab "${config.name}": ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (rows.length < 2) continue;

    const selectorRow = rows[config.selectorRowIndex] ?? [];
    try {
      validateSelectors(sheetId, config.name, selectorRow, config.selectorRowIndex, config.selectorChecks);
    } catch (err) {
      if (err instanceof SheetSettingsMismatchError) {
        logSheetSettingsMismatch(err);
        continue;
      }
      throw err;
    }

    const headerIdx = findHeaderRowIndex(rows, config.isHeaderRow);
    if (headerIdx === -1) continue;

    const headers = rows[headerIdx] ?? [];
    const columnMap: { rawIdx: number; key: string }[] = headers
      .map((h, i) => {
        const raw = h?.trim() ?? '';
        if (!raw || raw === 'hide' || raw === 'End') return null;
        const key = config.normalizeColumn ? config.normalizeColumn(raw) : raw;
        if (key === null) return null;
        return { rawIdx: i, key };
      })
      .filter((entry): entry is { rawIdx: number; key: string } => entry !== null);

    let synced = 0;
    const period = selectorRow[1]?.trim() ?? null;

    if (config.summarySection) {
      const { rowStart, rowEnd, labelCol, dataStartCol } = config.summarySection;
      const summaryColumnMap = columnMap.filter(({ rawIdx }) => rawIdx >= dataStartCol);

      for (let i = rowStart; i <= rowEnd; i += 1) {
        const raw = rows[i];
        if (!raw) continue;
        const label = raw[labelCol]?.trim();
        if (!label) continue;

        const rowData: Record<string, string> = { account_name: label, row_type: 'summary' };
        for (const { rawIdx, key } of summaryColumnMap) {
          const val = raw[rawIdx]?.trim() ?? '';
          if (val) rowData[key] = val;
        }

        const sourceId = `${config.name}:summary:${i + 1}`;
        await prisma.financeSnapshot.upsert({
          where: { sourceId },
          create: { sourceId, tabName: config.name, period, rowData },
          update: { rowData, period },
        });
        synced += 1;
      }
    }

    for (let i = headerIdx + 1; i < rows.length; i += 1) {
      const raw = rows[i];
      if (!raw || raw.every((c) => !c?.trim())) continue;

      const rowData: Record<string, string> = {};
      for (const { rawIdx, key } of columnMap) {
        rowData[key] = raw[rawIdx]?.trim() ?? '';
      }
      if (Object.values(rowData).every((v) => !v)) continue;

      const sourceId = `${config.name}:${i + 1}`;
      await prisma.financeSnapshot.upsert({
        where: { sourceId },
        create: { sourceId, tabName: config.name, period, rowData },
        update: { rowData, period },
      });
      synced += 1;
    }

    totalSynced += synced;
  }

  return totalSynced;
}
