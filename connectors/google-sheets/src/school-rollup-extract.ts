// Option B: local Excel file (SheetJS/xlsx), read once per sync run.
//
// Swap point for Option A (Google Sheets API) later: replace this file's
// implementation only. Its exported shape — { headerRow, dataRows } as
// string[][] — is what clean/normalize/validate/load consume; none of those
// files know or care where the rows came from. `sheets-client.ts` already has
// a `getAllSheetRows()` helper from the live-API path if/when that swap happens.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import XLSX from 'xlsx';

const SHEET_TAB_NAME = 'School Rollup';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SCHOOL_ROLLUP_FILE_PATH = resolve(here, '..', 'data', 'phl-school-performance-model.xlsx');

export interface SchoolRollupExtractResult {
  headerRow: string[];
  dataRows: string[][];
}

// Async for signature parity with the eventual Option A swap (a genuine network
// call) — the read itself is synchronous today (XLSX.readFile is sync I/O).
export async function extractSchoolRollupRows(
  filePath: string = DEFAULT_SCHOOL_ROLLUP_FILE_PATH,
): Promise<SchoolRollupExtractResult> {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[SHEET_TAB_NAME];
  if (!sheet) {
    throw new Error(
      `"${SHEET_TAB_NAME}" tab not found in ${filePath}. Sheets present: ${workbook.SheetNames.join(', ')}`,
    );
  }

  // raw:false -> formatted-string cell values (matches the string[][] contract);
  // defval:'' -> blank cells become '' rather than being omitted from the row.
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    throw new Error(`"${SHEET_TAB_NAME}" tab is empty in ${filePath}`);
  }

  // Column 0's header is a malformed sheet artifact (" f") — there is no usable
  // "AUN" header string to look up. Every downstream consumer (normalize.ts)
  // MUST read this column by position (index 0), never by header name.
  return { headerRow, dataRows };
}
