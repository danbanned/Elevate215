import { prisma } from '@lp-ai/lib-db';
import { getSheetRows } from './sheets-client.js';

const LABEL_COL_IDX = 16;
const FIRST_DATA_ROW = 3;
const LAST_DATA_ROW = 9;

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function parseFiscalYearEnd(fy: string): number | null {
  const m = /(\d{4})(?:[-\/](\d{2,4}))?/.exec(fy);
  if (!m) return null;
  const first = parseInt(m[1]!, 10);
  const tail = m[2];
  if (!tail) return first;
  const tailNum = tail.length === 2
    ? Math.floor(first / 100) * 100 + parseInt(tail, 10)
    : parseInt(tail, 10);
  return Math.max(first, tailNum);
}

function parseMonthNumber(name: string): number | null {
  const norm = name.trim().toLowerCase().replace(/[^a-z]/g, '');
  return MONTH_NAMES[norm] ?? null;
}

function parsePeriodMonth(fy: string, monthName: string): Date | null {
  const fyEnd = parseFiscalYearEnd(fy);
  const monthNum = parseMonthNumber(monthName);
  if (fyEnd === null || monthNum === null) return null;
  const year = monthNum >= 7 ? fyEnd - 1 : fyEnd;
  const mm = String(monthNum).padStart(2, '0');
  return new Date(`${year}-${mm}-01T00:00:00Z`);
}

function parseCount(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/,/g, '');
  if (s === '' || s === '-' || s === '—') return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return s;
}

export async function syncEnrollment(): Promise<number> {
  const sheetId = process.env['GOOGLE_SHEETS_FINANCE_WORKBOOK'];
  if (!sheetId) {
    console.warn('  skipping enrollment: GOOGLE_SHEETS_FINANCE_WORKBOOK not set');
    return 0;
  }

  let rows: string[][];
  try {
    rows = await getSheetRows(sheetId, 'Enrollment');
  } catch (err) {
    console.warn(`  skipping enrollment: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }

  await prisma.enrollmentSnapshot.deleteMany({});
  console.log('  enrollment_snapshots: cleared existing rows ahead of re-sync');

  if (rows.length < LAST_DATA_ROW + 1) {
    console.warn(`  skipping enrollment: only ${rows.length} rows, need at least ${LAST_DATA_ROW + 1}`);
    return 0;
  }

  const fyRow = rows[0] ?? [];
  const monthRow = rows[1] ?? [];

  const phaseLabels: (string | null)[] = [];
  for (let r = FIRST_DATA_ROW; r <= LAST_DATA_ROW; r += 1) {
    const label = rows[r]?.[LABEL_COL_IDX]?.trim() ?? '';
    phaseLabels.push(label || null);
  }

  let synced = 0;
  let currentFy = '';
  const maxCol = Math.max(fyRow.length, monthRow.length);

  for (let c = LABEL_COL_IDX + 1; c < maxCol; c += 1) {
    const fyCell = fyRow[c]?.trim();
    if (fyCell) currentFy = fyCell;

    const monthCell = monthRow[c]?.trim() ?? '';
    if (!currentFy || !monthCell) continue;

    const period = parsePeriodMonth(currentFy, monthCell);
    if (!period) continue;

    for (let i = 0; i < phaseLabels.length; i += 1) {
      const phase = phaseLabels[i];
      if (!phase) continue;

      const dataRow = rows[FIRST_DATA_ROW + i];
      const countStr = parseCount(dataRow?.[c]);
      if (countStr === null) continue;

      const periodKey = period.toISOString().slice(0, 7);
      const sourceId = `enrollment:${periodKey}:${phase}`;

      await prisma.enrollmentSnapshot.upsert({
        where: { sourceId },
        create: { sourceId, periodMonth: period, phase, count: countStr },
        update: { periodMonth: period, phase, count: countStr },
      });
      synced += 1;
    }
  }

  return synced;
}
