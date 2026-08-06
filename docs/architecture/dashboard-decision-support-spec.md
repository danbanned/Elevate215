# Elevate215 HQ Dashboard — Decision-Support Redesign Spec

**Version:** 1.0
**Date:** 2026-08-06
**Author:** Senior Integration Architect
**Status:** Draft for review — no implementation until Section 12 sequencing is agreed
**Applies to:** `apps/hq` (Next.js dashboard) + `apps/mcp-server` (TypeScript MCP) + `packages/etl` (Python)

---

## 0. Scope note and MVP flag

You asked for all nine pages including Grants. Per the standing project rule, **Grant Management and Development Analytics are out of MVP scope** and the client has not reversed that. I have specced Grants in Section 9, but with two conditions: it stays behind a feature flag (`FEATURE_GRANTS=false` by default), and no MCP tools backing it get built in this phase. The current Overview screenshot already shows "18 Grant Recommendations" and "Which schools haven't received funding in the last 2 years?" as live-looking content — that is exactly the kind of surface area that becomes an implicit commitment to the client. Ship the shell, not the substance, until scope changes in writing.

Everything else in this document is in scope.

---

## 1. The problem, stated precisely

The four screenshots share one failure mode: **they answer "what is the number?" and never "what should I do about it?"**

Look at the Overview page. It shows 74 schools Below Expected. That is a true, validated, correctly computed number. It is also completely inert. Stacy cannot click it, cannot act on it, and cannot tell from the page whether 74 is normal, alarming, better than last month, or concentrated in schools whose exam coverage is only partial. The number is presented with the same visual weight as "301 Schools" — a constant that will not change all year.

Three specific structural problems produce this:

**Problem 1 — The KPI strip is doing the wrong job.** Every page opens with five or six equally-weighted stat tiles. Equal weight communicates equal importance, which means nothing is important. Worse, the *same* tiles appear on Overview and School Rollup (301 / 48 / 179 / 74 / avg residual / EAPI tier), so the second page teaches Stacy that pages repeat rather than progress.

**Problem 2 — Insight and evidence are separated.** The Data Gaps card says "3 charter schools are missing enrollment cap data" and names them. Good. But it sits in a footer row, below the fold, visually subordinate to a table of 301 rows. Meanwhile the table itself renders `—` in those schools' cells with no explanation at the point of confusion. The finding and the place you notice the problem are in different parts of the page.

**Problem 3 — Nav taxonomy has drifted, and that drift is itself a usability bug.** Across four screenshots I count four different navigation structures:

| Screenshot | Nav items | User identity |
|---|---|---|
| School Rollup | Overview, Schools, Grants, Finance, Documents, Activity, Data Pipeline, School Rollup, Admin | Stacy Jones — Executive Director |
| Activity | Overview, Schools, Grants, Finance, Documents, Activity, Data Pipeline, Admin | Stacy Jones — Executive Director |
| Data Updates | Overview, Schools, Finance, Grants, Documents, AI Activity, Data Updates, Admin | Stacy **Johnson** — **Administrator** |
| Overview | Overview, Schools, Finance, Grants, Documents, AI Assistant, Data Pipeline, **Reports**, Admin | Stacy Jones — Executive Director |

Finance and Grants swap order. "Activity" / "AI Activity" and "Data Pipeline" / "Data Updates" are the same page under two names. "Reports" and "AI Assistant" exist on exactly one screen each. The user's surname and role differ across mockups. **Fix this before anything else in this document** — Section 2.1 gives the canonical structure. Inconsistent nav is the single cheapest usability defect to eliminate and the most expensive to leave in, because it silently teaches the user that the product is unreliable.

---

## 2. The design contract every page must satisfy

Rather than redesigning nine pages ad hoc, I am defining one **page contract**. A page is not shippable unless it answers all five questions below in its own markup. This is what makes the pages differentiated *and* consistent — same skeleton, radically different flesh.

### The Five-Zone Page Contract

```
┌─────────────────────────────────────────────────────────────┐
│ ZONE 0 — CONTEXT BAR                                        │
│ What data is this, how fresh, what caveat applies.          │
│ Always one line. Always the same position. Never a card.    │
├─────────────────────────────────────────────────────────────┤
│ ZONE 1 — THE DECISION                                       │
│ The single question this page exists to answer, and the     │
│ ranked, evidenced items that answer it right now.           │
│ Above the fold, always. Max 5 items. Each item has a verb.  │
├─────────────────────────────────────────────────────────────┤
│ ZONE 2 — THE WORKSPACE                                      │
│ The interactive surface where the user pursues Zone 1.      │
│ Unique per page. This is where pages differentiate.         │
├─────────────────────────────────────────────────────────────┤
│ ZONE 3 — THE EVIDENCE                                       │
│ Detail, drill-down, raw records. Present but subordinate.   │
│ Collapsed or drawer-based by default.                       │
├─────────────────────────────────────────────────────────────┤
│ ZONE 4 — THE TRUST FOOTER                                   │
│ Coverage, exclusions, method, "how to read this."           │
│ Never removed — it is what makes the page defensible in     │
│ front of a funder. Always collapsed by default.             │
└─────────────────────────────────────────────────────────────┘
```

**Why this works.** Zone 1 is the answer to your stated goal — "I know what I can do with this." Zone 4 is the answer to a goal you did not state but need — when Stacy shows this to a board member or a funder, she must be able to defend the number. The current design puts coverage and methodology in the same visual tier as the insight; the contract demotes it without deleting it.

**The rule that makes Zone 1 real:** *every Zone 1 item must contain a verb and a target.* "74 schools below expected" is not a Zone 1 item. "Review 6 below-expected charters that have grown enrollment anyway" is. If a proposed item cannot be phrased with a verb and a specific, countable target, it belongs in Zone 2 or Zone 3.

### 2.1 Canonical navigation

Adopt exactly this, in this order, everywhere:

| Order | Label | Route | MVP | Purpose in one line |
|---|---|---|---|---|
| 1 | Home | `/` | ✅ | Triage — what needs Stacy today |
| 2 | School Rollup | `/school-rollup` | ✅ | Analyze 301 schools, find engagement targets |
| 3 | Schools | `/schools` | ✅ | The record for one school over time |
| 4 | Finance | `/finance` | ✅ | Budget health and spending decisions |
| 5 | Documents | `/documents` | ✅ | Source evidence and what was extracted from it |
| 6 | Grants | `/grants` | off | Out of scope — route exists, nav entry hidden while the flag is off |
| 7 | AI Activity | `/activity` | ✅ | Can I trust and afford what the AI is doing |
| 8 | Data Pipeline | `/pipeline` | ✅ | Is the data underneath all of this current |
| 9 | Admin | `/admin` | ✅ | Who can see what, and what does it cost |

Decisions embedded here, each with rationale:

- **"Home" not "Overview."** Overview promises a summary of everything, which is what produced the metrics wall. Home promises a starting point.
- **School Rollup moves to position 2**, directly under Home. It is the dataset that is actually live and verified (301 schools, MCP tool working). Position in nav should reflect where the value currently is, not where the org chart is.
- **"Reports" is deleted as a page.** Reporting is not a destination, it is an export action from a context. A report built on Finance belongs on Finance. Section 11.3 replaces it with per-page Saved Views and Scheduled Briefs, which is strictly more useful and removes a page that would otherwise duplicate every other page's content.
- **"AI Assistant" is deleted as a page.** Per your instruction, chat lives on Home and School Rollup as an embedded panel. A standalone chat page is a chat with no context, which is the configuration most likely to produce a hallucinated answer — it is the one surface where Claude has no bound dataset and nothing to cite. Removing it is a safety improvement, not just a nav cleanup.
- **"Data Updates" is renamed "Data Pipeline"** and **"Activity" is renamed "AI Activity."** Pick one name each and never show the other.

---

## 3. The insight layer — architecture before UI

This is the most important architectural section in the document, and it is the one where the design can go badly wrong in a way that is expensive to unwind. Read it before Section 5.

### 3.1 The problem with "AI-generated insights"

The obvious way to build "actionable insights" is to ask Claude to look at the data and write the recommendations. **Do not do this.** It violates the Baby Bottle rule in a way that is subtle enough to slip through review.

Here is the failure. Claude generates "Belmont Charter High School is a strong expansion candidate." A dashboard renders it as a card. Stacy screenshots the card for a board deck. Three things are now true: the claim has no rule behind it, so it cannot be reproduced; it has no version, so when the underlying rule "changes" (because the model drifted or the prompt was edited) nobody knows; and it has entered a document that will outlive the session that produced it. The recommendation has become the source of truth. That is precisely the outcome the project rules exist to prevent — and the fact that the *input* data was validated does not save you, because the *reasoning* was not.

### 3.2 The correct architecture — a deterministic rules engine

Insights are computed in Python, stored in Postgres, versioned, and read by both the UI and the MCP server. Claude's job is to **explain, contextualize, and prioritize insights that already exist** — never to author them.

```
  Validated tables (school_rollup, finance_txn, sync_runs, tool_calls)
                          │
                          ▼
            ┌───────────────────────────┐
            │  Insight Rules Engine     │   packages/insights/  (Python)
            │  - versioned rule defs    │   Runs post-ETL, on every sync
            │  - pure functions         │   Deterministic. Unit-tested.
            │  - emits evidence, not    │   No LLM in this box. Ever.
            │    prose                  │
            └───────────┬───────────────┘
                        ▼
              ┌──────────────────┐
              │  insights table  │  ← single source of truth for Zone 1
              └────────┬─────────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
  Dashboard Zone 1              MCP: get_attention_queue()
  (renders rows verbatim)              │
                                       ▼
                                    Claude
                        (explains, groups, drafts narrative —
                         cites insight_id, never invents one)
```

**Tradeoff, stated honestly.** A rules engine is less flexible than an LLM. It will not notice a pattern nobody wrote a rule for. You are trading discovery for defensibility. For a platform whose output feeds grant and board decisions, that is the correct trade — and it is not a permanent one. The discovery path stays open through the chat panel, where Claude explores freely in a conversational context that is clearly not a system-of-record. When a chat exchange surfaces a pattern worth institutionalizing, it becomes a new rule. **Chat is the R&D lab; the rules engine is production.** That framing is worth stating to the client explicitly, because it explains why the AI feels constrained in one place and open in another.

### 3.3 The `insights` table

```sql
CREATE TYPE SEVERITY AS ENUM ('critical', 'action', 'watch', 'info');

CREATE TABLE insights (
    insight_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id             TEXT        NOT NULL,   -- e.g. 'R-SR-002'
    rule_version        TEXT        NOT NULL,   -- semver; bump on logic change
    severity            SEVERITY    NOT NULL,   -- 'critical'|'action'|'watch'|'info'
    entity_type         TEXT        NOT NULL,   -- 'school'|'account'|'connector'|'tool'|'org'
    entity_id           TEXT        NOT NULL,   -- AUN-SchoolNumber, account id, connector slug
    entity_label        TEXT        NOT NULL,   -- denormalized for render speed
    title               TEXT        NOT NULL,   -- <= 80 chars, must contain a verb
    detail              TEXT        NOT NULL,   -- 1-2 sentences, template-filled, NOT LLM
    recommended_action  TEXT        NOT NULL,   -- what Stacy does next
    action_route        TEXT,                   -- deep link, e.g. '/school-rollup?cohort=fill_a'
    evidence            JSONB       NOT NULL,   -- {field: value} pairs that triggered the rule
    priority_score      NUMERIC(6,2) NOT NULL,  -- for deterministic ranking, see 3.5
    source_data_asof    DATE        NOT NULL,   -- vintage of the data behind this
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    superseded_at       TIMESTAMPTZ,            -- set when a later run replaces it
    status              TEXT        NOT NULL DEFAULT 'open',  -- open|acknowledged|dismissed|resolved
    status_by           TEXT,
    status_at           TIMESTAMPTZ,
    status_note         TEXT,
    CONSTRAINT insights_title_len   CHECK (char_length(title) <= 80),
    CONSTRAINT insights_status_vals CHECK (status IN ('open','acknowledged','dismissed','resolved'))
);

CREATE UNIQUE INDEX insights_active_uq
    ON insights (rule_id, entity_type, entity_id)
    WHERE superseded_at IS NULL;

CREATE INDEX insights_queue_idx
    ON insights (status, priority_score DESC)
    WHERE superseded_at IS NULL AND status = 'open';
```

