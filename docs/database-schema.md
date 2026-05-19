# Postgres Database Schema

ORM: Drizzle ORM. All schema definitions live in `packages/db/schema.ts`. Migrations are generated with `drizzle-kit generate` and applied with `drizzle-kit migrate`.

## Tables

### `students`

Canonical student records. Sourced from the `Students` tab of the "Student Information for Launchpad LLMs" Google Sheet.

**PII exclusions:** `dob`, `hasDisability`, `iep504`, and `phone` are never read or persisted. The connector enforces this via `STUDENTS_ALLOWED_COLS` (column-index allowlist).

```sql
CREATE TABLE students (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name            TEXT NOT NULL,
  student_id                TEXT UNIQUE,            -- LP#### format
  email                     TEXT,
  gender                    TEXT,
  race_ethnicity            TEXT,
  school_name               TEXT,
  hs_graduation_year        INTEGER,
  entry_date                DATE,
  withdrawal_date           DATE,
  withdrawal_code           TEXT,
  zip                       TEXT,
  left_before_hs_grad       BOOLEAN,
  completed_phase           BOOLEAN,
  interview_score           NUMERIC(5,2),
  tech_interest_onboarding  INTEGER,
  interview_passion_score   INTEGER,
  interview_college_score   INTEGER,
  hs_gpa                    NUMERIC(4,2),
  algebra1_grade            TEXT,
  geometry_grade            TEXT,
  college_enroll            TEXT,
  university                TEXT,
  major                     TEXT,
  income                    TEXT,
  parental_ed               TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_students_student_id ON students(student_id);
CREATE INDEX idx_students_canonical_name ON students(canonical_name);
```

### `staff`

Canonical staff records.

```sql
CREATE TABLE staff (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name  TEXT NOT NULL,
  email           TEXT UNIQUE,
  role            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `entity_aliases`

Maps every known name/handle/ID for a student or staff member back to their canonical record. This is the entity resolution graph.

```sql
CREATE TABLE entity_aliases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('student', 'staff')),
  entity_id       UUID NOT NULL,          -- FK to students.id or staff.id
  source          TEXT NOT NULL,          -- 'slack', 'bigquery', 'drive', 'manual'
  alias           TEXT NOT NULL,          -- the raw name/handle/ID as it appears in source
  confidence      NUMERIC(3,2) NOT NULL DEFAULT 1.00,  -- 0.00–1.00
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_entity_aliases_source_alias ON entity_aliases(source, alias);
CREATE INDEX idx_entity_aliases_entity ON entity_aliases(entity_type, entity_id);
```

### `attendance_records`

Unified storage for the three Launchpad cohort attendance sheets. Each sheet has a different shape (Cohort 1 weekly aggregates with `Percentage`; Cohort 2 daily P/A/E codes; Cohort 3 weekly check-in/out logs with codes); common fields are promoted to columns and the full source row is preserved on `row_data` for cohort-specific fields.

Linkage to the students table is via `student_number` (LP####), which joins to `students.student_id`.

V0.2 transition: when the BigQuery connector ships, this table will be re-populated from BigQuery's authoritative attendance data, and the same `query_attendance` tool will read from it.

```sql
CREATE TABLE attendance_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort          INTEGER NOT NULL,        -- 1 | 2 | 3
  student_number  TEXT NOT NULL,           -- LP#### (joins students.student_id)
  date            DATE,                    -- primary date for filtering (cohort 2/3 day; cohort 1 = Date or End Date)
  start_date      DATE,                    -- cohort 1 only
  end_date        DATE,                    -- cohort 1 only
  code            TEXT,                    -- P / A / E (cohort 2 / 3); null on cohort 1
  percentage      NUMERIC(5, 2),           -- cohort 1 only (0–100)
  row_data        JSONB NOT NULL,          -- full source row (cohort-specific fields)
  source_id       TEXT NOT NULL UNIQUE,
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendance_student      ON attendance_records (student_number);
CREATE INDEX idx_attendance_cohort_date  ON attendance_records (cohort, date);
CREATE INDEX idx_attendance_date         ON attendance_records (date);
```

**Notes:**
- Cohorts are loose Launchpad student groupings (not graduation-year fixed); a student may appear in more than one cohort over time as they accelerate. The `cohort` column reflects the source sheet, not a hard student attribute.
- `row_data` preserves cohort-specific fields the parser doesn't promote to columns: `learning_exp`, `teacher`, `check_in` / `check_out` (cohort 2 decimal times), `stu_exp_start_time` / `stu_exp_end_time`, `stu_exp_time_spent`, `act_time_spent`, `portfolio`, `check_in_or_out` (cohort 3 only), `time` (cohort 3 only). Internal sheet metadata (`sheet_name`, `sheet_id`, `spreadsheet_name`, `spreadsheet_id`, `teacher_posting_date`) is excluded at ingest. Cohort 3's `exp_start_time` / `exp_end_time` are also excluded — superseded by `stu_exp_*`.

### `student_phase_outcomes`

Program phase progression per student. Sourced from columns F–Q of the `Students` tab of the "Student Information for Launchpad LLMs" Google Sheet (the separate `Outcomes` tab is redundant and skipped). One row per student (upsert on `student_id`).

```sql
CREATE TABLE student_phase_outcomes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id              UUID NOT NULL REFERENCES students(id) UNIQUE,
  foundations_status      TEXT,
  foundations_start_date  DATE,
  foundations_end_date    DATE,
  phase_101_status        TEXT,
  phase_101_start_date    DATE,
  phase_101_end_date      DATE,
  lightspeed_status       TEXT,
  lightspeed_start_date   DATE,
  lightspeed_end_date     DATE,
  liftoff_status          TEXT,
  liftoff_start_date      DATE,
  liftoff_end_date        DATE,
  last_synced_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_phase_outcomes_student ON student_phase_outcomes(student_id);
