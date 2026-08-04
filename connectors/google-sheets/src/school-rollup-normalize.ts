// Normalize stage: map a cleaned row (Array<string | null>, still positional)
// to a typed, named record matching the SchoolRollup Prisma model. Every field
// here is nullable regardless of the model's own nullability — enforcing
// required-field presence is validate.ts's job, not this stage's. This file
// only does type conversion, never business-rule rejection.
import type { CleanedRow } from './school-rollup-clean.js';

// Column 0's header is a malformed sheet artifact (" f") — read by position.
// Every other column has a real header and is looked up by name via
// buildHeaderIndex(), so column reordering upstream doesn't silently
// misalign data the way an all-positional mapping would.
const AUN_COL = 0;

export function buildHeaderIndex(headerRow: string[]): Map<string, number> {
  const index = new Map<string, number>();
  headerRow.forEach((header, i) => {
    if (i === AUN_COL) return; // no usable header here — always read positionally
    index.set(header, i);
  });
  return index;
}

function getByHeader(row: CleanedRow, headerIndex: Map<string, number>, header: string): string | null {
  const idx = headerIndex.get(header);
  if (idx === undefined) {
    throw new Error(`Expected column "${header}" not found in source sheet header row`);
  }
  return row[idx] ?? null;
}

// Strips a trailing ".0" (or ".00", etc.) ONLY when the entire fractional part
// is zero — e.g. "126510015.0" -> "126510015", but "126510015.5" is untouched.
// Guards against a blanket decimal strip mangling a genuine non-integer value.
export function stripIntegerDecimal(raw: string | null): string | null {
  if (raw === null) return null;
  return /^\d+\.0+$/.test(raw) ? raw.slice(0, raw.indexOf('.')) : raw;
}

// Strips a literal trailing "%" if present (defensive — the real source file
// has never actually shown a "%" suffix; percentages already arrive as plain
// 0-100-scale numeric strings like "37.4"). Never rescales 0-1 -> 0-100 or
// vice versa; the source is already on the 0-100 scale.
export function parsePercentString(raw: string | null): string | null {
  if (raw === null) return null;
  return raw.replace(/%\s*$/, '').trim();
}