Three design points worth defending:

**`evidence` is JSONB, not prose.** Storing `{"eapi_tier":"EAPI-A","unused_seats":112,"fill_tier":"Fill-A","simple_avg_residual":8.7}` rather than a sentence means the UI can render evidence as chips, the MCP can hand Claude structured facts, and a rule change does not require regenerating text. `detail` is a Python format-string fill from `evidence`, never free text.

**`superseded_at` rather than delete.** Insights must be historically auditable — "why did we engage this school in August?" is a question the platform should answer six months later. Soft-supersede also lets you diff insight sets between syncs, which is what powers the Home page's "what changed" feed.

**`status` is user-settable and survives regeneration.** If Stacy dismisses an insight and the next sync recomputes the same rule for the same entity, the dismissal carries forward via `(rule_id, entity_type, entity_id)`. Nothing is more corrosive to trust in an attention queue than an item you dismissed reappearing tomorrow.

### 3.4 Rule catalogue

**Severity glyph legend — used consistently in every mockup and in the UI:**

| Glyph | Severity | Meaning |
|:---:|---|---|
| ⛔ | `critical` | Something is broken or non-compliant. Acting late has a cost. |
| ▲ | `action` | A decision is available now and worth making. |
| ● | `watch` | Worth knowing; no action required this week. |
| ⓘ | `info` | Context or a known gap. Explains a blank, never demands a response. |

One non-severity marker also appears in the mockups and must not be confused with the four above: **⚠** is a *coverage or context caveat* rendered by Zone 0 or Zone 2 — a data-vintage note, a scope disclaimer, a tier-unconfirmed banner. It never originates from the rules engine and never appears inside an `<InsightCard />`. Keeping it visually distinct from `⛔` is what stops a permanent, expected caveat from reading as an unresolved alarm.

Every rule below is derived from fields confirmed in `school-rollup-dictionary.md`. Two rules do lean on fields with unresolved definitions — `R-SR-006` on `GradeSpan_2025-26` (blank for cyber charters, dictionary Q2) and any future demographic rule on `PctBlackHispanic_2025-26` (combination method unconfirmed, dictionary Q1). Those carry reduced `confidence` and render a method-unconfirmed chip rather than being excluded or silently trusted; the six unresolved dictionary items are handled either as explicit *data-gap* rules or as reduced-confidence inputs (Section 3.5), never silently baked into a score as though settled.

#### School Rollup rules (ranked recommendations — full opinionation)

| Rule | Trigger | Severity | Recommended action |
|---|---|---|---|
| `R-SR-001` **Expansion candidate** | `EAPI Tier = 'EAPI-A'` AND `0 <= Unused Seats < 25` AND cap data present | action | Engage for expansion — strong performance, no room to grow under current cap |
| `R-SR-002` **High-performing fill candidate** | `EAPI Tier IN ('EAPI-A','EAPI-B')` AND `Fill Tier = 'Fill-A'` (100+ unused) | action | Engage on enrollment — proven results, 100+ seats unfilled |
| `R-SR-003` **Enrolled above cap** | `Unused Seats < 0` | critical | Verify with authorizer — school is enrolled above its authorized ceiling |
| `R-SR-004` **Underperforming at scale** | `EAPI Tier = 'EAPI-C'` AND `Current Enrollment (SY 2025-26) >= 500` | action | Prioritize for support — largest student counts in the lowest performance tier |
| `R-SR-005` **Subject divergence** | `MAX(residual) - MIN(residual) >= 15` across exams with data | watch | Investigate subject-level gap — strong in one exam, weak in another |
| `R-SR-006` **Incomplete exam coverage** | `Tests With Data < expected_for_grade_span` | info | Confirm whether missing exams are structural (K-8 has no Keystone) or a data gap |
| `R-SR-007` **Missing capacity data** | `SchoolType = 'Charter'` AND `Authorized Enrollment Cap (SY 2025-26) IS NULL` | info | Cannot assess fill/expansion — chase alternate source (open dictionary Q3) |
| `R-SR-008` **Excluded from line** | `ExcludedSelectionCriteria = TRUE` | info | Criteria-based admission — present in data, excluded from regression by design |

Note on `R-SR-006`: `expected_for_grade_span` is derived, not guessed. PSSA covers grades 3–8; Keystone is grade 11. A K-8 school is *expected* to have 2 exams, a 9-12 school 3, a K-12 school 5. Without this derivation the rule would fire on every elementary school in the city, which is the classic way an insight feed becomes noise and gets ignored within a week.

Note on `R-SR-001` and `R-SR-003`: the lower bound `0 <= Unused Seats` on `R-SR-001` is what keeps them mutually exclusive. Without it, every over-cap A-tier charter would fire both — flagged simultaneously as *critical: verify with authorizer* and *action: engage for expansion*, which is the fastest way to make a queue look untrustworthy. Equivalently, `R-SR-001` can be expressed as `Fill Tier IN ('Expand-A','Expand-B')`, which is the dictionary's own encoding of the same condition.

Note on `R-SR-008`: this is deliberately `info` severity and exists only so the flag renders inline in the table at the point of confusion, rather than as a separate finding. Our current read of the Read Me is that these schools stay in the system, flagged rather than dropped — but that is dictionary open question 6 and is still awaiting client confirmation.

#### Finance rules (ranked recommendations)

| Rule | Trigger | Severity | Recommended action |
|---|---|---|---|
| `R-FIN-001` **Category variance** | Actual vs. budget for a category exceeds ±15% at >50% of period elapsed | action | Review category — spending is off plan with time remaining to correct |
| `R-FIN-002` **Spend anomaly** | Month's category total > 2σ above trailing 6-month mean, min 3 months history | watch | Investigate — unusual spike vs. this category's own history |
| `R-FIN-003` **Runway** | Unrestricted cash ÷ trailing-3-month burn < 6 months | critical | Escalate — projected runway below six months |
| `R-FIN-004` **Uncategorized volume** | Uncategorized transactions > 5% of period value | action | Categorize before reporting — a material share of spend is unclassified |
| `R-FIN-005` **Stale authorization** | QuickBooks refresh token expires within 14 days | critical | Re-authorize — sync will fail silently after expiry |

`R-FIN-002` requires minimum history and is suppressed until six months of QuickBooks data exists. Firing a "2σ anomaly" against two months of data is statistically meaningless and will burn the user's trust in the anomaly feed permanently. Ship the rule disabled with an explicit `insufficient_history` state in the UI.

#### Pipeline rules (anomaly flags only — no recommendations)

| Rule | Trigger | Severity | Recommended action |
|---|---|---|---|
| `R-PIPE-001` **Stale source** | `now() - last_successful_sync > 24h` | action | Check connector — per the 24h green/amber threshold proposed in `Updated itsystem  1.pdf` |
| `R-PIPE-002` **Record-count drop** | Row count fell >5% vs. previous successful sync | critical | Hold downstream reporting — source may be truncated |
| `R-PIPE-003` **Silent record skips** | `sync_runs.records_failed > 0` on a run marked successful | critical | Review skipped records — sync reported success while dropping rows |
| `R-PIPE-004` **Never-synced source** | Connector configured, zero successful runs | action | Complete setup — connector is registered but has never delivered data |
| `R-PIPE-005` **Schema drift** | Expected header absent or new header appeared in source sheet | critical | Reconcile schema before next load |

**`R-PIPE-003` is the single highest-value rule in this document.** Julien's validation review identified exactly this gap: *"failed-record counts aren't surfaced in sync reporting — a sync can look successful while records were silently skipped."* Today the Data Updates page shows "Healthy / 301 schools" with no way to know whether 301 is all of them or 301 out of 340 with 39 quietly dropped. That is a validated-looking number that is not validated, which is worse than an obvious error. This rule, plus the three-column schema change in Sections 4.8 and 10.3, closes it.

#### Documents rules (anomaly flags only)

| Rule | Trigger | Severity | Recommended action |
|---|---|---|---|
| `R-DOC-001` **Unprocessed upload** | Document present >24h with no completed extraction | action | Process or remove — uploaded but never read by the platform |
| `R-DOC-002` **Low-confidence extraction** | Extraction confidence below threshold on a linked entity | watch | Verify manually before citing |
| `R-DOC-003` **Document contradicts rollup** | Extracted enrollment/grade-span claim conflicts with the linked school's validated record | watch | Reconcile — narrative and data disagree |

`R-DOC-003` is the one worth building carefully. It never overwrites anything; it raises a human-readable conflict between a narrative source and a validated one. That is the only safe way a PDF gets to influence anything on this platform.

#### AI Activity rules (anomaly flags only)

| Rule | Trigger | Severity | Recommended action |
|---|---|---|---|
| `R-ACT-001` **Tool error spike** | Tool error rate >5% over trailing 24h, min 20 calls | action | Investigate tool — failures above normal |
| `R-ACT-002` **Budget pace** | Projected month-end spend > monthly cap | watch | Review usage — on pace to exceed budget |
| `R-ACT-003` **Repeated query** | Same normalized question asked ≥5× in 7 days | info | Promote to a saved view — this question should be a permanent tile |
| `R-ACT-004` **Latency regression** | p95 response time >2× trailing 7-day p95 | watch | Check MCP server health |
| `R-ACT-005` **Unanswerable pattern** | ≥3 questions in 7 days returning no-tool-match | info | Consider a new MCP tool — users are asking for data no tool exposes |

`R-ACT-003` and `R-ACT-005` are the ones that make this page earn its place. They convert a passive log into a product-roadmap signal: the questions Stacy repeats should become tiles, and the questions the platform cannot answer should become tools. No other page produces that feedback.

### 3.5 Deterministic ranking

`priority_score` must be reproducible — two runs on identical data must produce identical order, and the ordering must be explainable to a client who asks "why is this one first?"

```python
# packages/insights/scoring.py

SEVERITY_WEIGHT: Final[dict[Severity, float]] = {
    "critical": 1000.0,
    "action":    500.0,
    "watch":     200.0,
    "info":       50.0,
}

def priority_score(
    severity: Severity,
    reach: int,               # students affected, or dollars/1000, or records affected
    confidence: float,        # 0.0-1.0, lowered when the rule leans on gappy fields
    staleness_days: int,      # age of the underlying data
) -> Decimal:
    """Deterministic priority. Pure function — no clock, no randomness, no I/O.

    reach is log-scaled so a 2,000-student school does not permanently bury
    every 200-student school; magnitude should tilt the ranking, not own it.
    """
    base = SEVERITY_WEIGHT[severity]
    reach_factor = math.log10(max(reach, 1) + 1)          # 0.0 .. ~3.3
    staleness_penalty = min(staleness_days * 0.5, 50.0)   # capped
    raw = (base * confidence) + (reach_factor * 25.0) - staleness_penalty
    # Clamp: an old, low-confidence info item must still sort last, never negative.
    return Decimal(max(raw, 0.0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
```

`confidence` is where the open dictionary questions get honestly represented. A rule that depends on `PctBlackHispanic_2025-26` — whose exact combination method is still unconfirmed (dictionary open question 1) — carries `confidence=0.7` and the UI renders a "method unconfirmed" chip on its evidence row. This is preferable to either dropping the field or pretending it is settled. Confidence values live in the rule definition, are reviewed in code review, and rise to 1.0 when the client confirms.
---

## 4. MCP tool contracts

Per the MCP-first rule, these are defined before any UI code. Every Zone 1 block and every chat capability in Sections 5–10 binds to a tool listed here. If a proposed UI element has no tool, it does not get built.

### 4.1 Permission model

Four roles, six scopes. Scopes are checked in the MCP server middleware before the tool handler runs, and the same scope set gates the dashboard route.

