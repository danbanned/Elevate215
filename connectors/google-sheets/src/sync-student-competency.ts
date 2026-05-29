import { prisma } from '@lp-ai/lib-db';
import { getAllSheetRows } from './sheets-client.js';

function snakeCase(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function parseNumStr(v: string | undefined): string | null {
  const s = v?.trim().replace(/,/g, '');
  return s !== undefined && s !== '' && !isNaN(Number(s)) ? s : null;
}

function parseIntOrNull(v: string | undefined): number | null {
  const n = parseInt(v?.trim() ?? '', 10);
  return isNaN(n) ? null : n;
}

function normalizeScoreColumn(raw: string): string | null {
  switch (raw.trim()) {
    case 'Student Number':      return 'student_number';
    case 'Competency':          return 'competency';
    case 'Portfolio':           return 'portfolio';
    case 'Baseline':            return 'baseline';
    case 'Performance Level':   return 'performance_level';
    case 'Growth':              return 'growth';
    case 'Progress':            return 'progress';
    case 'Total ER':            return 'total_er';
    case 'Completed ER':        return 'completed_er';
    case 'Missed ER':           return 'missed_er';
    case 'Total Opportunities': return 'total_opportunities';
    default:                    return null;
  }
}

function normalizeRubricColumn(raw: string): string | null {
  switch (raw.trim()) {
    case 'Type':                          return 'type';
    case 'Code':                          return 'code';
    case 'Descriptor':                    return 'descriptor';
    case 'Statement or Guiding Question': return 'statement';
    case 'HS ER':                         return 'hs_er';
    case 'HS Total':                      return 'hs_total';
    case 'LO ER':                         return 'lo_er';
    case 'LO Total':                      return 'lo_total';
    default:                              return null;
  }
}

async function syncScoresTab(allSheets: Map<string, string[][]>): Promise<number> {
  let rows: string[][] | null = null;
  for (const [, tabRows] of allSheets) {
    if (tabRows[0]?.some((c) => c?.trim() === 'Student Number')) {
      rows = tabRows;
      break;
    }
  }
  if (!rows) {
    console.warn('  skipping student competency scores tab: could not detect tab with "Student Number" header');
    return 0;
  }

  const headerRow = rows[0] ?? [];
  const columnMap: { rawIdx: number; key: string }[] = headerRow
    .map((h, i) => {
      const key = normalizeScoreColumn(h?.trim() ?? '');
      return key === null ? null : { rawIdx: i, key };
    })
    .filter((e): e is { rawIdx: number; key: string } => e !== null);

  let synced = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const raw = rows[i];
    if (!raw || raw.every((c) => !c?.trim())) continue;

    const rowData: Record<string, string> = {};
    for (const { rawIdx, key } of columnMap) {
      rowData[key] = raw[rawIdx]?.trim() ?? '';
    }
    if (Object.values(rowData).every((v) => !v)) continue;

    const studentNumber = rowData['student_number'];
    const competency = rowData['competency'];
    if (!studentNumber || !competency) continue;

    const sourceId = `student_competency:scores:${i + 1}`;
    const data = {
      studentNumber,
      competency,
      portfolio: rowData['portfolio'] || null,
      baseline: parseNumStr(rowData['baseline']),
      performanceLevel: parseNumStr(rowData['performance_level']),
      growth: parseNumStr(rowData['growth']),
      progress: parseNumStr(rowData['progress']),
      totalEr: parseIntOrNull(rowData['total_er']),
      completedEr: parseIntOrNull(rowData['completed_er']),
      missedEr: parseIntOrNull(rowData['missed_er']),
      totalOpportunities: parseIntOrNull(rowData['total_opportunities']),
    };

    await prisma.studentCompetency.upsert({
      where: { sourceId },
      create: { sourceId, ...data },
      update: data,
    });
    synced += 1;
  }
  return synced;
}

async function syncRubricTab(allSheets: Map<string, string[][]>): Promise<number> {
  const rows = allSheets.get('Sheet1') ?? [];
  if (rows.length < 5) return 0;

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (
      row.some((c) => c?.trim() === 'Type') &&
      row.some((c) => c?.trim() === 'Code') &&
      row.some((c) => c?.trim() === 'Descriptor')
    ) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 2) return 0;

  const phaseTermRow = rows[headerIdx - 2] ?? [];
  const opTotalsRow  = rows[headerIdx - 1] ?? [];
  const headerRow    = rows[headerIdx]     ?? [];

  const columnMap: { rawIdx: number; key: string }[] = headerRow
    .map((h, i) => {
      const h4 = h?.trim() ?? '';
      let key: string | null;
      if (h4) {
        key = normalizeRubricColumn(h4);
      } else {
        const h2 = phaseTermRow[i]?.trim() ?? '';
        key = h2 ? snakeCase(h2) : null;
      }
      return key === null ? null : { rawIdx: i, key };
    })
    .filter((e): e is { rawIdx: number; key: string } => e !== null);

  let synced = 0;

  const totalsData: Record<string, string> = { row_type: 'opportunity_totals' };
  for (const { rawIdx, key } of columnMap) {
    totalsData[key] = opTotalsRow[rawIdx]?.trim() ?? '';
  }
  const totalsSourceId = `student_competency:rubric:${headerIdx}`;
  await prisma.financeSnapshot.upsert({
    where: { sourceId: totalsSourceId },
    create: { sourceId: totalsSourceId, tabName: 'student_competency:rubric', period: null, rowData: totalsData },
    update: { rowData: totalsData },
  });
  synced += 1;

  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const raw = rows[i];
    if (!raw || raw.every((c) => !c?.trim())) continue;

    const rowData: Record<string, string> = {};
    for (const { rawIdx, key } of columnMap) {
      rowData[key] = raw[rawIdx]?.trim() ?? '';
    }
    if (Object.values(rowData).every((v) => !v)) continue;

    const sourceId = `student_competency:rubric:${i + 1}`;
    await prisma.financeSnapshot.upsert({
      where: { sourceId },
      create: { sourceId, tabName: 'student_competency:rubric', period: null, rowData },
      update: { rowData },
    });
    synced += 1;
  }
  return synced;
}

export async function syncStudentCompetency(): Promise<number> {
  const sheetId = process.env['GOOGLE_SHEETS_STUDENT_COMPETENCY'];
  if (!sheetId) throw new Error('GOOGLE_SHEETS_STUDENT_COMPETENCY not set');

  let allSheets: Map<string, string[][]>;
  try {
    allSheets = await getAllSheetRows(sheetId);
  } catch (err) {
    console.warn(`  skipping student competency: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }

  const scoresCount = await syncScoresTab(allSheets);
  const rubricCount = await syncRubricTab(allSheets);
  return scoresCount + rubricCount;
}
