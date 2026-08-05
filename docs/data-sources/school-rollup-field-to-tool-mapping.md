# School Rollup — Field → MCP Tool Mapping

Reference doc, not a spec change. Shows, for each of the 45 `school_rollup` fields, whether it's exposed on `query_school_rollup` (`apps/mcp-server/src/tools/query-school-rollup.ts`) as an **input filter**, an **output field**, both, or neither — so the team can see at a glance what's queryable today versus just stored and returned.

Column names below match [school-rollup-dictionary.md](school-rollup-dictionary.md)'s naming (the sheet's own headers) for cross-reference; the Prisma field name and the tool's JSON key are also given since all three differ slightly. Full input/output schemas: [docs/mcp-server-spec.md](../mcp-server-spec.md).

**Source of truth checked directly against code, not assumed:**
- Input filters: the `inputSchema` object and `buildSchoolRollupWhere()` in `query-school-rollup.ts`
- Output fields: `toSchoolOutput()` in the same file

## Summary

| Exposure | Count |
|---|---|
| Both (input filter + output field) | 13 |
| Output only (stored/returned, not filterable) | 32 |
| Neither | 0 — every field is at least returned in output |
| **Total** | **45** |

Every field is readable. The gap is entirely on the filter side: 32 of 45 fields can only be read back on a row you already found some other way (by name, AUN, tier, etc.) — they can't themselves narrow a search.

---

## Identity / school metadata (9 fields)

| Column | Prisma field | Tool key | Exposure | Notes |
|---|---|---|---|---|
| `AUN` | `aun` | `aun` | **Both** | Input: exact match. |
| `SchoolNumber` | `schoolNumber` | `school_number` | **Both** | Input: exact match. |
| `DistrictName` | `districtName` | `district_name` | **Both** | Input: substring, case-insensitive. |
| `SchoolName` | `schoolName` | `school_name` | **Both** | Input: substring, case-insensitive. |
| `SchoolType` | `schoolType` | `school_type` | **Both** | Input: exact match, `District` \| `Charter`. |
| `GradeSpan_2025-26` | `gradeSpan` | `grade_span` | Output only | No filter param exists — no current use case identified for filtering by grade span. |
| `PctBlackHispanic_2025-26` | `pctBlackHispanic` | `pct_black_hispanic` | Output only | No numeric threshold/range filter built (e.g. "≥ X%"). |
| `PctLowIncome_2025-26` | `pctLowIncome` | `pct_low_income` | Output only | Same — no numeric range filter built. |
| `ExcludedSelectionCriteria` | `excludedSelectionCriteria` | `excluded_selection_criteria` | **Both — asymmetric** | Input is `include_excluded` (default `true`): setting it `false` filters to `excludedSelectionCriteria = false` only. There is no way to request the inverse ("only excluded schools") through the tool today. |

---

## Per-exam columns (5 fields × 5 exams = 25 fields)

Same pattern for PSSA Reading, PSSA Math, Keystone Algebra I, Keystone Biology, Keystone Literature. Prisma field / tool key below use PSSA Reading as the example; substitute the exam name for the other four (tool output nests all five under `exams.<exam_key>`, per `EXAM_KEYS` in the tool).

| Column pattern | Prisma field pattern | Tool output key | Exposure | Notes |
|---|---|---|---|---|
| `[Exam] — N Scored_2025` | `pssaReadingNScored` | `exams.pssa_reading.n_scored` | Output only | No filter (e.g. "tested at least N students"). |
| `[Exam] — PctProficient_2025` | `pssaReadingPctProficient` | `exams.pssa_reading.pct_proficient` | Output only | No numeric threshold filter (e.g. "proficiency ≥ X%"). |
| `[Exam] — Predicted` | `pssaReadingPredicted` | `exams.pssa_reading.predicted` | Output only | No filter. |
| `[Exam] — Residual` | `pssaReadingResidual` | `exams.pssa_reading.residual` | Output only | No direct numeric filter on the raw residual — but its bucketed form (`Band`, below) *is* filterable. |
| `[Exam] — Band` | `pssaReadingBand` | `exams.pssa_reading.band` | **Both** | Input: `performance_band` (matches any of the 5 exams' bands) scoped to this exam via `exam: "pssa_reading"`. |

This 5-row pattern repeats identically for `pssa_math`, `keystone_algebra_i`, `keystone_biology`, and `keystone_literature` — 20 output-only fields (4 per exam × 5 exams) plus 5 `Both` Band fields.

---

## Rollup / summary columns (11 fields)

| Column | Prisma field | Tool key | Exposure | Notes |
|---|---|---|---|---|
| `Simple Avg Residual` | `simpleAvgResidual` | `simple_avg_residual` | Output only | Not directly filterable — but its bucketed form, `EAPI Tier` (below), is. |
| `Enrollment-Weighted Avg Residual` | `enrollmentWeightedAvgResidual` | `enrollment_weighted_avg_residual` | Output only | No filter, and no bucketed/derived version exists to filter by instead. |
| `Above Line Count` | `aboveLineCount` | `above_line_count` | Output only | No filter. |
| `Within 5 Count` | `within5Count` | `within_5_count` | Output only | No filter. |
| `Below Line Count` | `belowLineCount` | `below_line_count` | Output only | No filter. |
| `Tests With Data` | `testsWithData` | `tests_with_data` | Output only | No filter. |
| `Current Enrollment (SY 2025-26)` | `currentEnrollment` | `current_enrollment` | Output only | Charter-only field (see dictionary); no numeric filter built. |
| `Authorized Enrollment Cap (SY 2025-26)` | `authorizedEnrollmentCap` | `authorized_enrollment_cap` | Output only | Charter-only; no filter. |
| `Unused Seats` | `unusedSeats` | `unused_seats` | Output only | Not directly filterable — but its bucketed form, `Fill Tier` (below), is. |
| `Fill Tier` | `fillTier` | `fill_tier` | **Both** | Input: exact match, `Fill-A` \| `Fill-B` \| `Fill-C` \| `Expand-A` \| `Expand-B`. |
| `EAPI Tier` | `eapiTier` | `eapi_tier` | **Both** | Input: exact match, `EAPI-A` \| `EAPI-B` \| `EAPI-C`. |

---

## Pattern worth knowing: three fields are only filterable *through* their derived/bucketed sibling

- `[Exam] Residual` (raw number, 5 fields) → filterable only via `[Exam] Band` (`performance_band` + `exam`)
- `Simple Avg Residual` → filterable only via `EAPI Tier`
- `Unused Seats` → filterable only via `Fill Tier`

If a future request needs a numeric-threshold filter directly on a residual or unused-seats value (rather than the existing 3-4 bucket tiers), that's new work on `buildSchoolRollupWhere()` — not something already half-built and just undocumented.

---

*Generated by reading `query-school-rollup.ts`'s `inputSchema`, `buildSchoolRollupWhere()`, and `toSchoolOutput()` directly against the `SchoolRollup` Prisma model — not inferred from the tool's description text.*