| Scope | `exec` (Stacy) | `program_staff` | `finance_staff` | `admin` |
|---|:---:|:---:|:---:|:---:|
| `rollup:read` | ✅ | ✅ | — | ✅ |
| `finance:read` | ✅ | — | ✅ | ✅ |
| `documents:read` | ✅ | ✅ | ✅ | ✅ |
| `pipeline:read` | ✅ | ✅ | ✅ | ✅ |
| `activity:read` | ✅ | — | — | ✅ |
| `admin:write` | — | — | — | ✅ |

> **Naming caution, flagged deliberately.** The scope `finance:read` above is an **internal Elevate215 MCP scope** and has nothing to do with QuickBooks. Rob's app displayed "Finance tools require the `finance:read` scope" in a way that read as a QuickBooks OAuth scope — it is not one; the real Intuit scope is `com.intuit.quickbooks.accounting`. Keep the two clearly separated in code and in docs. Suggest namespacing ours as `e215.finance:read` in the token claim to make the confusion structurally impossible.

Every tool call is written to `tool_calls` (Section 11.1) with `user_id`, `role`, `tool_name`, `args_hash`, `rows_returned`, `latency_ms`, `tokens_in`, `tokens_out`, `status`, `error_class`. No exceptions, including failed permission checks — a denied call is exactly the event an audit needs.

### 4.2 `get_attention_queue`

The tool that powers Zone 1 on every page. One tool, scoped by surface, rather than nine page-specific tools — this is the "generic integration, not one-off feature" principle. Adding a tenth page later requires a new `surface` enum value and zero new tools.

```typescript
// apps/mcp-server/src/tools/get_attention_queue.ts

export const GetAttentionQueueInput = z.object({
  surface: z.enum([
    'home', 'school_rollup', 'schools', 'finance',
    'documents', 'activity', 'pipeline',
  ]).describe('Which page is requesting. Filters which rule families apply.'),
  min_severity: z.enum(['critical', 'action', 'watch', 'info']).default('watch'),
  entity_id: z.string().max(64).optional()
    .describe('Scope to one entity — e.g. a single school on the Schools page.'),
  include_dismissed: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(5),
}).strict();

export const GetAttentionQueueOutput = z.object({
  as_of: z.string().datetime(),
  degraded: z.boolean().default(false)
    .describe('True when the last rules run is stale; items are still returned.'),
  degraded_reason: z.string().nullable().default(null),
  source_data_asof: z.record(z.string(), z.string())
    .describe('Per-source data vintage, e.g. {"school_rollup":"2025-06-15"}'),
  total_open: z.number().int(),
  returned: z.number().int(),
  suppressed_count: z.number().int()
    .describe('Open insights below min_severity or dismissed. Shown as "N more".'),
  items: z.array(z.object({
    insight_id: z.string().uuid(),
    rule_id: z.string(),
    rule_version: z.string(),
    severity: z.enum(['critical', 'action', 'watch', 'info']),
    title: z.string().max(80),
    detail: z.string(),
    recommended_action: z.string(),
    action_route: z.string().nullable(),
    entity: z.object({
      type: z.string(),
      id: z.string(),
      label: z.string(),
    }),
    evidence: z.array(z.object({
      field: z.string(),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      unit: z.string().nullable(),
      confidence_note: z.string().nullable()
        .describe('Non-null when the field has an unresolved definition question.'),
    })),
    priority_score: z.number(),
    source_data_asof: z.string(),
    status: z.enum(['open', 'acknowledged', 'dismissed', 'resolved']),
  })),
}).strict();
```

| Property | Value |
|---|---|
| **Scope required** | Derived from `surface`: `home` → any read scope; `school_rollup`/`schools` → `rollup:read`; `finance` → `finance:read`; `documents` → `documents:read`; `activity` → `activity:read`; `pipeline` → `pipeline:read` |
| **Validation** | Zod `.strict()` parsed at the request boundary, not field-by-field extraction — this closes the Layer 2 gap in Julien's review, where schemas existed for typing and documentation but were not enforced at request time |
| **Side effects** | None. Read-only. |
| **Errors** | `E_SCOPE_DENIED` (403, logged with user+scope), `E_INVALID_INPUT` (400, returns the Zod issue path), `E_INSIGHTS_STALE` (200 with `degraded: true` when the last rules run is >48h old — never a hard failure; a stale queue with a warning beats an empty page) |
| **Rate limit** | 60/min/user |

**Example prompts this supports:**
- "What needs my attention today?"
- "Anything critical I've missed this week?"
- "Why is Belmont Charter flagged?"
- "Show me only the finance items."

### 4.3 `query_school_rollup` (extend existing)

Already live. Extend rather than replace — the existing tool works and is verified against 301 rows.

```typescript
export const QuerySchoolRollupInput = z.object({
  // --- existing ---
  school_name: z.string().max(200).optional(),
  school_type: z.enum(['District', 'Charter']).optional(),
  limit: z.number().int().min(1).max(301).default(50),

  // --- new: cohort filters, mirroring the UI's Lens control ---
  eapi_tier:  z.array(z.enum(['EAPI-A', 'EAPI-B', 'EAPI-C'])).optional(),
  fill_tier:  z.array(z.enum(['Fill-A', 'Fill-B', 'Fill-C', 'Expand-A', 'Expand-B'])).optional(),
  band:       z.array(z.enum(['Above Line (5+)', 'Within 5 pts',
                              'Below Line (5+)', 'Excluded (Selection Criteria)'])).optional(),
  grade_span_contains: z.enum(['K', 'elementary', 'middle', 'high']).optional(),
  min_residual: z.number().min(-100).max(100).optional(),
  max_residual: z.number().min(-100).max(100).optional(),
  min_unused_seats: z.number().int().optional(),
  max_unused_seats: z.number().int().optional(),
  min_enrollment: z.number().int().min(0).optional(),
  max_enrollment: z.number().int().min(0).optional(),
  min_subject_divergence: z.number().min(0).max(200).optional()
    .describe('MAX(residual) - MIN(residual) across exams with data.'),
  missing_capacity_data: z.boolean().optional()
    .describe('true = only schools with no cap/enrollment record.'),
  missing_demographics: z.boolean().optional(),
  min_pct_low_income: z.number().min(0).max(100).optional(),
  exam: z.enum(['PSSA Reading', 'PSSA Math', 'Keystone Algebra I',
                'Keystone Biology', 'Keystone Literature']).optional()
    .describe('Rank by this exam residual instead of Simple Avg Residual.'),
  include_excluded: z.boolean().default(true)
    .describe('Selection-criteria schools stay in results by default, flagged.'),
  sort_by: z.enum(['simple_avg_residual', 'enrollment_weighted_avg_residual',
                   'unused_seats', 'pct_low_income', 'school_name']).default('simple_avg_residual'),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
}).strict()
  .refine(v => !(v.min_residual != null && v.max_residual != null && v.min_residual > v.max_residual),
          { message: 'min_residual must be <= max_residual', path: ['min_residual'] })
  .refine(v => !(v.min_unused_seats != null && v.max_unused_seats != null
                 && v.min_unused_seats > v.max_unused_seats),
          { message: 'min_unused_seats must be <= max_unused_seats', path: ['min_unused_seats'] })
  .refine(v => !(v.min_enrollment != null && v.max_enrollment != null
                 && v.min_enrollment > v.max_enrollment),
          { message: 'min_enrollment must be <= max_enrollment', path: ['min_enrollment'] })
  .refine(v => !(v.missing_capacity_data === true && v.min_unused_seats != null),
          { message: 'cannot filter on unused seats while requesting rows that have none',
            path: ['missing_capacity_data'] });
```

The `.refine()` is cross-field validation — the other Layer 2 gap Julien flagged (no start-before-end or dependent-field logic). Add one to every tool where two inputs can contradict each other.

Output adds a mandatory envelope that all data tools share:

```typescript
export const RollupEnvelope = z.object({
  as_of: z.object({
    test_scores: z.literal('Spring 2025'),
    enrollment_and_income: z.literal('SY 2025-26'),
    vintage_note: z.string().describe('The year-mismatch disclosure, verbatim.'),
  }),
  coverage: z.object({
    total_in_source: z.number().int().describe('Rows present in the source sheet.'),
    matched: z.number().int().describe('Rows loaded and queryable.'),
    unmatched_in_source: z.number().int()
      .describe('Rows in source that failed to load. matched + unmatched == total_in_source.'),
    excluded_selection_criteria: z.number().int()
      .describe('Loaded and returned, but excluded from the regression line by design.'),
    unassessable_capacity: z.number().int()
      .describe('Loaded and returned, but no cap/enrollment record — fill/expand cannot be scored.'),
    missing_cap_data: z.array(z.string()).describe('School names, not IDs — for display.'),
  }),
  row_count: z.number().int(),
  filters_applied: z.record(z.string(), z.unknown()),
  rows: z.array(SchoolRollupRow),
}).strict();
```

`SchoolRollupRow` is the one schema worth writing out in full, since every other rollup surface derives from it:

```typescript
export const SchoolRollupRow = z.object({
  school_id: z.string(),                    // AUN-SchoolNumber composite
  aun: z.string(),
  school_number: z.string(),
  school_name: z.string(),
  district_name: z.string(),
  school_type: z.enum(['District', 'Charter']),
  grade_span: z.string().nullable(),        // null for untracked cyber charters
  pct_black_hispanic: z.number().nullable(),
  pct_low_income: z.number().nullable(),
  excluded_selection_criteria: z.boolean(),
  exams: z.array(z.object({
    exam: z.enum(['PSSA Reading', 'PSSA Math', 'Keystone Algebra I',
                  'Keystone Biology', 'Keystone Literature']),
    n_scored: z.number().int().nullable(),
    pct_proficient: z.number().nullable(),
    predicted: z.number().nullable(),
    residual: z.number().nullable(),
    band: z.enum(['Above Line (5+)', 'Within 5 pts',
                  'Below Line (5+)', 'Excluded (Selection Criteria)']).nullable(),
  })),
  simple_avg_residual: z.number().nullable(),
  enrollment_weighted_avg_residual: z.number().nullable(),
  above_line_count: z.number().int(),
  within_5_count: z.number().int(),
  below_line_count: z.number().int(),
  tests_with_data: z.number().int(),
  current_enrollment: z.number().int().nullable(),      // charter-only
  authorized_enrollment_cap: z.number().int().nullable(),// charter-only
  unused_seats: z.number().int().nullable(),             // negative = over cap
  fill_tier: z.enum(['Fill-A','Fill-B','Fill-C','Expand-A','Expand-B']).nullable(),
  eapi_tier: z.enum(['EAPI-A','EAPI-B','EAPI-C']).nullable(),
  field_notes: z.record(z.string(), z.string())
    .describe('Per-field null explanations, e.g. {"unused_seats":"not in ACE file"}. '
            + 'This is what <ExplainedEmpty /> renders. Never omit it.'),
}).strict();
```

**Why the envelope is mandatory.** Claude receives coverage and vintage on *every* response, so it cannot answer "how many schools are above the line?" without also having the information that three charters are missing cap data and that test scores are a year older than the demographics. This makes the year-mismatch disclosure structural rather than a UI banner that Claude never sees. It is the cheapest hallucination guard in the system.

### 4.4 `find_expansion_candidates`

The tool that encodes Elevate215's actual core question: *which high-performing charters can absorb more students, and which are capped out?* Today this requires manually cross-reading two columns.

```typescript
export const FindExpansionCandidatesInput = z.object({
  mode: z.enum(['fill', 'expand', 'both']).default('both')
    .describe("'fill' = seats available now; 'expand' = strong but capped out."),
  min_eapi_tier: z.enum(['EAPI-A', 'EAPI-B']).default('EAPI-B'),
  min_unused_seats: z.number().int().min(0).default(100)
    .describe("Fill mode only — floor. Default 100 matches the dictionary's Fill-A."),
  max_unused_seats: z.number().int().min(0).default(24)
    .describe("Expand mode only — ceiling. Default 24 matches the dictionary's Expand-A/B (<25). "
            + "Expand mode floors at 0 implicitly: over-cap schools belong to R-SR-003, not here."),
  min_pct_low_income: z.number().min(0).max(100).optional()
    .describe('Optional equity filter — restrict to higher-poverty schools.'),
  limit: z.number().int().min(1).max(100).default(20),
}).strict();
```

