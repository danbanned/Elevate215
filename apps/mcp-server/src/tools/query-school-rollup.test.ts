import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const usageLogCreate = vi.fn();

// `tools.test.ts` (the other file in this repo's __tests__/) is a live-DB
// integration test spawning the actual MCP server — always skipped in this
// environment (no local Postgres available here). Mocking @lp-ai/lib-db
// directly, matching quickbooks-client.test.ts's pattern, gives a test that
// actually runs and passes rather than one permanently gated off.
vi.mock('@lp-ai/lib-db', () => ({
  prisma: {
    schoolRollup: {
      findMany: (...args: unknown[]) => findMany(...args),
    },
    usageLog: {
      create: (...args: unknown[]) => usageLogCreate(...args),
    },
    toolPermission: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

const { registerQuerySchoolRollup, buildSchoolRollupWhere, toSchoolOutput } = await import(
  './query-school-rollup.js'
);

// Minimal fake McpServer — just enough to capture the registered handler so
// it can be invoked directly, exercising the real runTool() wrapper (usage
// logging included) without spinning up a stdio transport.
function makeFakeServer() {
  let handler: ((input: unknown) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>) | null =
    null;
  return {
    registerTool: (_name: string, _config: unknown, fn: typeof handler) => {
      handler = fn;
    },
    callTool: async (input: unknown) => {
      if (!handler) throw new Error('tool not registered');
      const result = await handler(input);
      return JSON.parse(result.content[0]!.text);
    },
  };
}

function baseRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    aun: '126510015',
    schoolNumber: '7825',
    schoolName: 'AD PRIMA CS',
    districtName: 'AD PRIMA CS',
    schoolType: 'Charter',
    gradeSpan: 'K-8',
    pctBlackHispanic: '95.94',
    pctLowIncome: '92.74',
    excludedSelectionCriteria: false,
    pssaReadingNScored: 377,
    pssaReadingPctProficient: '37.4',
    pssaReadingPredicted: '17.39',
    pssaReadingResidual: '20.01',
    pssaReadingBand: 'Above Line (5+)',
    pssaMathNScored: 378,
    pssaMathPctProficient: '20.4',
    pssaMathPredicted: '8.64',
    pssaMathResidual: '11.76',
    pssaMathBand: 'Above Line (5+)',
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
    simpleAvgResidual: '15.9',
    enrollmentWeightedAvgResidual: '15.9',
    aboveLineCount: 2,
    within5Count: 0,
    belowLineCount: 0,
    testsWithData: 2,
    currentEnrollment: 617,
    authorizedEnrollmentCap: 700,
    unusedSeats: 83,
    fillTier: 'Fill-B',
    eapiTier: 'EAPI-A',
    ...overrides,
  };
}

describe('query_school_rollup tool', () => {
  beforeEach(() => {
    findMany.mockReset();
    usageLogCreate.mockReset();
  });

  it('returns the nested exams shape for a known school', async () => {
    findMany.mockResolvedValue([baseRow()]);
    const server = makeFakeServer();
    registerQuerySchoolRollup(server as never);

    const result = await server.callTool({ aun: '126510015', school_number: '7825' });

    expect(result.record_count).toBe(1);
    const school = result.schools[0];
    expect(school.aun).toBe('126510015');
    expect(school.school_number).toBe('7825');
    expect(school.exams.pssa_reading).toEqual({
      n_scored: 377,
      pct_proficient: 37.4,
      predicted: 17.39,
      residual: 20.01,
      band: 'Above Line (5+)',
    });
    expect(school.exams.keystone_algebra_i).toEqual({
      n_scored: null,
      pct_proficient: null,
      predicted: null,
      residual: null,
      band: null,
    });
    expect(school.fill_tier).toBe('Fill-B');

    // usage_logs written on this (successful) call.
    expect(usageLogCreate).toHaveBeenCalledTimes(1);
    expect(usageLogCreate.mock.calls[0]?.[0]).toMatchObject({ data: { toolName: 'query_school_rollup' } });
  });

  it('scopes performance_band to any of the 5 exam columns when `exam` is not given', () => {
    const where = buildSchoolRollupWhere({ performance_band: 'Below Line (5+)' });
    expect(where.OR).toEqual([
      { pssaReadingBand: 'Below Line (5+)' },
      { pssaMathBand: 'Below Line (5+)' },
      { keystoneAlgebraIBand: 'Below Line (5+)' },
      { keystoneBiologyBand: 'Below Line (5+)' },
      { keystoneLiteratureBand: 'Below Line (5+)' },
    ]);
  });

  it('scopes performance_band to a single exam column when `exam` is given', () => {
    const where = buildSchoolRollupWhere({ performance_band: 'Below Line (5+)', exam: 'keystone_biology' });
    expect(where.keystoneBiologyBand).toBe('Below Line (5+)');
    expect(where.OR).toBeUndefined();
  });

  it('the performance_band filter reaches Prisma correctly across a full tool call', async () => {
    findMany.mockResolvedValue([baseRow({ pssaMathBand: 'Within 5 pts' })]);
    const server = makeFakeServer();
    registerQuerySchoolRollup(server as never);

    await server.callTool({ performance_band: 'Within 5 pts' });

    const passedWhere = findMany.mock.calls[0]?.[0]?.where;
    expect(passedWhere.OR).toContainEqual({ pssaMathBand: 'Within 5 pts' });
    expect(passedWhere.OR).toContainEqual({ pssaReadingBand: 'Within 5 pts' });
  });

  it('toSchoolOutput converts Decimal-shaped percentage strings to plain numbers, not 0-1 scale', () => {
    const output = toSchoolOutput(baseRow() as never);
    expect(output.pct_black_hispanic).toBe(95.94);
    expect(output.pct_low_income).toBe(92.74);
  });
});
