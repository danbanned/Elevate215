# PHL School Performance Model — Data Dictionary (School Rollup tab)

Scope: the **School Rollup** tab only (301 rows, one per school), per Christian's original ingestion scope. Definitions below are pulled directly from the file's own **Read Me** tab wherever possible — most of what confused the team in the data-review meeting is actually already documented there. A few real gaps remain, compiled in the Open Questions section at the end.

**Note on the meeting transcript:** several terms that came through as unclear were very likely transcription errors, now resolved against the real headers — "ESSA reading" = **PSSA Reading** (the exam name), "field tier" = **Fill Tier**, "EAP tier" = **EAPI Tier**. Worth knowing so no one searches for a data source that doesn't exist.

---

## Identity / school metadata

| Column | Definition | Confidence |
|---|---|---|
| `AUN` | Administrative Unit Number — PA Dept. of Education's unique ID for the school's operating LEA (district or charter). | Confirmed (Read Me) |
| `SchoolNumber` | PDE's school-level identifier, unique within an AUN. | Confirmed (Read Me) |
| `DistrictName` | The LEA name. `SchoolType` is derived from this: `District` = "PHILADELPHIA CITY SD" exactly; every other value = `Charter` (each PA charter is its own LEA). | Confirmed (Read Me) |
| `SchoolName` | School's display name. | Confirmed |
| `SchoolType` | `District` or `Charter` — see above. | Confirmed (Read Me) |
| `GradeSpan_2025-26` | Grade range served (e.g. "K-8," "6-12"). Blank for at least the cyber charters not tracked in the district's demographics system (e.g. ASPIRA Bilingual Cyber CS). | Confirmed, with a known gap — see Open Questions |
| `PctBlackHispanic_2025-26` | Combined Black + Hispanic share of SY 2025-26 enrollment. Blank for 2 cyber charters not tracked in the district's demographics system. | Confirmed as "combined," exact combination method unclear — see Open Questions |
| `PctLowIncome_2025-26` | % Economically Disadvantaged, from PDE's 2025-26 Low-Income Percentage (LIP) file — **current** school year enrollment data, not the same year as the performance/test columns (see year-mismatch note below). | Confirmed (Read Me) |
| `ExcludedSelectionCriteria` | `True`/`False`. `True` = a District school with academic admission criteria (SDP "Criteria-Based" schools), excluded from the regression line calculation because its intake isn't representative of its neighborhood. Charters are never `True` — PA law requires lottery admission for all Philadelphia charters. **These schools are still present in the data**, just flagged and excluded from the statistical fit — not removed. See the `Excluded Schools` tab for the full list. | Confirmed (Read Me) |

---

## Per-exam columns (repeated 5x: PSSA Reading, PSSA Math, Keystone Algebra I, Keystone Biology, Keystone Literature)

Each exam has the same 5-column pattern:

| Column pattern | Definition | Confidence |
|---|---|---|
| `[Exam] — N Scored_2025` | Number of students who took that exam, Spring 2025 (school year 2024-25). | Confirmed (Read Me) |
| `[Exam] — PctProficient_2025` | % of test-takers scoring Proficient or Advanced ("Percent Proficient and above" — Proficient + Advanced combined, per prior client direction). | Confirmed (Read Me) |
| `[Exam] — Predicted` | The % Proficient this school *would be expected* to score, based on a single regression line fit across District + Charter schools together for that exam: `Predicted = Slope × (%EconDisadvantaged) + Intercept`. District and Charter schools are compared against the **same line**, not separate lines. | Confirmed (Read Me) |
| `[Exam] — Residual` | `Actual PctProficient − Predicted`. Positive = school outperformed what its economic-disadvantage rate would predict; negative = underperformed. **This is the core "did they beat expectations" metric.** Already calculated for us — the team should not recompute or second-guess this. | Confirmed (Read Me) |
| `[Exam] — Band` | Bucketed version of Residual: `Above Line (5+)` = residual ≥ +5 · `Within 5 pts` = residual between −5 and +5 · `Below Line (5+)` = residual ≤ −5 · `Excluded (Selection Criteria)` = this school's `ExcludedSelectionCriteria` = True, so it's not scored against the line at all for this exam. | Confirmed (Read Me) |

Keystone exams are Grade 11, "All Students" group. PSSA covers grades 3-8, "Total," "All Students." This detail matters if the team ever needs to explain why a K-8 school has PSSA data but no Keystone data (Keystone is high-school-only) — that's expected, not missing data.

