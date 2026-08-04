# Google Sheets Connector — School Rollup

## Purpose

Loads school-level performance and enrollment data from the PHL School Performance Model into Postgres. **Scope is deliberately narrow: the "School Rollup" tab only** — the workbook has other tabs (Dashboard, Raw Data, Regression Stats, District Summary, Charter Summary, Excluded Schools, Charter Unused Seats) that this connector does not touch.

This connector previously synced a different client's program-specific sheets (students, outcomes, attendance, finance dashboards, a donor CRM — 12 spreadsheets in total). All of that was removed as part of restructuring this repo for Elevate215; only the generic Google Sheets API client (`sheets-client.ts`), error types (`errors.ts`), and CLI entrypoint (`cli.ts`) survived. Everything School Rollup-specific was built fresh.

## Source

**Option B (current): local Excel file.** The connector reads `connectors/google-sheets/data/phl-school-performance-model.xlsx` directly via the `xlsx` (SheetJS) library — no network call, no Google API credentials needed for this to work today.

**Option A (future): Google Sheets API.** The extract stage's file comment marks the swap point explicitly — `extractSchoolRollupRows()`'s signature and return shape (`{ headerRow, dataRows }` as `string[][]`) are what the clean/normalize/validate/load pipeline consumes, and none of those stages know or care where the rows came from. Swapping to the live API is a one-file change (rewrite `school-rollup-extract.ts` to call `sheets-client.ts`'s `getAllSheetRows()` instead of `XLSX.readFile()`), not a pipeline rewrite.

## ETL Pipeline

`connectors/google-sheets/src/`:

| File | Stage | Responsibility |
|---|---|---|
| `school-rollup-extract.ts` | Extract | Reads the "School Rollup" tab, returns header row + data rows as `string[][]`. Column 0 (`aun`) is read by **position**, never by header name — the sheet's actual header for that column is a malformed artifact (`" f"`), not `"AUN"`. |
| `school-rollup-clean.ts` | Clean | Trim whitespace, blank string → `null`, drop rows where both `aun` and `schoolNumber` are blank (the sheet's used-range extends ~700 rows past its 301 real rows), dedupe by `(aun, schoolNumber)` keeping the last-seen row. |
| `school-rollup-normalize.ts` | Normalize | Raw strings → typed values. Percentages are parsed as-is on a 0–100 scale (defensive `%`-suffix stripping exists but the real source data has never actually needed it). `aun`/`schoolNumber` have a defensive trailing-`.0` strip (`/^\d+\.0+$/` — only when the *entire* fractional part is zero) for when Option A's live-API `formattedValue` behavior may differ from this static export. `ExcludedSelectionCriteria` "TRUE"/"FALSE" strings (case-insensitive) → boolean. Every field is nullable at this stage regardless of the DB schema's own nullability — enforcing required fields is validate.ts's job, not this stage's. |
| `school-rollup-validate.ts` | Validate | 8 checks (see below). A failing row is logged and skipped, never thrown — one bad row never halts the sync. |
| `school-rollup-load.ts` | Load | `prisma.schoolRollup.upsert()` keyed on `(aun, schoolNumber)`. Per-row try/catch. Stale-row cleanup runs only after every upsert has been attempted, and a row counts as "seen" if it was attempted this run — not only if its upsert succeeded — so a transient write failure never also triggers deletion of that school's previously-good data. |
| `index.ts` | Orchestration | `sync()` calls the 5 stages in sequence inside `runSync('google-sheets', ...)`. |

## Validation Checks

Implementable without depending on unresolved client questions (see the dictionary's Open Questions section):

1. `aun` + `schoolNumber` both non-blank (the upsert key)
2. Percentages (`pctBlackHispanic`, `pctLowIncome`, all 5 `pctProficient` columns) fall within 0–100
3. Required fields non-null: `schoolName`, `districtName`, `schoolType`, `excludedSelectionCriteria`
4. Count cross-check: `aboveLineCount + within5Count + belowLineCount == testsWithData` — confirmed to hold with zero exceptions across all 301 real rows
5. Band allowlist: each populated Band column is one of the 4 known strings
6. `excludedSelectionCriteria = true` never co-occurs with `schoolType = "Charter"`
7. Charter-only fields (`currentEnrollment`, `authorizedEnrollmentCap`, `unusedSeats`, `fillTier`, `eapiTier`) are null on every District row
8. `unusedSeats == authorizedEnrollmentCap - currentEnrollment` where all three are present

Several other checks are explicitly **not** implemented because they'd require an answer to one of the dictionary's open questions (e.g. the exact Black+Hispanic combination method, or which specific schools should legitimately have blank cyber-charter data) — see [docs/data-sources/school-rollup-dictionary.md](school-rollup-dictionary.md) for the full list.

## Destination

`school_rollup` table — see [docs/database-schema.md](../database-schema.md) for the full column list.

## Sync Schedule

Manual: `pnpm sync:sheets`. Not yet wired to a recurring EventBridge schedule (that's `apps/sync`'s job once it's needed).

## Connector Location

`connectors/google-sheets/`

Key files:
- `src/sheets-client.ts` — generic Google Sheets API v4 wrapper (`getSheetRows`, `getAllSheetRows`, `listSheetTitles`, `getSheetGridDimensions`). No write functions. Not currently called by anything (kept ready for the Option A swap).
- `src/errors.ts` — generic error types, carried over unchanged from the original build
- `src/cli.ts` — entrypoint, unchanged shape from the original build
- `src/school-rollup-*.ts` — the 5 pipeline stages described above
- `src/index.ts` — orchestrates the pipeline, wraps in `runSync`