function parseIntOrNull(raw: string | null): number | null {
  if (raw === null) return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

// Returns null (not false) for anything other than an exact TRUE/FALSE match,
// so validate.ts's required-field check can distinguish "genuinely false"
// from "missing/malformed" rather than this stage silently defaulting to false.
// The real sheet emits uppercase "TRUE"/"FALSE" (SheetJS's formatted-string
// rendering of a boolean cell) — matched case-insensitively to also tolerate
// "True"/"False" if the source ever varies.
export function parseBoolOrNull(raw: string | null): boolean | null {
  if (raw === null) return null;
  const upper = raw.trim().toUpperCase();
  if (upper === 'TRUE') return true;
  if (upper === 'FALSE') return false;
  return null;
}

export interface NormalizedSchoolRollupRow {
  aun: string | null;
  schoolNumber: string | null;
  districtName: string | null;
  schoolName: string | null;
  schoolType: string | null;
  gradeSpan: string | null;
  pctBlackHispanic: string | null;
  pctLowIncome: string | null;
  excludedSelectionCriteria: boolean | null;

  pssaReadingNScored: number | null;
  pssaReadingPctProficient: string | null;
  pssaReadingPredicted: string | null;
  pssaReadingResidual: string | null;
  pssaReadingBand: string | null;

  pssaMathNScored: number | null;
  pssaMathPctProficient: string | null;
  pssaMathPredicted: string | null;
  pssaMathResidual: string | null;
  pssaMathBand: string | null;

  keystoneAlgebraINScored: number | null;
  keystoneAlgebraIPctProficient: string | null;
  keystoneAlgebraIPredicted: string | null;
  keystoneAlgebraIResidual: string | null;
  keystoneAlgebraIBand: string | null;

  keystoneBiologyNScored: number | null;
  keystoneBiologyPctProficient: string | null;
  keystoneBiologyPredicted: string | null;
  keystoneBiologyResidual: string | null;
  keystoneBiologyBand: string | null;

  keystoneLiteratureNScored: number | null;
  keystoneLiteraturePctProficient: string | null;
  keystoneLiteraturePredicted: string | null;
  keystoneLiteratureResidual: string | null;
  keystoneLiteratureBand: string | null;

  simpleAvgResidual: string | null;
  enrollmentWeightedAvgResidual: string | null;
  aboveLineCount: number | null;
  within5Count: number | null;
  belowLineCount: number | null;
  testsWithData: number | null;
  currentEnrollment: number | null;
  authorizedEnrollmentCap: number | null;
  unusedSeats: number | null;
  fillTier: string | null;
  eapiTier: string | null;
}

export function normalizeSchoolRollupRow(
  row: CleanedRow,
  headerIndex: Map<string, number>,
): NormalizedSchoolRollupRow {
  const get = (header: string): string | null => getByHeader(row, headerIndex, header);

  return {
    aun: stripIntegerDecimal(row[AUN_COL] ?? null),
    schoolNumber: stripIntegerDecimal(get('SchoolNumber')),
    districtName: get('DistrictName'),
    schoolName: get('SchoolName'),
    schoolType: get('SchoolType'),
    gradeSpan: get('GradeSpan_2025-26'),
    pctBlackHispanic: parsePercentString(get('PctBlackHispanic_2025-26')),
    pctLowIncome: parsePercentString(get('PctLowIncome_2025-26')),
    excludedSelectionCriteria: parseBoolOrNull(get('ExcludedSelectionCriteria')),

    pssaReadingNScored: parseIntOrNull(get('PSSA Reading — N Scored_2025')),
    pssaReadingPctProficient: parsePercentString(get('PSSA Reading — PctProficient_2025')),
    pssaReadingPredicted: get('PSSA Reading — Predicted'),
    pssaReadingResidual: get('PSSA Reading — Residual'),
    pssaReadingBand: get('PSSA Reading — Band'),

    pssaMathNScored: parseIntOrNull(get('PSSA Math — N Scored_2025')),
    pssaMathPctProficient: parsePercentString(get('PSSA Math — PctProficient_2025')),
    pssaMathPredicted: get('PSSA Math — Predicted'),
    pssaMathResidual: get('PSSA Math — Residual'),
    pssaMathBand: get('PSSA Math — Band'),

    keystoneAlgebraINScored: parseIntOrNull(get('Keystone Algebra I — N Scored_2025')),
    keystoneAlgebraIPctProficient: parsePercentString(get('Keystone Algebra I — PctProficient_2025')),
    keystoneAlgebraIPredicted: get('Keystone Algebra I — Predicted'),
    keystoneAlgebraIResidual: get('Keystone Algebra I — Residual'),
    keystoneAlgebraIBand: get('Keystone Algebra I — Band'),

    keystoneBiologyNScored: parseIntOrNull(get('Keystone Biology — N Scored_2025')),
    keystoneBiologyPctProficient: parsePercentString(get('Keystone Biology — PctProficient_2025')),
    keystoneBiologyPredicted: get('Keystone Biology — Predicted'),
    keystoneBiologyResidual: get('Keystone Biology — Residual'),
    keystoneBiologyBand: get('Keystone Biology — Band'),

    keystoneLiteratureNScored: parseIntOrNull(get('Keystone Literature — N Scored_2025')),
    keystoneLiteraturePctProficient: parsePercentString(get('Keystone Literature — PctProficient_2025')),
    keystoneLiteraturePredicted: get('Keystone Literature — Predicted'),
    keystoneLiteratureResidual: get('Keystone Literature — Residual'),
    keystoneLiteratureBand: get('Keystone Literature — Band'),

    simpleAvgResidual: get('Simple Avg Residual'),
    enrollmentWeightedAvgResidual: get('Enrollment-Weighted Avg Residual'),
    aboveLineCount: parseIntOrNull(get('Above Line Count')),
    within5Count: parseIntOrNull(get('Within 5 Count')),
    belowLineCount: parseIntOrNull(get('Below Line Count')),
    testsWithData: parseIntOrNull(get('Tests With Data')),
    currentEnrollment: parseIntOrNull(get('Current Enrollment (SY 2025-26)')),
    authorizedEnrollmentCap: parseIntOrNull(get('Authorized Enrollment Cap (SY 2025-26)')),
    unusedSeats: parseIntOrNull(get('Unused Seats')),
    fillTier: get('Fill Tier'),
    eapiTier: get('EAPI Tier'),
  };
}