---

## Rollup / summary columns

| Column | Definition | Confidence |
|---|---|---|
| `Simple Avg Residual` | Unweighted mean of the Residuals across whichever of the 5 exams this school has data for (schools without a high school won't have Keystone data, etc.). | Confirmed (Read Me) |
| `Enrollment-Weighted Avg Residual` | Same average, but weighted by each exam's `N Scored` — so a school's performance on a test with 300 kids counts more than one with 20. | Confirmed (Read Me) |
| `Above Line Count` / `Within 5 Count` / `Below Line Count` | Count of this school's exams falling into each Band category — a consistency check alongside the averages above. | Confirmed (Read Me) |
| `Tests With Data` | How many of the 5 possible exams this school actually has records for. | Confirmed (Read Me) |
| `Current Enrollment (SY 2025-26)` | Charter-only. Current enrollment, from the District's 2025-2026 Annual Charter Evaluation (ACE) Public File. Blank for District schools (caps only apply to charters) and for 3 charters not matched in the ACE file (see Open Questions). | Confirmed (Read Me) |
| `Authorized Enrollment Cap (SY 2025-26)` | Charter-only. The legal enrollment ceiling set for that charter, same ACE source. | Confirmed (Read Me) |
| `Unused Seats` | `Authorized Cap − Current Enrollment`. Negative = the charter is enrolled *above* its authorized cap. | Confirmed (Read Me) |
| `Fill Tier` | Charter-only, buckets `Unused Seats`: `Fill-A` = 100+ unused · `Fill-B` = 50-99 · `Fill-C` = 25-49. For charters with **fewer than 25** unused seats (little room to grow) but strong performance, shows `Expand-A`/`Expand-B` instead (see EAPI Tier) — flagging them as expansion candidates rather than fill candidates. Blank = under 25 unused seats *and* `EAPI-C` or no cap data. | Confirmed (Read Me) |
| `EAPI Tier` | Charter-only, buckets `Simple Avg Residual`: `EAPI-A` = above +5 · `EAPI-B` = within ±5 · `EAPI-C` = below −5. Always blank for District rows. | Confirmed (Read Me) |

---

## Open Questions (compiled — send as one list)

1. **`PctBlackHispanic_2025-26` — exact combination method.** The Read Me confirms this is "Black + Hispanic combined," but doesn't specify whether that's a union (avoiding double-counting a student who is both Black and Hispanic) or a simple sum of two separately-reported percentages (which could double-count and, in theory, exceed 100%). Worth confirming the exact calculation before we treat this as a clean demographic metric in reporting.

2. **Missing `GradeSpan` / demographic data for cyber charters.** A few cyber charters (e.g. ASPIRA Bilingual Cyber CS) are blank for GradeSpan and demographic fields because they're "not tracked in the district's demographics system." Should we leave these blank in our system too, or is there a supplemental source we should request specifically for cyber charters?

3. **3 unmatched charters in the Charter Unused Seats data.** ASPIRA Bilingual Cyber CS and Esperanza Cyber CS aren't covered by the District's ACE report at all (cyber charters are PDE-authorized, not District-authorized); Memphis Street Academy CS @ JP Jones wasn't found under any name in the ACE file. Should Fill Tier/EAPI Tier stay blank for these 3 indefinitely, or is there an alternate source we should chase down for enrollment/cap data specifically for them?

4. **Year mismatch between performance and demographic data — is this acceptable for your use case?** The Read Me flags this itself: performance data is Spring 2025 test results, but the %EconDisadvantaged and enrollment figures are current 2025-26 data — a full school year newer, since 2025-26 test results don't exist yet. This is described as "the standard approach," but we want explicit confirmation this is fine for grant-decision purposes, since it means a residual reflects last year's test performance compared to this year's demographics, not the same cohort's numbers in the same year.

5. **Should Fill Tier / EAPI Tier columns be hidden entirely for District rows in our dashboard**, since they're always blank there by design (caps only apply to charters) — or is a visible "N/A" preferable to a blank cell for clarity?

6. **Confirmation that `Excluded Schools` (selection-criteria District schools) should still appear in our system**, just flagged and excluded from any regression/prediction calculations we might build on top of this data later — versus being dropped from what Elevate215 can query entirely. Our current read of the Read Me is that they should stay in, flagged — please confirm.

---

*Prepared from the workbook's own "Read Me" tab. Where that tab didn't fully resolve something, it's listed above rather than guessed at.*