Output rows carry `candidate_type` (`'fill' | 'expand'`), `rationale_fields` (the exact column values that qualified it), and `caveats[]` (e.g. `"enrollment cap unmatched in ACE file"`). Schools missing cap data are **returned in a separate `unassessable[]` array**, never silently omitted — silent omission is how a dashboard tells a confident lie.

| Property | Value |
|---|---|
| **Scope** | `rollup:read` |
| **Validation** | `min_unused_seats` is ignored in `expand` mode and `max_unused_seats` in `fill` mode; passing the irrelevant one explicitly is rejected as `E_INVALID_INPUT` rather than silently dropped. In `both` mode each half uses its own bound. Rejects `max_unused_seats >= min_unused_seats` as an overlapping definition. |
| **Errors** | `E_SCOPE_DENIED`, `E_INVALID_INPUT`, `E_NO_CAP_DATA` (200, returns `unassessable[]` populated and `rows: []`) |

**Example prompts:** "Which strong charters have room to grow?" · "Show me expansion candidates in high-poverty neighborhoods." · "Which A-tier schools are already at capacity?"

### 4.5 `get_school_profile`

```typescript
export const GetSchoolProfileInput = z.object({
  // SCHOOL_ID_RE is declared once in packages/shared/src/identifiers.ts
  school_id: z.string().regex(SCHOOL_ID_RE, 'Expected AUN-SchoolNumber')
    .describe('Composite key: AUN, hyphen, SchoolNumber. Exact digit widths are '
            + 'NOT specified in the dictionary — derive SCHOOL_ID_RE from the loaded '
            + 'dataset and assert it in a sync-time test rather than hardcoding a guess.'),
  include: z.array(z.enum(['exams', 'capacity', 'demographics', 'documents',
                           'insights', 'engagement_history'])).default(['exams', 'capacity', 'insights']),
}).strict();
```

Returns the full five-exam breakdown (N scored, pct proficient, predicted, residual, band per exam), capacity block, demographics with per-field confidence notes, linked documents, open insights, and engagement timeline. This is the tool behind both the School Rollup drawer and the Schools page — one tool, two surfaces.

The regex on `school_id` is the identifier-format validation Julien's review found missing across the board. Apply the same treatment to every identifier input in every tool — but derive the pattern from the actual data rather than assuming digit widths the dictionary never states.

### 4.6 `compare_schools`

```typescript
export const CompareSchoolsInput = z.object({
  school_ids: z.array(z.string().regex(SCHOOL_ID_RE)).min(2).max(6),
  dimensions: z.array(z.enum(['residuals_by_exam', 'capacity', 'demographics',
                              'proficiency_raw', 'tiers'])).default(['residuals_by_exam', 'tiers']),
}).strict();
```

Capped at 6 for a reason: comparison output is rendered as a matrix, and beyond six columns it stops being readable and starts being a table dump. If a user wants to compare 20 schools, that is a cohort filter, not a comparison — route them to `query_school_rollup`. The cap enforces the distinction.

Output includes a `divergences[]` array naming the dimensions where the schools differ most — the comparison's own headline, computed deterministically, so Claude summarizes a finding rather than deriving one.

### 4.7 `get_finance_summary` and `detect_finance_anomalies`

Both are **specced now, built after QuickBooks Phase 2.** Defining the contract early is the point of MCP-first: the Finance page can be built against a fixture that satisfies the schema while the connector work proceeds in parallel.

```typescript
export const GetFinanceSummaryInput = z.object({
  period: z.enum(['mtd', 'qtd', 'ytd', 'trailing_12', 'custom']).default('ytd'),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  group_by: z.enum(['account', 'class', 'month', 'restriction']).default('account'),
  restriction: z.enum(['restricted', 'unrestricted', 'all']).default('all'),
  compare_to_budget: z.boolean().default(true),
}).strict()
  .refine(v => v.period !== 'custom' || (v.start_date && v.end_date),
          { message: 'custom period requires start_date and end_date' })
  .refine(v => !v.start_date || !v.end_date || v.start_date <= v.end_date,
          { message: 'start_date must be on or before end_date' });
```

The output envelope carries a **connection state** that the UI is required to render:

```typescript
connection: z.object({
  authorized: z.boolean(),
  realm_id: z.string().nullable(),
  last_successful_sync: z.string().datetime().nullable(),
  qbo_tier: z.enum(['simple_start','essentials','plus','advanced','unknown']),
  tier_limited_fields: z.array(z.string())
    .describe('Fields known unavailable. When qbo_tier is "unknown", populated with the '
            + 'union of every field limited at any tier below Advanced, so the UI can name '
            + 'what MIGHT be missing rather than showing an empty list.'),
  tier_confidence: z.enum(['confirmed', 'inferred', 'unknown']),
  degraded_reason: z.string().nullable(),
})
```

This directly addresses two open items: the unknown QuickBooks tier, and error-handling gap #5 (tier-change handling). When `qbo_tier` is `'unknown'` the page renders an explicit "tier not confirmed — some figures may be unavailable" state instead of showing zeros that look like real zeros. **A missing number and a zero must never render identically.** That distinction is the whole reason the Finance page can be trusted.

Errors follow a QuickBooks-specific taxonomy so that gap #1 and #3 from the error-handling pitch get closed at the contract level:

| Error class | Meaning | Carries |
|---|---|---|
| `E_QBO_UNAUTHORIZED` | No valid token for this realm | `realm_id`, re-auth URL |
| `E_QBO_TOKEN_EXPIRED` | Refresh failed | `expires_at`, `intuit_tid` |
| `E_QBO_RATE_LIMITED` | 429 from Intuit | `retry_after`, `intuit_tid` |
| `E_QBO_TIER_UNSUPPORTED` | Endpoint unavailable at current plan | `qbo_tier`, `endpoint`, `intuit_tid` |
| `E_QBO_UPSTREAM` | 5xx from Intuit | `status`, `endpoint`, `intuit_tid` |
| `E_SYNC_STALE` | Tokens fine, data old | `last_successful_sync` |

Every one carries `intuit_tid` — the Intuit transaction ID. Capturing it was item #2 on the error-handling backlog and described as "nearly free"; making it a required field of the error contract is how it stops being optional.

### 4.8 `get_pipeline_health`

```typescript
export const GetPipelineHealthOutput = z.object({
  as_of: z.string().datetime(),
  sources: z.array(z.object({
    connector_slug: z.string(),
    display_name: z.string(),
    status: z.enum(['healthy', 'stale', 'degraded', 'failing', 'never_synced']),
    last_attempt_at: z.string().datetime().nullable(),
    last_success_at: z.string().datetime().nullable(),
    next_scheduled_at: z.string().datetime().nullable(),
    records_current: z.number().int().nullable(),
    records_previous: z.number().int().nullable(),
    records_delta_pct: z.number().nullable(),
    // --- the fields that close Julien's gap #3 ---
    records_attempted: z.number().int().nullable(),
    records_loaded: z.number().int().nullable(),
    records_failed: z.number().int().nullable(),
    failure_sample: z.array(z.object({
      row_ref: z.string(),
      reason: z.string(),
    })).max(10),
    schema_drift: z.array(z.object({
      change: z.enum(['added', 'removed', 'type_changed']),
      column: z.string(),
    })),
    data_vintage: z.string().nullable(),
  })),
}).strict();
```

`records_attempted` / `records_loaded` / `records_failed` as three distinct numbers is the fix for Julien's Layer 3 connector gap. "301 schools" alone cannot express "attempted 304, loaded 301, failed 3." Once these are separate fields the UI can show `301 of 304 loaded · 3 failed` and `R-PIPE-003` can fire.

### 4.9 `get_ai_usage_summary`

```typescript
export const GetAiUsageSummaryInput = z.object({
  period: z.enum(['today', 'week', 'month', 'custom']).default('week'),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  group_by: z.enum(['user', 'tool', 'day', 'status']).default('tool'),
  user_id: z.string().uuid().optional()
    .describe('Requires activity:read. Non-admins may only pass their own id.'),
}).strict();
```

Returns per-group call counts, token in/out, cost, p50/p95 latency, error rate by `error_class`, and `top_questions[]` with repeat counts (which feeds `R-ACT-003`). Callers holding `activity:read` (`exec` and `admin`) see all users, which is what the AI Activity cost panel requires. Callers without it may retrieve only their own row, and may not pass another user's `user_id`. Both rules are enforced in the handler rather than in query construction, so a bug in filter assembly cannot leak another user's usage.

### 4.10 Secondary tool contracts

These are referenced by pages in Sections 5–10 and are contracted here so the "no tool, no build" rule holds. Each follows the same conventions as the tools above: `.strict()` Zod input, an envelope carrying `as_of` and coverage, scope-guarded, audited to `tool_calls`.

| Tool | Input | Output | Scope | Notes |
|---|---|---|---|---|
| `get_change_feed` | `{since: datetime, surfaces?: string[], limit<=50}` | Ordered diff events: insight opened/resolved, tier transition, cap revision, sync anomaly | any read scope | Computed from `insights` supersede history + `school_rollup_history`. Returns `[]` and a `no_material_change` flag rather than manufacturing activity. |
| `get_entity_timeline` | `{entity_type, entity_id, since?, event_types?[], limit<=200}` | Merged chronological events with `source` on each | scope of the entity's dataset | Backs the Schools page. Reads `entity_events`; never synthesizes an event. |
| `get_tool_call_log` | `{period, status?, tool_name?, user_id?, limit<=500}` | Rows from `tool_calls`, failures-first by default | `activity:read` | `sort_by` defaults to `status<>'ok' DESC, occurred_at DESC` — the exception-first default from §10.2. |
| `search_documents` | `{query, entity_id?, doc_type?, extraction_status?, limit<=50}` | Document metadata + extraction status + linked entities | `documents:read` | Returns metadata and links, never raw document text in bulk. |
| `get_document_extraction` | `{document_id, include_spans?: boolean}` | Extracted fields with per-field confidence and source spans | `documents:read` | Every field carries `is_annotation: true`. Nothing here is a fact about a school. |
| `get_sync_run_detail` | `{sync_run_id}` | One run: attempted/loaded/failed, failure sample, schema drift, duration | `pipeline:read` | Failure sample capped at 100 rows with a total count. |
| `get_rule_registry` | `{active_only?: boolean}` | Every rule: id, version, severity, description, confidence, last run, open count | `pipeline:read` | Read-only. Makes "why am I seeing this?" answerable without reading Python. |
| `get_role_matrix` | `{}` | Roles × scopes, plus effective permissions per user | `admin:write` | |
| `get_usage_caps` | `{}` | Monthly and per-user caps, current spend, projection, at-cap behaviour | `admin:write` | |

`detect_finance_anomalies` — the one contract deferred above:

```typescript
export const DetectFinanceAnomaliesInput = z.object({
  period: z.enum(['mtd', 'qtd', 'ytd', 'trailing_12']).default('trailing_12'),
  categories: z.array(z.string()).max(50).optional(),
  sensitivity: z.enum(['conservative', 'standard', 'sensitive']).default('standard')
    .describe('Maps to 3σ / 2σ / 1.5σ against the category\'s own trailing mean.'),
  min_amount: z.number().min(0).default(500)
    .describe('Suppress anomalies below this absolute dollar value.'),
}).strict();
```

Output carries `insufficient_history: string[]` naming every category with fewer than six months of data, alongside `anomalies[]`. Per `R-FIN-002`, those categories are reported as unassessable rather than scored — a 2σ result on two months of data is noise wearing a statistic's clothing, and shipping it would burn the anomaly feed's credibility in the first week.

### 4.11 Tools deliberately NOT built

