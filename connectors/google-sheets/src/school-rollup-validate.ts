// Validate stage: the 8 checks that are safe to implement without depending on
// the 6 open questions (see docs/data-sources/school-rollup-dictionary.md).
// A failing row is skipped and logged, never thrown — one bad row must not
// halt the sync. Rows passing every check are narrowed to
// ValidatedSchoolRollupRow, where the fields the DB requires NOT NULL are
// guaranteed present.
import type { NormalizedSchoolRollupRow } from './school-rollup-normalize.js';

export interface ValidatedSchoolRollupRow extends NormalizedSchoolRollupRow {
  aun: string;
  schoolNumber: string;
  districtName: string;
  schoolName: string;
  schoolType: string;
  excludedSelectionCriteria: boolean;
  aboveLineCount: number;
  within5Count: number;
  belowLineCount: number;
  testsWithData: number;
}

export interface SkippedRow {
  aun: string | null;
  schoolNumber: string | null;
  check: string;
  detail: string;
}

export interface ValidateResult {
  validRows: ValidatedSchoolRollupRow[];
  skipped: SkippedRow[];
}

interface CheckFailure {
  check: string;
  detail: string;
}

type Check = (row: NormalizedSchoolRollupRow) => CheckFailure | null;

// 1. Upsert key must be present.
const checkKeyPresent: Check = (row) => {
  if (!row.aun || !row.schoolNumber) {
    return { check: 'key_present', detail: 'aun and/or schoolNumber missing' };
  }
  return null;
};

// 2. Percentage range: 0-100 inclusive, when present.
const PERCENT_FIELDS: Array<keyof NormalizedSchoolRollupRow> = [
  'pctBlackHispanic',
  'pctLowIncome',
  'pssaReadingPctProficient',
  'pssaMathPctProficient',
  'keystoneAlgebraIPctProficient',
  'keystoneBiologyPctProficient',
  'keystoneLiteraturePctProficient',
];

const checkPercentRanges: Check = (row) => {
  for (const field of PERCENT_FIELDS) {
    const value = row[field];
    if (value === null) continue;
    const n = Number(value);
    if (Number.isNaN(n) || n < 0 || n > 100) {
      return { check: 'percent_range', detail: `${field}="${String(value)}" not within 0-100` };
    }
  }
  return null;
};

// 3. Required fields must never be null.
const checkRequiredFields: Check = (row) => {
  if (
    row.schoolName === null ||
    row.districtName === null ||
    row.schoolType === null ||
    row.excludedSelectionCriteria === null
  ) {
    return {
      check: 'required_fields',
      detail: 'one or more of schoolName/districtName/schoolType/excludedSelectionCriteria is missing',
    };
  }
  return null;
};

// 4. Count cross-check: confirmed safe against all 301 real rows, zero exceptions.
const checkCountCrossCheck: Check = (row) => {
  const { aboveLineCount, within5Count, belowLineCount, testsWithData } = row;
  if (aboveLineCount === null || within5Count === null || belowLineCount === null || testsWithData === null) {
    return { check: 'count_cross_check', detail: 'one or more count fields missing' };
  }
  const sum = aboveLineCount + within5Count + belowLineCount;
  if (sum !== testsWithData) {
    return {
      check: 'count_cross_check',
      detail: `aboveLineCount+within5Count+belowLineCount=${sum} != testsWithData=${testsWithData}`,
    };
  }
  return null;
};

// 5. Band allowlist.
const VALID_BANDS = new Set([
  'Above Line (5+)',
  'Within 5 pts',
  'Below Line (5+)',
  'Excluded (Selection Criteria)',
]);

const BAND_FIELDS: Array<keyof NormalizedSchoolRollupRow> = [
  'pssaReadingBand',
  'pssaMathBand',
  'keystoneAlgebraIBand',
  'keystoneBiologyBand',
  'keystoneLiteratureBand',
];

const checkBandAllowlist: Check = (row) => {
  for (const field of BAND_FIELDS) {
    const value = row[field];
    if (value !== null && !VALID_BANDS.has(value as string)) {
      return { check: 'band_allowlist', detail: `${field}="${String(value)}" not in allowed set` };
    }
  }
  return null;
};

// 6. excludedSelectionCriteria=true never co-occurs with schoolType="Charter".
const checkExcludedNeverCharter: Check = (row) => {
  if (row.excludedSelectionCriteria === true && row.schoolType === 'Charter') {
    return { check: 'excluded_never_charter', detail: 'excludedSelectionCriteria=true on a Charter row' };
  }
  return null;
};

// 7. Charter-only fields must be null on every District row.
const CHARTER_ONLY_FIELDS: Array<keyof NormalizedSchoolRollupRow> = [
  'currentEnrollment',
  'authorizedEnrollmentCap',
  'unusedSeats',
  'fillTier',
  'eapiTier',
];

const checkCharterOnlyFieldsNullOnDistrict: Check = (row) => {
  if (row.schoolType !== 'District') return null;
  for (const field of CHARTER_ONLY_FIELDS) {
    if (row[field] !== null) {
      return { check: 'charter_only_fields_null_on_district', detail: `${field} is non-null on a District row` };
    }
  }
  return null;
};

// 8. unusedSeats == authorizedEnrollmentCap - currentEnrollment, when all three present.
const checkUnusedSeatsArithmetic: Check = (row) => {
  const { authorizedEnrollmentCap, currentEnrollment, unusedSeats } = row;
  if (authorizedEnrollmentCap === null || currentEnrollment === null || unusedSeats === null) {
    return null;
  }
  const expected = authorizedEnrollmentCap - currentEnrollment;
  if (expected !== unusedSeats) {
    return { check: 'unused_seats_arithmetic', detail: `expected ${expected}, got ${unusedSeats}` };
  }
  return null;
};

const CHECKS: Check[] = [
  checkKeyPresent,
  checkPercentRanges,
  checkRequiredFields,
  checkCountCrossCheck,
  checkBandAllowlist,
  checkExcludedNeverCharter,
  checkCharterOnlyFieldsNullOnDistrict,
  checkUnusedSeatsArithmetic,
];

export function validateSchoolRollupRows(rows: NormalizedSchoolRollupRow[]): ValidateResult {
  const validRows: ValidatedSchoolRollupRow[] = [];
  const skipped: SkippedRow[] = [];

  for (const row of rows) {
    let failure: CheckFailure | null = null;
    for (const check of CHECKS) {
      failure = check(row);
      if (failure) break;
    }

    if (failure) {
      console.warn(
        `school-rollup: skipping row (aun=${row.aun ?? '?'}, schoolNumber=${row.schoolNumber ?? '?'}) — failed check "${failure.check}": ${failure.detail}`,
      );
      skipped.push({ aun: row.aun, schoolNumber: row.schoolNumber, check: failure.check, detail: failure.detail });
      continue;
    }

    // Safe: checkKeyPresent + checkRequiredFields + checkCountCrossCheck having
    // all passed guarantees every field ValidatedSchoolRollupRow narrows is
    // non-null at this point.
    validRows.push(row as ValidatedSchoolRollupRow);
  }

  return { validRows, skipped };
}
