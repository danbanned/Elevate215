// Load stage: upsert validated rows keyed on (aun, schoolNumber), then sweep
// stale rows — but only after every upsert has been attempted, never before
// (CLAUDE.md's sync safety rule: no deleteMany before upsert).
import { prisma } from '@lp-ai/lib-db';
import type { ValidatedSchoolRollupRow } from './school-rollup-validate.js';

export interface LoadResult {
  recordsUpserted: number;
  recordsSkipped: number;
  recordsDeleted: number;
}

function keyOf(row: { aun: string; schoolNumber: string }): string {
  return `${row.aun}::${row.schoolNumber}`;
}

export async function loadSchoolRollupRows(rows: ValidatedSchoolRollupRow[]): Promise<LoadResult> {
  // "Seen this run" is every row we attempted to load, not only the ones whose
  // upsert succeeded — a transient upsert failure for one school must not also
  // cause the stale-cleanup step below to delete that school's existing good
  // data from a prior successful run. Only a school genuinely absent from this
  // run's validated rows counts as stale.
  const seenKeys = new Set(rows.map(keyOf));

  let recordsUpserted = 0;
  let recordsSkipped = 0;

  for (const row of rows) {
    const data = {
      districtName: row.districtName,
      schoolName: row.schoolName,
      schoolType: row.schoolType,
      gradeSpan: row.gradeSpan,
      pctBlackHispanic: row.pctBlackHispanic,
      pctLowIncome: row.pctLowIncome,
      excludedSelectionCriteria: row.excludedSelectionCriteria,

      pssaReadingNScored: row.pssaReadingNScored,
      pssaReadingPctProficient: row.pssaReadingPctProficient,
      pssaReadingPredicted: row.pssaReadingPredicted,
      pssaReadingResidual: row.pssaReadingResidual,
      pssaReadingBand: row.pssaReadingBand,

      pssaMathNScored: row.pssaMathNScored,
      pssaMathPctProficient: row.pssaMathPctProficient,
      pssaMathPredicted: row.pssaMathPredicted,
      pssaMathResidual: row.pssaMathResidual,
      pssaMathBand: row.pssaMathBand,

      keystoneAlgebraINScored: row.keystoneAlgebraINScored,
      keystoneAlgebraIPctProficient: row.keystoneAlgebraIPctProficient,
      keystoneAlgebraIPredicted: row.keystoneAlgebraIPredicted,
      keystoneAlgebraIResidual: row.keystoneAlgebraIResidual,
      keystoneAlgebraIBand: row.keystoneAlgebraIBand,

      keystoneBiologyNScored: row.keystoneBiologyNScored,
      keystoneBiologyPctProficient: row.keystoneBiologyPctProficient,
      keystoneBiologyPredicted: row.keystoneBiologyPredicted,
      keystoneBiologyResidual: row.keystoneBiologyResidual,
      keystoneBiologyBand: row.keystoneBiologyBand,

      keystoneLiteratureNScored: row.keystoneLiteratureNScored,
      keystoneLiteraturePctProficient: row.keystoneLiteraturePctProficient,
      keystoneLiteraturePredicted: row.keystoneLiteraturePredicted,
      keystoneLiteratureResidual: row.keystoneLiteratureResidual,
      keystoneLiteratureBand: row.keystoneLiteratureBand,

      simpleAvgResidual: row.simpleAvgResidual,
      enrollmentWeightedAvgResidual: row.enrollmentWeightedAvgResidual,
      aboveLineCount: row.aboveLineCount,
      within5Count: row.within5Count,
      belowLineCount: row.belowLineCount,
      testsWithData: row.testsWithData,
      currentEnrollment: row.currentEnrollment,
      authorizedEnrollmentCap: row.authorizedEnrollmentCap,
      unusedSeats: row.unusedSeats,
      fillTier: row.fillTier,
      eapiTier: row.eapiTier,
    };

    try {
      await prisma.schoolRollup.upsert({
        where: { aun_schoolNumber: { aun: row.aun, schoolNumber: row.schoolNumber } },
        create: { aun: row.aun, schoolNumber: row.schoolNumber, ...data },
        update: data,
      });
      recordsUpserted++;
    } catch (err) {
      console.error(
        `school-rollup: upsert failed for (aun=${row.aun}, schoolNumber=${row.schoolNumber}) —`,
        err instanceof Error ? err.message : String(err),
      );
      recordsSkipped++;
    }
  }

  // Stale-row cleanup — only after every upsert above has been attempted.
  let recordsDeleted = 0;
  if (rows.length > 0) {
    const existing = await prisma.schoolRollup.findMany({
      select: { id: true, aun: true, schoolNumber: true },
    });
    const staleIds = existing.filter((r) => !seenKeys.has(keyOf(r))).map((r) => r.id);
    if (staleIds.length > 0) {
      const { count } = await prisma.schoolRollup.deleteMany({ where: { id: { in: staleIds } } });
      recordsDeleted = count;
    }
  }

  return { recordsUpserted, recordsSkipped, recordsDeleted };
}