| Not building | Why |
|---|---|
| `run_sql(query)` or any raw-query tool | Direct database access to Claude. Non-negotiable. |
| `export_raw_csv()` | Handing Claude an unvalidated flat file defeats the entire pipeline. Exports go browser-side from validated API responses, never through the model. |
| `write_*` / `update_*` on any analytics table | AI must never write to the system of record. Status changes on insights go through the dashboard API with a user session, not through MCP. |
| `generate_insight()` | Section 3.1. Insights come from the rules engine. |
| Any grants tool | Out of MVP scope. |
---

## 5. Page 1 — Home

**One-line purpose:** Triage. What needs Stacy in the next thirty minutes.
**Decision it supports:** Where do I spend my attention today?
**Insight depth:** Ranked recommendations, aggregated across every surface.
**What it is not:** A summary of the whole platform. Home does not restate School Rollup's metrics.

### Layout

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Z0  Good morning, Stacy · Thursday, August 6                              │
│     School data: Spring 2025 / SY 2025-26 ⓘ  ·  QuickBooks: not authorized│
├──────────────────────────────────────────┬────────────────────────────────┤
│ Z1  NEEDS YOU  (4 open · 11 watching)    │  ASK ELEVATE215                │
│                                          │  ────────────────────────────  │
│  ▲ Connect QuickBooks  (R-PIPE-004)      │  Scope: everything you can see │
│     Finance stays empty until you        │                                │
│     authorize the Elevate215 company.    │  ▸ What changed this week?     │
│     [ Send me the authorize link ]       │  ▸ Which schools should we     │
│  ──────────────────────────────────────  │    engage first?               │
│  ⛔ 3 records silently skipped in the     │  ▸ Draft a board update on     │
│     last School Rollup sync              │    charter performance         │
│     Evidence: attempted 304 / loaded 301 │                                │
│     [ Review skipped rows ]              │  ┌──────────────────────────┐  │
│  ──────────────────────────────────────  │  │ (conversation)           │  │
│  ▲ Engage 8 A/B-tier charters with 100+  │  │                          │  │
│     unfilled seats                       │  │ every answer footed with:│  │
│     Evidence: EAPI-A/B · Fill-A · 1,140▪ │  │ ⚙ query_school_rollup    │  │
│     [ Open cohort in School Rollup ]     │  │   8 rows · Spring 2025   │  │
│  ──────────────────────────────────────  │  └──────────────────────────┘  │
│  ⛔ Verify 2 charters enrolled above cap  │  [ ask about your data...    ] │
│     Evidence: -14 and -31 unused seats   │                                │
│     [ View schools ]                     │                                │
│                                          │                                │
│  › 11 watch-level items                  │                                │
├──────────────────────────────────────────┴────────────────────────────────┤
│ Z2  SINCE YOU WERE LAST HERE  (Aug 4, 9:12 AM)                            │
│     ↑ 4 charters revised their authorized cap — 2 left Fill-A             │
│     ✓ School Rollup synced 3× — no schema changes, no tier movement       │
│     ✓ No changes in Finance — QuickBooks not yet authorized               │
├───────────────────────────────────────────────────────────────────────────┤
│ Z4  ⌄ 301 schools loaded · 3 unassessable for capacity · rules v1.2       │
└───────────────────────────────────────────────────────────────────────────┘
```

*Provenance note on every mockup in this document.* Figures shown are illustrative placeholders, with three exceptions that are real: the 301-school count, the three named unassessable charters, and the QuickBooks connection state. Separately, some UI elements referenced in this spec — the Bloomerang connector, the "24 public datasets" source, and the named non-Stacy users — appear only in the four screenshots I was given and are not corroborated anywhere in the project record. Treat them as observed-in-mockup, not as confirmed platform state, and verify before building against them.

### What changes from today's Overview, and why

**Delete the six-tile KPI strip.** 301 / 48 / 179 / 74 / 0.72 / B — these are the School Rollup page's headline, restated. On Home they cost the entire above-the-fold band and answer no question. They move to School Rollup where the user is actually reasoning about them.

**Delete the "Organization Health" card.** It duplicates Data Pipeline in full. Replace with the single Z0 status line, plus a Z1 insight when a source is actually unhealthy. Healthy infrastructure should be *silent*. A dashboard that reports five green checkmarks every morning trains the user to stop reading the panel — and then they miss the amber one.

**Delete "AI Operations Today."** Cost and latency are the AI Activity page's job. Home showing "$4.18 today" invites Stacy to optimize a number that is not her decision to make. It moves to AI Activity, and surfaces on Home only via `R-ACT-002` when spend is off-pace.

**Keep and promote "Data Freshness & Context."** This is the strongest element on the current page and it matches the status-color and data-vintage recommendation proposed in `Updated itsystem  1.pdf` (proposed, not yet formally accepted — worth confirming). It compresses into Z0 as a persistent line, with the full year-mismatch text on hover and in Z4.

**"Recent AI Questions" becomes Z2's delta feed instead.** A list of things Stacy already asked is a history, not a decision input. What she has *not* seen — what moved since her last visit — is.

### Z2 delta feed — how it is computed

Deterministic diff between the current active insight set and the set as of the user's `last_seen_at`, plus tier transitions from `school_rollup_history`. Requires one addition: a slowly-changing-dimension table capturing tier and residual per school per sync, so "moved into EAPI-A" is a fact from a diff, not an inference.

```sql
CREATE TABLE school_rollup_history (
    school_id           TEXT NOT NULL,
    observed_at         TIMESTAMPTZ NOT NULL,
    sync_run_id         UUID NOT NULL REFERENCES sync_runs(id),
    eapi_tier           TEXT,
    fill_tier           TEXT,
    simple_avg_residual NUMERIC(6,2),
    unused_seats        INTEGER,
    PRIMARY KEY (school_id, observed_at)
);
```

Cheap to write, and it unlocks trend language ("2 schools moved into EAPI-A") that is otherwise impossible. Without history, every "change" claim on this dashboard is either fabricated or absent. Note the honest caveat: with an annual test-score refresh, tier movement will be rare mid-year. The feed will mostly report capacity and pipeline changes, which is correct — and Z2 should render "no material changes since Aug 4" rather than manufacturing activity.

### MCP bindings

| Element | Tool | Notes |
|---|---|---|
| Z1 queue | `get_attention_queue({surface:'home', min_severity:'action', limit:5})` | |
| Z1 "11 watch items" | same tool, `min_severity:'watch'`, on expand | |
| Z0 freshness line | `get_pipeline_health()` | Cached 60s |
| Z2 delta feed | `get_change_feed({since})` | New thin tool over history + insight diff |
| Chat panel | Full toolset within the user's scopes | Section 11.2 |

---

## 6. Page 2 — School Rollup *(new dedicated page)*

**One-line purpose:** The analyst workbench for 301 Philadelphia schools.
**Decision it supports:** Which schools do we engage, in what order, and what is the argument for each?
**Insight depth:** Ranked recommendations — the most opinionated page in the product.
**Chat:** Yes, docked right rail, scoped to the active cohort.

This is the page that carries the platform's current value, and it is the one where the "generic analytics" feeling is most costly. Today it is a filter bar over a 301-row table. It should be a **cohort workbench**: pick a lens, see a ranked argument, drill into a school, ask the AI about exactly what is on screen.

### Layout

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Z0  School Rollup · 301 schools · Tests Spring 2025 / Enroll SY 25-26 ⓘ   │
├───────────────────────────────────────────────────────────────────────────┤
│ Z1  WHAT THIS DATA IS TELLING YOU                                         │
│  ▲ 8 A/B-tier charters with 100+ unfilled seats · 1,140 seats [Open lens] │
│  ▲ 4 A-tier charters at capacity — expansion candidates      [Open lens]  │
│  ⛔ 2 charters enrolled above authorized cap                  [Open lens]  │
│  ▲ 9 C-tier charters serving 500+ students                   [Open lens]  │
├──────────────────────────────────────────────────┬────────────────────────┤
│ Z2  LENS  [Fill candidates ▾]  ← saved cohorts   │  ASK ABOUT THESE       │
│     EAPI: A,B · Fill: A · Low income: any        │  8 SCHOOLS             │
│     8 of 301 schools · 1,140 unused seats        │  ─────────────────     │
│  ──────────────────────────────────────────────  │  Scope pinned to your  │
│   RANKED — by Simple Avg Residual                │  current lens. Change  │
│                                                  │  the lens, the scope   │
│   KIPP W Philadelphia    ████████ +8.7   A  138▪ │  changes with it.      │
│   Belmont Charter HS     █████    +6.1   B  104▪ │                        │
│   …6 more                                        │  ▸ Rank by Reading     │
│                                                  │    residual instead    │
│                                           [⇕ 8]  │  ▸ Which serve the     │
│  ──────────────────────────────────────────────  │    highest-poverty     │
│   ⚠ 3 schools cannot be assessed — no cap data   │    populations?        │
│     ASPIRA Bilingual Cyber CS · Esperanza Cyber  │  ▸ Draft a one-pager   │
│     CS · Memphis Street Academy CS @ JP Jones    │    on the top 5        │
├──────────────────────────────────────────────────┤                        │
│ Z3  ⌄ Full table  ⌄ EAPI distribution  ⌄ Unused seats  ⌄ Excl.   │       │
├──────────────────────────────────────────────────┴────────────────────────┤
│ Z4  ⌄ Method · single regression across District+Charter · N excluded     │
└───────────────────────────────────────────────────────────────────────────┘
```

### The Lens control — the core interaction change

Replace four disconnected dropdowns (School Type / EAPI Tier / Fill Tier / Performance Band) with named **lenses** — saved filter combinations that correspond to real questions. The dropdowns remain, under "Custom lens," for exploration.

| Lens | Filter | The question it answers |
|---|---|---|
| Fill candidates | `eapi_tier IN (A,B)` + `fill_tier = Fill-A` | Proven schools with room to grow |
| Expansion candidates | `eapi_tier = A` + `0 <= unused_seats < 25` | Proven schools that are capped out |
| Support priorities | `eapi_tier = C` + `enrollment >= 500` | Where the most students are underserved |
| Equity focus | `pct_low_income >= 85` + `residual > 0` | Beating expectations under the hardest conditions |
| Over cap | `unused_seats < 0` | Compliance risk |
| Data gaps | missing cap or demographics | What we cannot yet assess |
| Subject divergence | `max(residual) - min(residual) >= 15` | Schools strong in one subject, weak in another |
| All schools | none | The current default view |

**Why lenses beat filters.** A filter asks the user to already know the question. A lens *teaches* the question. "EAPI Tier = A, Fill Tier = Fill-A" requires reading a dictionary; "Fill candidates — proven schools with room to grow" requires nothing. Same query, same MCP call, same validated data. The only change is that the UI names the intent. This is most of the difference between "generic analytics dashboard" and "decision-support platform," and it costs one config file.

Lenses are declared in a shared config consumed by the UI, the MCP tool, and the rules engine — so a lens, its insight, and its chat scope can never drift apart:

```typescript
// packages/shared/src/lenses.ts
type RollupFilters = z.infer<typeof QuerySchoolRollupInput>;

export interface SortSpec {
  field: RollupFilters['sort_by'];
  dir: 'asc' | 'desc';
}

export interface Lens {
  slug: string;
  label: string;
  question: string;              // the plain-English framing shown to the user
  filters: Partial<RollupFilters>;
  linkedRuleIds: string[];       // Z1 insights that route here
  defaultSort: SortSpec;
  emptyStateCopy: string;        // what to say when zero schools qualify
}
```

`emptyStateCopy` is required, not optional. "0 results" is a dead end; "No charters are currently enrolled above their cap — this is the expected state" is information.

### Table changes

**Residual gets a bar, not just a number.** `+12.4` and `-5.6` in a column of numbers require reading every row to find the extremes. A diverging bar centered on zero makes the distribution legible at a glance. Bars use the diverging scale, not the categorical one — this is a signed magnitude, and encoding it categorically by band throws away the magnitude the user came for.

