import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/lib-db';
import type { Prisma } from '@lp-ai/lib-db';

import { runTool, parseStr, parseNum } from '../tool-helpers.js';

const NAME = 'query_school_rollup';

const DESCRIPTION =
  'Look up school-level performance and enrollment data from the PHL School Performance Model School Rollup tab — PSSA/Keystone proficiency, predicted-vs-actual residuals, performance bands, and charter enrollment/fill-tier data for Philadelphia public and charter schools.';

const EXAM_KEYS = [
  'pssa_reading',
  'pssa_math',
  'keystone_algebra_i',
  'keystone_biology',
  'keystone_literature',
] as const;
type ExamKey = (typeof EXAM_KEYS)[number];

const PERFORMANCE_BANDS = [
  'Above Line (5+)',
  'Within 5 pts',
  'Below Line (5+)',
  'Excluded (Selection Criteria)',
] as const;

const inputSchema = {
  school_name: z.string().optional().describe('Substring match on school_name (case-insensitive).'),
  aun: z.string().optional().describe('Exact match.'),
  school_number: z.string().optional().describe('Exact match.'),
  district_name: z.string().optional().describe('Substring match on district_name (case-insensitive).'),
  school_type: z.enum(['District', 'Charter']).optional(),
  performance_band: z
    .enum(PERFORMANCE_BANDS)
    .optional()
    .describe('Matches if ANY of the 5 exam band columns equals this value, unless scoped by `exam`.'),
  exam: z
    .enum(EXAM_KEYS)
    .optional()
    .describe('Scopes performance_band to one specific exam instead of matching any of the 5.'),
  include_excluded: z
    .boolean()
    .optional()
    .describe('Default true. If false, excludes rows where excluded_selection_criteria = true.'),
  limit: z.number().optional().describe('Default 50, max 200.'),
};

type BandField =
  | 'pssaReadingBand'
  | 'pssaMathBand'
  | 'keystoneAlgebraIBand'
  | 'keystoneBiologyBand'
  | 'keystoneLiteratureBand';

const BAND_FIELD_BY_EXAM: Record<ExamKey, BandField> = {
  pssa_reading: 'pssaReadingBand',
  pssa_math: 'pssaMathBand',
  keystone_algebra_i: 'keystoneAlgebraIBand',
  keystone_biology: 'keystoneBiologyBand',
  keystone_literature: 'keystoneLiteratureBand',
};

// Prisma's Decimal fields come back as Decimal.js instances, not plain
// numbers — convert for a clean JSON number in the tool output (Decimal.js's
// valueOf()/toString() makes Number(...) parse it correctly either way).
function toNum(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

type SchoolRollupRow = Awaited<ReturnType<typeof prisma.schoolRollup.findMany>>[number];

function examBlock(
  nScored: number | null,
  pctProficient: unknown,
  predicted: unknown,
  residual: unknown,
  band: string | null,
): { n_scored: number | null; pct_proficient: number | null; predicted: number | null; residual: number | null; band: string | null } {
  return {
    n_scored: nScored,
    pct_proficient: toNum(pctProficient),
    predicted: toNum(predicted),
    residual: toNum(residual),
    band,
  };
}

export function toSchoolOutput(row: SchoolRollupRow): Record<string, unknown> {
  return {
    aun: row.aun,
    school_number: row.schoolNumber,
    school_name: row.schoolName,
    district_name: row.districtName,
    school_type: row.schoolType,
    grade_span: row.gradeSpan,
    pct_black_hispanic: toNum(row.pctBlackHispanic),
    pct_low_income: toNum(row.pctLowIncome),
    excluded_selection_criteria: row.excludedSelectionCriteria,
    exams: {
      pssa_reading: examBlock(
        row.pssaReadingNScored,
        row.pssaReadingPctProficient,
        row.pssaReadingPredicted,
        row.pssaReadingResidual,
        row.pssaReadingBand,
      ),
      pssa_math: examBlock(
        row.pssaMathNScored,
        row.pssaMathPctProficient,
        row.pssaMathPredicted,
        row.pssaMathResidual,
        row.pssaMathBand,
      ),
      keystone_algebra_i: examBlock(
        row.keystoneAlgebraINScored,
        row.keystoneAlgebraIPctProficient,
        row.keystoneAlgebraIPredicted,
        row.keystoneAlgebraIResidual,
        row.keystoneAlgebraIBand,
      ),
      keystone_biology: examBlock(
        row.keystoneBiologyNScored,
        row.keystoneBiologyPctProficient,
        row.keystoneBiologyPredicted,
        row.keystoneBiologyResidual,
        row.keystoneBiologyBand,
      ),
      keystone_literature: examBlock(
        row.keystoneLiteratureNScored,
        row.keystoneLiteraturePctProficient,
        row.keystoneLiteraturePredicted,
        row.keystoneLiteratureResidual,
        row.keystoneLiteratureBand,
      ),
    },
    simple_avg_residual: toNum(row.simpleAvgResidual),
    enrollment_weighted_avg_residual: toNum(row.enrollmentWeightedAvgResidual),
    above_line_count: row.aboveLineCount,
    within_5_count: row.within5Count,
    below_line_count: row.belowLineCount,
    tests_with_data: row.testsWithData,
    current_enrollment: row.currentEnrollment,
    authorized_enrollment_cap: row.authorizedEnrollmentCap,
    unused_seats: row.unusedSeats,
    fill_tier: row.fillTier,
    eapi_tier: row.eapiTier,
  };
}

export function buildSchoolRollupWhere(raw: Record<string, unknown>): Prisma.SchoolRollupWhereInput {
  const schoolName = parseStr(raw, 'school_name');
  const aun = parseStr(raw, 'aun');
  const schoolNumber = parseStr(raw, 'school_number');
  const districtName = parseStr(raw, 'district_name');
  const schoolType = parseStr(raw, 'school_type');
  const performanceBand = parseStr(raw, 'performance_band');
  const exam = parseStr(raw, 'exam') as ExamKey | undefined;
  const includeExcluded = typeof raw['include_excluded'] === 'boolean' ? (raw['include_excluded'] as boolean) : true;

  const where: Prisma.SchoolRollupWhereInput = {};
  if (schoolName) where.schoolName = { contains: schoolName, mode: 'insensitive' };
  if (aun) where.aun = aun;
  if (schoolNumber) where.schoolNumber = schoolNumber;
  if (districtName) where.districtName = { contains: districtName, mode: 'insensitive' };
  if (schoolType) where.schoolType = schoolType;
  if (!includeExcluded) where.excludedSelectionCriteria = false;

  if (performanceBand) {
    if (exam) {
      where[BAND_FIELD_BY_EXAM[exam]] = performanceBand;
    } else {
      where.OR = EXAM_KEYS.map(
        (key) => ({ [BAND_FIELD_BY_EXAM[key]]: performanceBand }) as Prisma.SchoolRollupWhereInput,
      );
    }
  }

  return where;
}

export function registerQuerySchoolRollup(server: McpServer): void {
  server.registerTool(
    NAME,
    { description: DESCRIPTION, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    (input) =>
      runTool(NAME, input, async () => {
        const raw = input as Record<string, unknown>;
        const limit = Math.min(parseNum(raw, 'limit') ?? 50, 200);
        const where = buildSchoolRollupWhere(raw);

        const rows = await prisma.schoolRollup.findMany({
          where,
          take: limit,
          orderBy: { schoolName: 'asc' },
        });

        return {
          record_count: rows.length,
          schools: rows.map(toSchoolOutput),
        };
      }),
  );
}
