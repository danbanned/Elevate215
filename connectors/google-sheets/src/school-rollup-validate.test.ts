import { describe, it, expect } from 'vitest';
import { validateSchoolRollupRows } from './school-rollup-validate.js';
import type { NormalizedSchoolRollupRow } from './school-rollup-normalize.js';

function baseDistrictRow(overrides: Partial<NormalizedSchoolRollupRow> = {}): NormalizedSchoolRollupRow {
  return {
    aun: 'AUN1',
    schoolNumber: 'SN1',
    districtName: 'PHILADELPHIA CITY SD',
    schoolName: 'Test District School',
    schoolType: 'District',
    gradeSpan: 'K-8',
    pctBlackHispanic: '50',
    pctLowIncome: '60',
    excludedSelectionCriteria: false,

    pssaReadingNScored: 100,
    pssaReadingPctProficient: '40',
    pssaReadingPredicted: '35',
    pssaReadingResidual: '5',
    pssaReadingBand: 'Above Line (5+)',

    pssaMathNScored: null,
    pssaMathPctProficient: null,
    pssaMathPredicted: null,
    pssaMathResidual: null,
    pssaMathBand: null,

    keystoneAlgebraINScored: null,
    keystoneAlgebraIPctProficient: null,
    keystoneAlgebraIPredicted: null,
    keystoneAlgebraIResidual: null,
    keystoneAlgebraIBand: null,

    keystoneBiologyNScored: null,
    keystoneBiologyPctProficient: null,
    keystoneBiologyPredicted: null,
    keystoneBiologyResidual: null,
    keystoneBiologyBand: null,

    keystoneLiteratureNScored: null,
    keystoneLiteraturePctProficient: null,
    keystoneLiteraturePredicted: null,
    keystoneLiteratureResidual: null,
    keystoneLiteratureBand: null,

    simpleAvgResidual: '5',
    enrollmentWeightedAvgResidual: '5',
    aboveLineCount: 1,
    within5Count: 0,
    belowLineCount: 0,
    testsWithData: 1,
    currentEnrollment: null,
    authorizedEnrollmentCap: null,
    unusedSeats: null,
    fillTier: null,
    eapiTier: null,
    ...overrides,
  };
}

function baseCharterRow(overrides: Partial<NormalizedSchoolRollupRow> = {}): NormalizedSchoolRollupRow {
  return baseDistrictRow({
    schoolType: 'Charter',
    currentEnrollment: 617,
    authorizedEnrollmentCap: 700,
    unusedSeats: 83,
    fillTier: 'Fill-B',
    eapiTier: 'EAPI-A',
    ...overrides,
  });
}

describe('validateSchoolRollupRows', () => {
  it('passes a fully valid District row through with no skips', () => {
    const { validRows, skipped } = validateSchoolRollupRows([baseDistrictRow()]);
    expect(validRows).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it('passes a fully valid Charter row through with no skips', () => {
    const { validRows, skipped } = validateSchoolRollupRows([baseCharterRow()]);
    expect(validRows).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it('check 1: skips a row missing both aun and schoolNumber', () => {
    const { validRows, skipped } = validateSchoolRollupRows([baseDistrictRow({ aun: null, schoolNumber: null })]);
    expect(validRows).toHaveLength(0);
    expect(skipped[0]?.check).toBe('key_present');
  });

  it('check 2: skips a row with a percentage out of 0-100 range', () => {
    const { validRows, skipped } = validateSchoolRollupRows([baseDistrictRow({ pctLowIncome: '145' })]);
    expect(validRows).toHaveLength(0);
    expect(skipped[0]?.check).toBe('percent_range');
  });

  it('check 3: skips a row missing a required field (schoolName)', () => {
    const { validRows, skipped } = validateSchoolRollupRows([baseDistrictRow({ schoolName: null })]);
    expect(validRows).toHaveLength(0);
    expect(skipped[0]?.check).toBe('required_fields');
  });

  it('check 4: skips a row where the count cross-check fails', () => {
    const { validRows, skipped } = validateSchoolRollupRows([baseDistrictRow({ testsWithData: 5 })]);
    expect(validRows).toHaveLength(0);
    expect(skipped[0]?.check).toBe('count_cross_check');
  });

  it('check 5: skips a row with a Band value outside the known allowlist', () => {
    const { validRows, skipped } = validateSchoolRollupRows([
      baseDistrictRow({ pssaReadingBand: 'Some Unexpected Value' }),
    ]);
    expect(validRows).toHaveLength(0);
    expect(skipped[0]?.check).toBe('band_allowlist');
  });

  it('check 6: skips a Charter row with excludedSelectionCriteria=true', () => {
    const { validRows, skipped } = validateSchoolRollupRows([
      baseCharterRow({ excludedSelectionCriteria: true }),
    ]);
    expect(validRows).toHaveLength(0);
    expect(skipped[0]?.check).toBe('excluded_never_charter');
  });

  it('check 7: skips a District row with a non-null charter-only field', () => {
    const { validRows, skipped } = validateSchoolRollupRows([
      baseDistrictRow({ fillTier: 'Fill-A' }),
    ]);
    expect(validRows).toHaveLength(0);
    expect(skipped[0]?.check).toBe('charter_only_fields_null_on_district');
  });

  it('check 8: skips a Charter row where unusedSeats does not match cap - enrollment', () => {
    const { validRows, skipped } = validateSchoolRollupRows([
      baseCharterRow({ unusedSeats: 999 }),
    ]);
    expect(validRows).toHaveLength(0);
    expect(skipped[0]?.check).toBe('unused_seats_arithmetic');
  });
});