**Never render a bare `—`.** ASPIRA and Esperanza currently show `—` across six columns with no explanation at the cell. Replace with a muted `n/a` carrying the tooltip that matches the *actual* cause, because these schools have two unrelated gaps and one message cannot honestly cover both. For capacity columns: *"Cyber charter — PDE-authorized, not covered by the District's ACE file. No enrollment cap data available."* For GradeSpan and demographic columns: *"Not tracked in the District's demographics system."* Both explanations already exist in the dictionary; neither is reaching the point of confusion. Same treatment for District rows in Fill Tier / EAPI Tier, which are blank *by design* — dictionary open question 5 asks whether to hide or show N/A for these. **Recommendation: show a muted "n/a — charters only" rather than hiding the column.** A hidden column makes District and Charter rows structurally different and breaks scanning; an explained blank teaches the rule.

**Excluded schools get an inline flag, not a separate tab.** Pending the client's answer to dictionary question 6, the working assumption is that these stay in the data, flagged. Render a small "excluded from line" chip in the Band column with a tooltip explaining criteria-based admission. They remain in the row count; the count of excluded appears in Z4.

**Row click opens a drawer, not a new page.** The drawer shows all five exams with N scored, actual, predicted, residual, and band; the capacity block; demographics with confidence notes; linked documents; and open insights. Backed by `get_school_profile`. Keeping it a drawer preserves the cohort context behind it — navigating away and back is how a user loses their place and stops exploring.

### The chat panel — scoping contract

This is the part most likely to be implemented wrong, so it is specified tightly.

**The chat panel does not receive the table rows.** It receives the *lens definition*. When the user asks a question, Claude calls `query_school_rollup` with the lens's filters merged into its own arguments. Claude sees the same validated data the table sees, through the same tool, with the same envelope.

Why this matters: if you paste the visible rows into the context, three failures follow. Claude can arithmetic them incorrectly. Claude can answer questions about the 293 schools it cannot see by extrapolating. And the answer has no tool-call record, so it never appears in Tool Logs and cannot be audited. Passing the filter instead of the data keeps every answer inside the Baby Bottle boundary.

```typescript
interface ChatScope {
  surface: 'school_rollup';
  lens: { slug: string; label: string; filters: Partial<RollupFilters> };
  visibleCount: number;         // for the UI header only, never as an answer input
  focusedEntityId?: string;     // set when the drawer is open
}
```

Rendered contract in the UI:
- Header states the scope in plain language: *"Asking about 8 schools — Fill candidates."*
- Changing the lens **clears the conversation** with a visible marker: *"Scope changed to Support priorities. Previous answers referred to a different set of schools."* Carrying a conversation across a scope change is how a user ends up believing an answer about cohort A describes cohort B.
- Every response carries a provenance line: `⚙ query_school_rollup · 8 rows · tests Spring 2025 · enrollment SY 2025-26`.
- Suggested prompts are lens-specific, pulled from the lens config.
- If a question cannot be answered by any in-scope tool, Claude says so and names what is missing. It does not answer from general knowledge about Philadelphia schools. This is a system-prompt constraint *and* a rule enforced by returning `E_NO_TOOL_MATCH`, which fires `R-ACT-005`.

### MCP bindings

| Element | Tool |
|---|---|
| Z1 | `get_attention_queue({surface:'school_rollup', limit:4})` |
| Lens + table | `query_school_rollup(lens.filters)` |
| Z1 fill item | `find_expansion_candidates({mode:'fill', min_eapi_tier:'EAPI-B'})` |
| Z1 expand item | `find_expansion_candidates({mode:'expand', min_eapi_tier:'EAPI-A'})` — explicit, because the tool default is `EAPI-B` while `R-SR-001` is A-only |
| Drawer | `get_school_profile({school_id, include:[...]})` |
| Compare (multi-select) | `compare_schools({school_ids})` |
| Chat | All of the above, scope-merged |

---

## 7. Page 3 — Schools

**One-line purpose:** The institutional memory for one school.
**Decision it supports:** What is our relationship with this school and what should happen next with it?
**Insight depth:** Entity-scoped recommendations.
**Chat:** No — deliberate. Section 11.2 explains.

**The differentiation problem this page has today** is that it overlaps almost entirely with School Rollup. Both list schools. The distinction must be structural, not cosmetic:

> **School Rollup is the analysis of 301. Schools is the record of one.**

Rollup answers "who should we engage." Schools answers "what do we know about this one, who touched it last, and what did we say we would do." Rollup is a leaderboard; Schools is a file folder. If Schools ever grows a 301-row table, the differentiation has failed.

### Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ Z0  [ Search or select a school ]     ← the page requires a subject│
├────────────────────────────────────────────────────────────────────┤
│     MASTERY CHARTER SCHOOL — SHOEMAKER CAMPUS                      │
│     Charter · K-12 · school_id 126514770-7654 · 98.3% Black/Hisp ⓘ │
│     90.1% low income · EAPI-A · Fill: 12 unused seats              │
├────────────────────────────────────────────────────────────────────┤
│ Z1  FOR THIS SCHOOL                                                │
│  ▲ Expansion candidate — A-tier with only 12 unused seats          │
│    [ Add to engagement list ]  [ Dismiss ]                         │
│  ● Reading residual (+15.2) far exceeds Algebra I (-1.8)           │
├────────────────────────────────────────────────────────────────────┤
│ Z2  TIMELINE                                                       │
│  Aug 4  Sync — no change in tier                                   │
│  Jun 12 Document — "Fall Progress Visit Content.pdf" analyzed      │
│  May 18 AI — "Summarize Mastery Charter visit notes" (Stacy)       │
│  Mar 02 Tier change — EAPI-B → EAPI-A                              │
├──────────────────────────────┬─────────────────────────────────────┤
│ Z3  PERFORMANCE DETAIL       │ Z3  CAPACITY & CONTEXT              │
│  Exam  N   Act  Pred  Res    │  Enrolled 1,238 / Cap 1,250         │
│  PSSA Rdg 412 54.1 38.9 +15.2│  Unused 12 · Expand-A               │
│  PSSA Mth 412 41.0 33.7  +7.3│  Source: ACE Public File SY 25-26   │
│  Keys Alg  98 38.2 40.0  -1.8│                                     │
│  …                           │  Linked documents (3)               │
├──────────────────────────────┴─────────────────────────────────────┤
│ Z4  ⌄ Field definitions for this school's data                     │
└────────────────────────────────────────────────────────────────────┘
```

The **Timeline is the whole point of this page** and nothing in the current design has it. It merges four event streams — sync-detected changes, document analyses linked to the school, AI questions that referenced it, and manual notes — into one chronology. This is what turns a data page into institutional memory, and it is the only place in the product that answers "when did we last touch this school." It requires one new table (`entity_events`) and gives the Documents and AI Activity pages a destination for their output, which is what makes those pages feel purposeful rather than terminal.

**MCP:** `get_school_profile` with full `include`, `get_attention_queue({surface:'schools', entity_id})`, and a new `get_entity_timeline({entity_type, entity_id, since?})`.

---

## 8. Page 4 — Finance

**One-line purpose:** Budget stewardship.
**Decision it supports:** Are we on plan, and what needs a decision this month?
**Insight depth:** Ranked recommendations.
**Chat:** No panel. Finance questions route to Home chat, which has `finance:read`.

### The honesty problem to solve first

QuickBooks Phase 2 does not exist. Stacy has not completed OAuth for the real Elevate215 company. The tier is unknown. A Finance page that renders zeros, empty charts, or plausible-looking placeholder figures in this state is actively dangerous — it is exactly the "hardcoded data that looks connected" pattern already flagged in Rob's app.

**Design the connection states as first-class UI, not as an error case.** Four states, each with distinct treatment:

| State | Trigger | What the page shows |
|---|---|---|
| **Not authorized** | No realm token | A single centered card: what Connect does, what data it reads, who must click it (Stacy, as company owner), and the authorize button. Nothing else. No skeleton charts. |
| **Authorized, never synced** | Token valid, zero runs | Confirmation that the connection works, what will sync, expected first-sync time. Still no figures. |
| **Synced, tier unknown** | Data present, `qbo_tier='unknown'` | Full page with a persistent banner naming which figures may be incomplete at lower tiers. |
| **Healthy** | All green | Full page. |

The rule underneath all four: **an unavailable number renders as an explained absence, never as `$0` or `—`.** In a finance context this is not a nicety. A funder reading "$0 restricted revenue" from a page where the sync had actually failed is a materially different outcome from reading "restricted revenue unavailable — last sync failed Aug 4."

### Layout (healthy state)

```
┌───────────────────────────────────────────────────────────────────────┐
│ Z0  Finance · QuickBooks Online · synced 5 min ago · FY2026 YTD       │
│     ⚠ Plan tier unconfirmed — class-level detail may be unavailable   │
├───────────────────────────────────────────────────────────────────────┤
│ Z1  DECISIONS THIS MONTH                                              │
│  ⛔ Runway 5.2 months — below the 6-month threshold                    │
│     Evidence: $412K unrestricted ÷ $79K avg 3-mo burn  [ View burn ]  │
│  ▲ Program Supplies 34% over budget at 58% of year elapsed            │
│     Evidence: $84.1K actual vs $62.8K prorated plan   [ Drill in ]    │
│  ▲ $34.3K uncategorized (6.2% of $553K FY-to-date spend)              │
│     Evidence: 41 transactions      [ Open in QuickBooks ↗ ]           │
├───────────────────────────────────────────────────────────────────────┤
│ Z2  BUDGET vs ACTUAL — where the variance actually is                 │
│     Horizontal diverging bars, one row per category,                  │
│     sorted by absolute variance. Reference line = prorated plan.      │
│     Restricted / Unrestricted toggle.                                 │
├──────────────────────────────┬────────────────────────────────────────┤
│ Z2b RUNWAY                   │ Z2c CATEGORY TREND                     │
│  Cash on hand + 3/6/12-mo    │  Small multiples, 6-mo sparkline per   │
│  burn projection, restricted │  category, anomaly months marked.      │
│  excluded from runway.       │                                        │
├──────────────────────────────┴────────────────────────────────────────┤
│ Z3  ⌄ Transaction register (filterable, exportable)                   │
├───────────────────────────────────────────────────────────────────────┤
│ Z4  ⌄ Method · restricted excluded from runway · burn = trailing 3-mo │
└───────────────────────────────────────────────────────────────────────┘
```

**Why budget-vs-actual is the anchor and not a revenue chart.** Revenue over time is a report. Variance against plan is a decision — every row where the bar crosses the reference line is a conversation Stacy needs to have with someone. Sorting by absolute variance rather than alphabetically or by size puts the biggest problems at the top without the user doing any work. This is the difference between a chart she looks at and a chart she acts on.

**Restricted vs. unrestricted is not a filter, it is a first-class dimension.** For a nonprofit, "we have $600K" and "we have $412K we can actually spend" are different facts, and conflating them is the most common way a nonprofit finance dashboard misleads its own leadership. Runway must exclude restricted funds by default, and say so in Z4.

**MCP:** `get_finance_summary`, `detect_finance_anomalies`, `get_attention_queue({surface:'finance'})`. All specced now, built post-Phase 2, developed against schema-conforming fixtures in the meantime.

---

## 9. Page 6 — Grants (OUT OF MVP SCOPE)

**Status: shell only. `FEATURE_GRANTS=false`. No MCP tools. No rules. No ETL.**

Reminding you as required: Grant Management is out of scope per the client, and nothing in the meeting record indicates that has changed. The current Overview screenshot showing "18 Grant Recommendations" and "Which schools haven't received funding in the last 2 years?" is scope creep that has already reached the UI — that content should be removed, not redesigned.

If the flag is off, the nav item hides entirely rather than rendering a disabled item. A greyed-out nav entry is a promise; an absent one is not.

If and when scope changes in writing, the page's purpose would be *pipeline management* — deadlines, stage, owner, amount, probability — and its Zone 1 would be deadline-driven (`R-GRT-001` application due within 30 days with no owner assigned). Its natural dependency is `find_grant_eligible_schools()`, which cross-references School Rollup performance against funder criteria and is the one genuinely novel thing the platform could do here. That is the argument to make **if** the client reopens scope. Do not build it speculatively.

---

## 10. Pages 5, 7, 8, 9 — Documents, AI Activity, Data Pipeline, Admin

### 10.1 Documents — *the evidence library*

**Decision supported:** What source material backs this claim, and what did the platform extract from it?

The differentiator: this page is organized by **what was extracted**, not by filename. A file list is a folder; Google Drive already does folders better. The value the platform adds is the extraction layer.

Zone 1 is anomaly-flavored: documents uploaded but never processed, extractions with low confidence, and documents that contradict a linked school's rollup data (e.g. a visit note describing enrollment growth for a school whose ACE record shows declining enrollment — a genuine flag worth a human look). Zone 2 is a grid keyed on entity linkage: each document shows which schools it references and which insights cite it. Zone 3 is the document viewer with extraction highlights.

The critical constraint: **extracted values never flow into analytics tables.** A document extraction is an annotation, not a fact. It links to entities and appears on timelines; it does not update `school_rollup`. This is the Baby Bottle rule at its sharpest — a PDF is the least validated input in the system and must never become a number on a chart.

`search_documents`, `get_document_extraction`, `get_attention_queue({surface:'documents'})`.

### 10.2 AI Activity — *the trust ledger*

**Decision supported:** Can I trust what the AI told me, and what is it costing?
**Insight depth:** Anomaly flags only.

Today this page is a chronological log — the most generic surface in the product. Reframe it around accountability, and the layout falls out naturally.

Zone 1 flags anomalies only: error-rate spikes, budget pace, latency regressions, and the two feedback rules (`R-ACT-003` repeated questions → promote to a saved view; `R-ACT-005` unanswerable questions → candidate for a new MCP tool). Zone 2 splits into three panels that answer three different questions: **reliability** (success rate and error classes per tool, failures listed first — the current log sorts newest-first, which buries the 3 failures under 359 successes), **cost** (spend by user and by tool against the monthly cap, with projection), and **demand** (the top questions asked, ranked by frequency, each with a "make this a saved view" action). Zone 3 is the existing chronological log, now correctly demoted to evidence.

**The single highest-value change on this page: sort by exception, not by time.** A log page's default view should be "what went wrong," with "what happened" one click away.

`get_ai_usage_summary`, `get_tool_call_log`, `get_attention_queue({surface:'activity'})`.

### 10.3 Data Pipeline — *the freshness contract*

**Decision supported:** Is the data underneath every other page trustworthy right now?
**Insight depth:** Anomaly flags only.

The current Data Updates page is close to right and needs three specific changes.

**Change 1 — surface the integrity numbers.** "301 schools" becomes `301 loaded · 304 attempted · 3 failed`, with the failure sample one click away. This is `R-PIPE-003` and Julien's Layer 3 gap. Everything else on this page is cosmetic by comparison.

**Change 2 — add a record-count trend.** A source that quietly drops from 301 to 287 rows currently reads as "Healthy." A sparkline of row count per sync makes truncation visible immediately, and `R-PIPE-002` fires on a >5% drop.

**Change 3 — separate "configured" from "in scope."** Bloomerang shows "Sync Pending" and Public Data shows 24 datasets. Bloomerang is donor/CRM data — Development Analytics, out of MVP. It should either be hidden behind the same flag as Grants or moved into an explicitly labeled "Not in current scope" section. Right now it generates a permanent amber "1 Attention Needed" for something nobody is supposed to be working on, which is precisely how an alert system gets ignored.

Apply the color rule proposed in `Updated itsystem  1.pdf`: green under 24h, amber at 24h+, and never a clean green on School Rollup — it always carries the year-mismatch context chip.

`get_pipeline_health`, `get_sync_run_detail`, `get_attention_queue({surface:'pipeline'})`.

### 10.4 Admin — *the control room*

**Decision supported:** Who can see what, what does it cost, and where do alerts go?

Four sections, mapping one-to-one onto the platform's four observability requirements: **Access** (role assignment and the scope matrix from 4.1, rendered as an editable grid with an effective-permissions preview per user), **Data access** (dataset-level grants — which roles can query School Rollup vs. Finance, with the MCP scope shown alongside so the UI control and the tool permission are visibly the same thing), **Cost controls** (monthly token cap, per-user caps, model routing preference, and the action taken at cap — warn vs. block), and **Alerting** (which severities route to email, and to whom).

Two additions worth making here. First, an **insight rule registry** — a read-only list of every active rule, its version, when it last ran, and how many insights it currently has open. When Stacy asks "why am I seeing this," the answer must be inspectable by an admin without reading Python. Second, the **in-app support contact** from error-handling pitch item #4 — a persistent "Contact support" affordance in the shell footer, configured here. It is a small addition that closes a real questionnaire gap, and it scales past "email Danny" as more Elevate215 staff get access.

`get_role_matrix`, `update_role_scopes` (dashboard API with session auth — **not** an MCP tool; AI never writes permissions), `get_usage_caps`, `get_rule_registry`.
---

## 11. Cross-cutting concerns

### 11.1 Observability — the four required surfaces

Every feature in this document must feed all four platform observability requirements. Where each one lands:

| Requirement | Where it is produced | Where it surfaces |
|---|---|---|
| **Sync Status** | `sync_runs` + `get_pipeline_health` | Z0 context bar on every page · Data Pipeline in full · Home Z1 when unhealthy |
| **Tool Logs** | `tool_calls`, written by MCP middleware on every call including denials | AI Activity Z3 · per-answer provenance line in chat · Admin rule registry |
| **Token Usage** | `tool_calls.tokens_in/out` + model pricing table | AI Activity Z2 cost panel · Admin caps · Home Z1 only when off-pace |
| **Admin Controls** | `roles`, `role_scopes`, `usage_caps` | Admin page · enforced in MCP middleware · enforced in Next.js route guards |

The `tool_calls` schema, since every chat answer's provenance line depends on it:

```sql
CREATE TABLE tool_calls (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id         UUID        NOT NULL,
    role            TEXT        NOT NULL,
    session_id      UUID        NOT NULL,
    surface         TEXT,                        -- which page originated it
    tool_name       TEXT        NOT NULL,
    args_hash       TEXT        NOT NULL,        -- sha256 of canonicalized args
    args_redacted   JSONB       NOT NULL,        -- args minus anything sensitive
    status          TEXT        NOT NULL,        -- ok | denied | invalid | error | degraded
    error_class     TEXT,                        -- E_SCOPE_DENIED, E_QBO_TIER_UNSUPPORTED, ...
    intuit_tid      TEXT,                        -- populated on any QuickBooks-path error
    rows_returned   INTEGER,
    data_asof       DATE,
    latency_ms      INTEGER     NOT NULL,
    tokens_in       INTEGER,
    tokens_out      INTEGER,
    model           TEXT
);

