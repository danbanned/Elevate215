// Clean stage: dedupe, drop unkeyable rows, trim, blank -> null.
// Operates positionally on raw string[][] rows — column 0 (aun) and column 1
// (schoolNumber) are the only positions this stage cares about directly; every
// other column is passed through untouched for normalize.ts to interpret.

const AUN_COL = 0;
const SCHOOL_NUMBER_COL = 1;

export type CleanedRow = Array<string | null>;

export interface CleanResult {
  rows: CleanedRow[];
  droppedBlankKey: number;
  dedupedCount: number;
}

export function cleanSchoolRollupRows(dataRows: string[][]): CleanResult {
  // 1. Trim whitespace on every string cell; normalize blank -> null.
  const cleaned: CleanedRow[] = dataRows.map((row) =>
    row.map((cell) => {
      const trimmed = typeof cell === 'string' ? cell.trim() : cell;
      return trimmed === '' ? null : trimmed;
    }),
  );

  // 2. Drop rows where both aun AND schoolNumber are blank — can't upsert
  //    without the key. (The sheet's used-range extends well past its ~301
  //    real rows with trailing blanks; this is what filters those out.)
  let droppedBlankKey = 0;
  const withKey = cleaned.filter((row) => {
    const hasAun = row[AUN_COL] !== null;
    const hasSchoolNumber = row[SCHOOL_NUMBER_COL] !== null;
    if (!hasAun && !hasSchoolNumber) {
      droppedBlankKey++;
      return false;
    }
    return true;
  });

  // 3. Dedupe by (aun, schoolNumber) — keep last seen.
  const byKey = new Map<string, CleanedRow>();
  for (const row of withKey) {
    const key = `${row[AUN_COL] ?? ''}::${row[SCHOOL_NUMBER_COL] ?? ''}`;
    byKey.set(key, row); // overwrites any earlier entry for this key
  }
  const rows = [...byKey.values()];
  const dedupedCount = withKey.length - rows.length;

  return { rows, droppedBlankKey, dedupedCount };
}