```

### `student_certifications`

One row per phase completion record. Sourced from the `Certifications` tab of the "Student Information for Launchpad LLMs" Google Sheet. `source_id` is the sheet's `id` column (e.g. `SP001`). Tracks phase-level completion/withdrawal — not exam scores.

```sql
CREATE TABLE student_certifications (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id               TEXT NOT NULL UNIQUE,       -- e.g. SP001
  student_id              UUID NOT NULL REFERENCES students(id),
  phase                   TEXT NOT NULL,              -- Foundations, 101, Lightspeed, LiftOff
  status                  TEXT NOT NULL,              -- Completed, Dropped Before Completion, etc.
  start_date              DATE,
  end_date                DATE,
  phase_withdrawal_code   TEXT,
  last_synced_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_certifications_student ON student_certifications(student_id);
CREATE INDEX idx_certifications_phase ON student_certifications(phase);
```

### `beacon_outcomes` — V0.2 only

Beacon competency outcomes synced from BigQuery. Not created during V0.1. Coexists with `student_phase_outcomes` — they track different things.

### `sync_log`

One row per connector sync run. Used by HQ dashboard.

```sql
CREATE TABLE sync_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector       TEXT NOT NULL,          -- 'bigquery', 'google-drive', 'slack', 'meeting-transcripts'
  started_at      TIMESTAMPTZ NOT NULL,
  finished_at     TIMESTAMPTZ,
  status          TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
  records_synced  INTEGER DEFAULT 0,
  error_message   TEXT
);

CREATE INDEX idx_sync_log_connector ON sync_log(connector, started_at DESC);
```

### `usage_log`

One row per MCP tool call. Used by HQ dashboard for adoption reporting.

```sql
CREATE TABLE usage_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name       TEXT NOT NULL,
  caller_identity TEXT,                   -- email or Slack handle if determinable
  called_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms     INTEGER,
  success         BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_usage_log_tool ON usage_log(tool_name, called_at DESC);
CREATE INDEX idx_usage_log_caller ON usage_log(caller_identity, called_at DESC);
```

### `finance_snapshots`

Generic JSONB store for tabular financial and CRM data ingested from multiple Google Sheets. Each row is one source-sheet row; column shapes vary by tab and the parser preserves them as a `row_data` JSON object keyed by snake_case column names.

**Tabs ingested into this table:**

| Source sheet | Stored `tab_name` values |
|---|---|
| Launchpad Dashboard | `Prior Month Budget vs Actual`, `YTD Budget vs Actual`, `Rolling Forecast`, `Monthly`, `Combined Funds`, `Annual` |
| Phase Budget Dashboard | `phase_dashboard:2025 actuals`, `phase_dashboard:monthly liftoff only`, `phase_dashboard:monthly hs only` |
| Phase Actuals Q3 2026 | `q3_2026_actuals:global %`, `q3_2026_actuals:Human capital %`, `q3_2026_actuals:actuals by phase` |
| Phase Actuals 2025 | `phase_actuals_2025:global %`, `phase_actuals_2025:Human capital %`, `phase_actuals_2025:actuals by phase` |
| Rapid stipends | `rapid:Dashboard`, `rapid:FY2023`, `rapid:FY2024`, `rapid:FY2025` |
| PEX stipends | `pex:Dashboard`, `pex:FY2022`, `pex:FY2023`, `pex:FY2024`, `pex:FY2025`, `pex:FY2026` |
| Building21 Development CRM | `development:contacts`, `development:giving history`, `development:prospect pipeline`, `development:denied`, `development:launchpad pipeline`, `development:grants tracker` |

Attendance is **not** stored here — see `attendance_records` (own table with structured columns + indexes).

`source_id` format: `"{tab_name}:{rowNumber}"`. Upsert key.

```sql
CREATE TABLE finance_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_name        TEXT NOT NULL,
  period          TEXT,                   -- inferred from tab or row content, e.g. 'March 2026'
  row_data        JSONB NOT NULL,         -- raw column→value map for the row
  source_id       TEXT NOT NULL UNIQUE,
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_snapshots_tab ON finance_snapshots(tab_name);
CREATE INDEX idx_finance_snapshots_period ON finance_snapshots(period);
```

### `aplos_transactions`

Individual income/expense transactions from Aplos.

```sql
CREATE TABLE aplos_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aplos_id        TEXT NOT NULL UNIQUE,
  transaction_date DATE NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount_cents    INTEGER NOT NULL,
  fund_id         TEXT,
  fund_name       TEXT,
  account_code    TEXT,
  account_name    TEXT,
  contact_name    TEXT,
  memo            TEXT,
  tags            TEXT[],
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_aplos_transactions_date ON aplos_transactions(transaction_date);
CREATE INDEX idx_aplos_transactions_fund ON aplos_transactions(fund_id);
CREATE INDEX idx_aplos_transactions_type ON aplos_transactions(type);
```

### `aplos_fund_balances`

Daily balance snapshots per fund from Aplos. A new row is written each sync day.

```sql
CREATE TABLE aplos_fund_balances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id         TEXT NOT NULL,
  fund_name       TEXT NOT NULL,
  balance_cents   INTEGER NOT NULL,
  snapshot_date   DATE NOT NULL,
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fund_id, snapshot_date)
);