CREATE INDEX tool_calls_recent_idx   ON tool_calls (occurred_at DESC);
CREATE INDEX tool_calls_failures_idx ON tool_calls (occurred_at DESC) WHERE status <> 'ok';
```

`args_hash` is what makes `R-ACT-003` (repeated questions) computable without storing raw question text indefinitely. `intuit_tid` as a first-class column, rather than buried in a log line, is what makes QuickBooks errors queryable — error-handling pitch items #2 and #3, closed at the schema level.

### 11.2 Chat placement doctrine

Chat lives in exactly two places, per your instruction, and the reasoning is worth writing down so it survives the next redesign.

| Surface | Scope | Why here |
|---|---|---|
| **Home** | Org-wide, all tools within the user's scopes | The open-ended entry point. "What should I look at?" has no natural page. |
| **School Rollup** | Pinned to the active lens | The one dataset rich enough that questions outrun the UI's controls. |
| Everywhere else | None | See below. |

**Why not everywhere.** A chat panel with no bound context is a chat that answers from the model's priors. On the Finance page pre-Phase 2, a chat box would happily discuss nonprofit budgeting in general — fluent, plausible, and about nothing in Elevate215's books. Restricting chat to surfaces with a real bound dataset is a hallucination control, not a feature limitation. Users who want to ask a finance question from the Finance page get a link that opens Home chat with a finance-scoped prompt pre-filled, which is one extra click and structurally safer.

**Shared requirements for both panels:**

Every response carries a provenance footer naming the tool, row count, and data vintage. Every response that used no tool is visually distinct and prefixed — *"Answering from context, not from your data"* — so the boundary is never ambiguous. Conversations clear on scope change with an explicit marker. Suggested prompts are configured per surface, not generic. And the panel exposes a "show the tool call" affordance that reveals the exact arguments sent, which is both a trust feature for Stacy and a debugging feature for the team.

One system-prompt constraint applies to both, stated here because it is an architectural decision rather than a prompt detail: **Claude may not perform arithmetic on values it received from a tool when a tool exists that computes the same thing.** If asked for an average residual across a cohort, it calls `query_school_rollup` with the aggregate parameter rather than summing rows in context. Model arithmetic over tool output is a quiet, hard-to-detect source of wrong numbers in exactly the kind of figure that ends up in a board deck.

### 11.3 Saved Views and Scheduled Briefs — replacing the Reports page

Deleting the Reports page leaves a real need: Stacy will want the same view repeatedly, and will want some of it delivered without opening the dashboard. Solve it in place rather than in a separate destination.

**Save this view** appears in the header of any page with a filter state. It persists `{surface, filters, sort, columns}` and pins a named entry to the sidebar under the page it came from. This is also where `R-ACT-003` lands — when the platform notices a question asked five times, it offers to make it a saved view, so the product learns from usage instead of requiring the user to think of it.

**Schedule a brief** takes any saved view plus the current Zone 1 items and emails a rendered summary on a cadence. Two hard constraints: the brief renders from the same MCP responses the page uses, never from a separate query path, so an emailed number and an on-screen number cannot disagree; and Claude may write the narrative *connecting* the insights but every figure in the brief is a rendered value from the tool response, not model output. The brief carries the same vintage and coverage footers as the page.

This is strictly better than a Reports page. Reports built in a separate section drift from the pages they summarize; reports generated *from* a page cannot.

### 11.4 New component inventory

Additions to the existing dashboard shell. Everything else is reused per the reuse-don't-rebuild principle — the sidebar, header, auth, table primitives, and card shell all stay.

| Component | Purpose | Used on |
|---|---|---|
| `<ContextBar />` | Zone 0. Dataset, vintage, connection state, one line. | All |
| `<AttentionQueue />` | Zone 1 container. Handles empty, degraded, and suppressed-count states. | All |
| `<InsightCard />` | One insight: severity glyph, title, evidence chips, action button, dismiss. | All |
| `<EvidenceChip />` | `field: value` with optional confidence note tooltip. | Within InsightCard |
| `<DataVintageChip />` | The year-mismatch disclosure, hoverable, reused everywhere residuals appear. | Rollup, Schools, Home |
| `<LensSelector />` | Named cohorts + custom filter fallback. | School Rollup |
| `<DivergingBar />` | Signed magnitude bar centered on zero. | Rollup, Finance |
| `<ScopedChatPanel />` | Docked chat with scope header, provenance footers, scope-change clearing. | Home, School Rollup |
| `<ProvenanceFooter />` | Tool name, row count, vintage, "show tool call." | Within chat |
| `<EntityDrawer />` | Right-side drawer preserving list context. | Rollup, Documents |
| `<Timeline />` | Merged multi-source event stream. | Schools |
| `<ConnectionStateCard />` | The four Finance states; generic enough for any connector. | Finance, Pipeline |
| `<ExplainedEmpty />` | Replaces every bare `—` and every "0 results." | All |
| `<TrustFooter />` | Zone 4. Coverage, exclusions, method, rule version. | All |

`<ExplainedEmpty />` looks like the smallest item on this list and is one of the most consequential. Every unexplained blank cell in the current design is a small trust leak, and there are dozens of them.

### 11.5 Folder structure

```
apps/
  hq/                                   # Next.js dashboard
    app/
      (dashboard)/
        page.tsx                        # Home
        school-rollup/page.tsx
        schools/[schoolId]/page.tsx
        finance/page.tsx
        documents/page.tsx
        grants/page.tsx                 # flag-gated, renders null when off
        activity/page.tsx
        pipeline/page.tsx
        admin/page.tsx
      api/
        insights/[id]/status/route.ts   # dashboard-auth writes, NOT MCP
        saved-views/route.ts
        briefs/route.ts
    components/
      zones/                            # ContextBar, AttentionQueue, TrustFooter
      insights/                         # InsightCard, EvidenceChip
      rollup/                           # LensSelector, DivergingBar, EntityDrawer
      chat/                             # ScopedChatPanel, ProvenanceFooter
      shared/                           # ExplainedEmpty, DataVintageChip, ConnectionStateCard
    lib/
      scopes.ts                         # route guards, mirrors MCP middleware

  mcp-server/                           # TypeScript MCP
    src/
      tools/
        get_attention_queue.ts
        query_school_rollup.ts
        find_expansion_candidates.ts
        get_school_profile.ts
        compare_schools.ts
        get_entity_timeline.ts
        get_change_feed.ts
        get_finance_summary.ts
        detect_finance_anomalies.ts
        get_pipeline_health.ts
        get_sync_run_detail.ts
        get_ai_usage_summary.ts
        get_tool_call_log.ts
        search_documents.ts
        get_document_extraction.ts
        get_rule_registry.ts
        get_role_matrix.ts
        get_usage_caps.ts
      middleware/
        scope-guard.ts                  # 4.1 enforcement
        validate.ts                     # strict Zod parse at the boundary
        audit.ts                        # writes tool_calls, always
      errors/
        classes.ts                      # E_* taxonomy incl. QuickBooks
        intuit.ts                       # intuit_tid extraction

