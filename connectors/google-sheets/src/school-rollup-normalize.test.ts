import { describe, it, expect } from 'vitest';
import {
  buildHeaderIndex,
  normalizeSchoolRollupRow,
  stripIntegerDecimal,
  parsePercentString,
  parseBoolOrNull,
} from './school-rollup-normalize.js';

// The real 45-column header row (confirmed against the actual source file),
// including the malformed " f" at index 0.
const HEADER_ROW = [
  ' f',
  'SchoolNumber',
  'DistrictName',
  'SchoolName',
  'SchoolType',
  'GradeSpan_2025-26',
  'PctBlackHispanic_2025-26',
  'PctLowIncome_2025-26',
  'ExcludedSelectionCriteria',
  'PSSA Reading — N Scored_2025',
  'PSSA Reading — PctProficient_2025',
  'PSSA Reading — Predicted',
  'PSSA Reading — Residual',
  'PSSA Reading — Band',
  'PSSA Math — N Scored_2025',
  'PSSA Math — PctProficient_2025',
  'PSSA Math — Predicted',
  'PSSA Math — Residual',
  'PSSA Math — Band',
  'Keystone Algebra I — N Scored_2025',
  'Keystone Algebra I — PctProficient_2025',
  'Keystone Algebra I — Predicted',
  'Keystone Algebra I — Residual',
  'Keystone Algebra I — Band',
  'Keystone Biology — N Scored_2025',
  'Keystone Biology — PctProficient_2025',
  'Keystone Biology — Predicted',
  'Keystone Biology — Residual',
  'Keystone Biology — Band',
  'Keystone Literature — N Scored_2025',
  'Keystone Literature — PctProficient_2025',
  'Keystone Literature — Predicted',
  'Keystone Literature — Residual',
  'Keystone Literature — Band',
  'Simple Avg Residual',
  'Enrollment-Weighted Avg Residual',
  'Above Line Count',
  'Within 5 Count',
  'Below Line Count',
  'Tests With Data',
  'Current Enrollment (SY 2025-26)',
  'Authorized Enrollment Cap (SY 2025-26)',
  'Unused Seats',
  'Fill Tier',
  'EAPI Tier',
];

describe('stripIntegerDecimal', () => {
  it('strips a trailing .0', () => {
    expect(stripIntegerDecimal('126510015.0')).toBe('126510015');
  });

  it('strips a trailing .00', () => {
    expect(stripIntegerDecimal('7825.00')).toBe('7825');
  });

  it('does not touch a genuine non-integer value', () => {
    expect(stripIntegerDecimal('37.4')).toBe('37.4');
  });

  it('does not touch a value with no decimal at all', () => {
    expect(stripIntegerDecimal('7825')).toBe('7825');
  });

  it('passes null through', () => {
    expect(stripIntegerDecimal(null)).toBeNull();
  });
});

describe('parsePercentString', () => {
  it('strips a trailing % sign and keeps the 0-100 scale', () => {
    expect(parsePercentString('45.2%')).toBe('45.2');
  });

  it('leaves an already-plain percentage untouched (the real source shape)', () => {
    expect(parsePercentString('37.4')).toBe('37.4');
  });

  it('never rescales — 45.2 stays 45.2, not 0.452', () => {
    const result = parsePercentString('45.2%');
    expect(Number(result)).toBe(45.2);
    expect(Number(result)).not.toBe(0.452);
  });

  it('passes null through', () => {
    expect(parsePercentString(null)).toBeNull();
  });
});

describe('parseBoolOrNull', () => {
  it('converts "TRUE" (the real sheet\'s actual casing) to true', () => {
    expect(parseBoolOrNull('TRUE')).toBe(true);
  });

  it('converts "FALSE" to false', () => {
    expect(parseBoolOrNull('FALSE')).toBe(false);
  });

  it('is case-insensitive ("True"/"False")', () => {
    expect(parseBoolOrNull('True')).toBe(true);
    expect(parseBoolOrNull('False')).toBe(false);
  });

  it('returns null (not false) for null input', () => {
    expect(parseBoolOrNull(null)).toBeNull();
  });

  it('returns null (not false) for an unrecognized value', () => {
    expect(parseBoolOrNull('maybe')).toBeNull();
  });
});

describe('normalizeSchoolRollupRow', () => {
  it('maps a full row correctly, including position-0 aun and float-stripping', () => {
    const headerIndex = buildHeaderIndex(HEADER_ROW);
    // Real values from the source file's first data row (AD PRIMA CS).
    const row = [
      '126510015.0', // aun, read by position, header is malformed
      '7825.0', // schoolNumber
      'AD PRIMA CS',
      'AD PRIMA CS',
      'Charter',
      'K-8',
      '95.94',
      '92.74',
      'FALSE',
      '377',
      '37.4',
      '17.39325055',
      '20.00674945',
      'Above Line (5+)',
      '378',
      '20.4',
      '8.6361149',
      '11.7638851',
      'Above Line (5+)',
      '', '', '', '', '', // Keystone Algebra I — no high school, no data
      '', '', '', '', '', // Keystone Biology
      '', '', '', '', '', // Keystone Literature
      '15.9',
      '15.9',
      '2',
      '0',
      '0',
      '2',
      '617',
      '700',
      '83',
      'Fill-B',
      'EAPI-A',
    ];

    const normalized = normalizeSchoolRollupRow(row, headerIndex);

    expect(normalized.aun).toBe('126510015');
    expect(normalized.schoolNumber).toBe('7825');
    expect(normalized.districtName).toBe('AD PRIMA CS');
    expect(normalized.schoolType).toBe('Charter');
    expect(normalized.excludedSelectionCriteria).toBe(false);
    expect(normalized.pssaReadingNScored).toBe(377);
    expect(normalized.pssaReadingPctProficient).toBe('37.4');
    expect(Number(normalized.pssaReadingPctProficient)).toBe(37.4); // 0-100 scale, not 0-1
    expect(normalized.pssaReadingBand).toBe('Above Line (5+)');
    expect(normalized.keystoneAlgebraINScored).toBeNull(); // no high school, no data — expected null, not 0
    expect(normalized.currentEnrollment).toBe(617);
    expect(normalized.fillTier).toBe('Fill-B');
  });

  it('throws if a named header the row depends on is missing from the header row', () => {
    const badHeaderIndex = buildHeaderIndex([' f', 'SchoolNumber']); // missing everything else
    expect(() => normalizeSchoolRollupRow(['1', '2'], badHeaderIndex)).toThrow(/DistrictName/);
  });
});