CREATE INDEX idx_aplos_fund_balances_date ON aplos_fund_balances(snapshot_date DESC);
```

### `aplos_budget_items`

Budget vs. actual amounts per account/fund/period from Aplos.

```sql
CREATE TABLE aplos_budget_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code        TEXT NOT NULL,
  account_name        TEXT,
  fund_id             TEXT,
  fund_name           TEXT,
  period              TEXT NOT NULL,             -- e.g. "2024-Q1" or "FY2024"
  budget_amount_cents INTEGER NOT NULL DEFAULT 0,
  actual_amount_cents INTEGER NOT NULL DEFAULT 0,
  variance_cents      INTEGER GENERATED ALWAYS AS (budget_amount_cents - actual_amount_cents) STORED,
  last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_code, fund_id, period)
);
```

### `givebutter_donations`

Individual donation transactions from Give Butter.

```sql
CREATE TABLE givebutter_donations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  givebutter_id       TEXT NOT NULL UNIQUE,
  campaign_id         TEXT,
  campaign_name       TEXT,
  donor_id            TEXT,
  donor_name          TEXT,
  amount_cents        INTEGER NOT NULL,
  fee_cents           INTEGER DEFAULT 0,
  net_amount_cents    INTEGER NOT NULL,
  giving_type         TEXT,                      -- 'one-time', 'recurring'
  note                TEXT,
  donated_at          TIMESTAMPTZ NOT NULL,
  last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_givebutter_donations_date ON givebutter_donations(donated_at);
CREATE INDEX idx_givebutter_donations_campaign ON givebutter_donations(campaign_id);
```

### `givebutter_campaigns`

Campaign records from Give Butter.

```sql
CREATE TABLE givebutter_campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  givebutter_id       TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  status              TEXT,                      -- 'active', 'ended', 'draft'
  goal_cents          INTEGER,
  raised_cents        INTEGER NOT NULL DEFAULT 0,
  donor_count         INTEGER NOT NULL DEFAULT 0,
  url                 TEXT,
  created_at          TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,
  last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `givebutter_donors`

Donor contact and aggregate giving records from Give Butter. Contains contact info — handle with care.

```sql
CREATE TABLE givebutter_donors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  givebutter_id         TEXT NOT NULL UNIQUE,
  first_name            TEXT,
  last_name             TEXT,
  email                 TEXT,                    -- sensitive; do not expose via MCP tools
  phone                 TEXT,                    -- sensitive; do not expose via MCP tools
  total_donated_cents   INTEGER NOT NULL DEFAULT 0,
  donation_count        INTEGER NOT NULL DEFAULT 0,
  first_donation_at     TIMESTAMPTZ,
  last_donation_at      TIMESTAMPTZ,
  last_synced_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_givebutter_donors_email ON givebutter_donors(email);
```

## Migration Strategy

- Migrations live in `packages/db/migrations/`
- Generated via `pnpm db:generate` (wraps `drizzle-kit generate`)
- Applied via `pnpm db:migrate` (wraps `drizzle-kit migrate`)
- Railway runs `pnpm db:migrate` as a deploy step before starting any service
- Never edit a migration file after it has been applied to any environment — create a new one instead

## Upsert Pattern

All connectors use `INSERT ... ON CONFLICT (source_id) DO UPDATE SET ...` to make syncs idempotent. The `source_id` column holds the primary key from the upstream source.