packages/
  insights/                             # Python rules engine
    rules/
      school_rollup.py                  # R-SR-001..008
      finance.py                        # R-FIN-001..005
      pipeline.py                       # R-PIPE-001..005
      activity.py                       # R-ACT-001..005
      documents.py                      # R-DOC-001..003
    scoring.py
    registry.py                         # rule id -> version, confidence, metadata
    runner.py                           # post-sync execution, supersede semantics
    tests/
      test_rules_*.py                   # golden-fixture tests, one per rule
  shared/
    src/lenses.ts                       # single source of truth for cohorts
    src/severity.ts
    src/identifiers.ts                  # SCHOOL_ID_RE and friends, derived + tested
  etl/                                  # existing Extract→Clean→Normalize→Validate→Load
```

Note where the insight rules live: **Python, in `packages/insights`, not in the MCP server.** The MCP server reads the `insights` table; it does not compute insights. Keeping computation in the ETL-adjacent layer means rules run once per sync rather than once per request, they are unit-testable against fixtures without an MCP harness, and there is exactly one code path that can produce an insight. If rules lived in the MCP server they would inevitably drift into being computed per-request with slightly different logic per caller.

---

## 12. Implementation sequencing

Ordered so that each phase ships something usable and nothing is blocked on QuickBooks.

**Phase 0 — Consistency fixes (0.5 week).** Canonical nav from 2.1 applied everywhere. Fix the user identity discrepancy. Delete the Reports and AI Assistant pages. Hide Grants and Bloomerang behind flags. Remove the grant-recommendation content from Overview. No new capability, and it makes the product feel materially more finished than any single feature would.

**Phase 1 — The insight spine (1.5 weeks).** `insights` table, `packages/insights` scaffolding, `school_rollup_history`, the three integrity columns on `sync_runs`, `get_attention_queue` MCP tool, and the `<AttentionQueue />` / `<InsightCard />` / `<ContextBar />` / `<TrustFooter />` components. Implement the School Rollup and Pipeline rule families only. Nothing visibly changes on most pages yet — this is the substrate.

**Phase 2 — School Rollup page (2 weeks).** The dedicated page: lens config, ranked table with diverging residual bars, entity drawer, `find_expansion_candidates`, `get_school_profile`, `compare_schools`, extended `query_school_rollup` with cross-field validation, and the scoped chat panel. This is the phase that delivers the most visible value, on the one dataset that is already live and verified.

**Phase 3 — Home (1 week).** Rebuild against the insight spine. Delete the KPI wall, Organization Health, and AI Operations cards. Add the Z2 delta feed. Move the existing chat into `<ScopedChatPanel />` with org-wide scope.

**Phase 4 — Pipeline and AI Activity (1 week).** Both are mostly rules plus re-sorting existing data, and both become genuinely useful the moment `records_failed` is surfaced. Do Pipeline first — it is the one that makes every other page's numbers defensible.

**Phase 5 — Schools and Documents (1.5 weeks).** `entity_events` table, `<Timeline />`, `get_entity_timeline`, document extraction linkage. This is where the product stops being a set of pages and starts being a connected record.

**Phase 6 — Finance (2 weeks, gated on QuickBooks Phase 2).** Note that error-handling pitch item #6 — the CDC-vs-full-pull sync design decision — is still undecided and is a prerequisite for Phase 2, not for this phase; but the answer determines whether the Pipeline page shows a full row count or a delta count for QuickBooks, so it should be settled before Phase 4 rather than during Phase 6. Build the four connection states and the fixture-backed page in parallel with Phase 2–5 work; wire real data when the connector lands. The MCP contract from 4.7 is what makes that parallelism possible.

**Phase 7 — Admin, Saved Views, Scheduled Briefs (1.5 weeks).** Rule registry, scope matrix editor, caps, in-app support contact, saved views, briefs.

Total: roughly eleven weeks of focused work. The first visible change lands in week one (Phase 0's consistency pass), and the first genuinely new capability — the School Rollup workbench — is complete around week four. Phase 1 deliberately produces almost no visible change; it is the substrate everything else stands on, and compressing it is the most likely way this plan goes wrong.

**Two dependency warnings.** Phase 1's `sync_runs` schema change touches the ETL layer, which overlaps Sean's Docker Compose and CI work and Julien's validation roadmap weeks 3–4 — coordinate before starting rather than after. And given the duplicate-effort pattern already flagged twice in the project record (AWS, Google Drive connector, and now the QuickBooks/MCP task assignments), this document should be circulated with an explicit note that School Rollup, the QuickBooks OAuth Phase 1, and the Vercel deployment are already built, so nobody scopes Phase 2 as a from-scratch rebuild.

---

## 13. Testing requirements

**Rules engine — golden fixtures, one file per rule.** Each rule gets a fixture set with a positive case, a negative case, a boundary case, and a null/missing-data case. The boundary cases matter more than they look: `R-SR-001` fires at `unused_seats < 25` and `R-SR-002` at `Fill-A` (100+), and those thresholds come straight from the dictionary's tier definitions — a fixture at exactly 25 and exactly 100 is what stops a future refactor from silently shifting a tier boundary.

**Scoring — property tests.** `priority_score` must be pure and stable: same inputs produce the same output across runs, ordering is total, and no input combination produces `NaN` or a negative score. Property-based testing is the right tool here because the failure mode is a rare input combination, not a specific one.

**MCP tools — contract tests.** Every tool gets a test asserting that the output validates against its declared Zod schema, that unknown input keys are rejected by `.strict()`, that cross-field `.refine()` rules reject contradictory inputs, and that a scope-denied call returns `E_SCOPE_DENIED` *and* writes a `tool_calls` row. That last assertion is the one most likely to be missed and the one an audit will ask about.

**Coverage invariant — two integration tests worth naming.** First, `coverage.matched + coverage.unmatched_in_source == coverage.total_in_source` — this is the load-completeness check that would have caught the "301 schools" ambiguity, and it should run on every sync, not just in CI. Second, `coverage.unassessable_capacity == len(coverage.missing_cap_data)`, which keeps the count and the displayed names from drifting apart. Note that these are genuinely different concerns: the three cap-less charters are *loaded successfully* and appear in all 301 rows — they are unassessable for fill/expand, not missing. Conflating "failed to load" with "loaded but incomplete" is exactly the ambiguity this page exists to remove.

**Chat — scope isolation tests.** Assert that changing the lens clears conversation state, that a scoped chat cannot retrieve rows outside its lens filters, and that every response carrying a figure also carries a provenance footer.

---

## 14. Open questions

Five are inherited from the data dictionary and are unresolved with the client (the dictionary lists six; question 6, on whether excluded schools remain queryable, is folded into item 5's recommendation below). They are handled in this design as explicit low-confidence or data-gap states rather than being resolved by assumption, but they should still be asked.

1. **`PctBlackHispanic_2025-26` combination method** — union or sum? Affects `confidence` on any rule using the field, and whether the value can exceed 100%.
2. **Cyber-charter gaps** — leave GradeSpan/demographics blank permanently, or is there a supplemental source? Determines whether `R-SR-006`'s grade-span derivation can be computed for these schools at all, or whether they permanently fall through to an unscored state.
3. **The three unmatched charters** — ASPIRA Bilingual Cyber CS, Esperanza Cyber CS, Memphis Street Academy CS @ JP Jones. Permanent `unassessable`, or is an alternate cap source worth chasing?
4. **Year mismatch acceptable for grant decisions?** — the design surfaces it everywhere, which is the right default regardless of the answer, but explicit written confirmation should be on file before any figure derived from it goes to a funder.
5. **Fill/EAPI Tier for District rows** — dictionary question 5. **My recommendation is a muted "n/a — charters only" rather than hiding the columns**, so scanning stays consistent and the rule is taught rather than hidden. Needs your sign-off.

Three are new, arising from this design:

6. **Insight dismissal policy.** When Stacy dismisses an insight, does it stay dismissed forever, or does it return if the evidence materially changes (e.g. a school's unused seats grow from 104 to 260)? My recommendation: dismissal persists, but a *material* change in evidence — configurable per rule, defaulting to a 25% shift in the primary metric — resurfaces it as a new insight with a "changed since you dismissed this" marker. Permanent dismissal risks burying a real problem; naive resurfacing destroys trust in the dismiss button.

7. **Who besides Stacy gets access, and when?** The Activity screenshot already shows Julien Bean, Sean Osborne, and Aman Khan as users. The role matrix in 4.1 assumes multiple roles, but if Stacy is the only real user in the near term, Phase 7's Admin work could move later and Phase 5's Schools timeline earlier. This changes sequencing, so it is worth a direct answer.

8. **Runway threshold and burn definition.** `R-FIN-003` currently uses six months and a trailing-three-month burn with restricted funds excluded. Both numbers should be confirmed against how Elevate215's board actually talks about runway — a threshold that does not match the board's own language will be ignored no matter how correct it is.

---

## 15. Summary of what to delete

Worth stating plainly, because subtraction is most of what makes this redesign work and it is the part most likely to get quietly dropped in implementation.

| Delete | Reason |
|---|---|
| Six-tile KPI strip on Home | Duplicates School Rollup; answers no question |
| "Organization Health" card on Home | Duplicates Data Pipeline; healthy infrastructure should be silent |
| "AI Operations Today" card on Home | Not Stacy's decision; belongs on AI Activity |
| "Recent AI Questions" list on Home | History, not a decision input; replaced by the delta feed |
| Reports page | Reporting is an action from a context, not a destination |
| AI Assistant page | Unscoped chat is the highest hallucination-risk surface in the product |
| Grant recommendation content on Overview | Out of MVP scope; already reads as a client commitment |
| Bloomerang from the default Pipeline view | Out of MVP scope; generates a permanent ignorable alert |
| Duplicate nav labels ("Data Updates", "Activity") | One name per page, always |
| Every bare `—` in the rollup table | Replaced by `<ExplainedEmpty />` with the reason at the point of confusion |

---

*Prepared against `school-rollup-dictionary.md`, `Meeting_Notes_Status_Review.md`, `claude/Status_and_Validation_Doc_Review_2026-08-04.md`, `Error_Handling_Support_Pitch (1).md`, and `Updated itsystem  1.pdf`. Every field name, tier threshold, and band definition used in the rule catalogue is taken from the dictionary's confirmed entries. Where a rule leans on a field whose definition is still open, it is flagged in Section 3.4 and carries reduced confidence per Section 3.5.*
