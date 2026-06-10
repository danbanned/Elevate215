# BigQuery Connector

> **Status: Deferred to V0.2.** In V0.1, Beacon outcomes data is sourced from a Google Sheet via the [Google Sheets connector](google-sheets-connector.md). When this connector ships, BigQuery becomes the system of authority for outcomes and adds attendance data. The transition is detailed in `PRE_BUILD_CHECKLIST.md` under V0.2 Migration Tasks.

## Purpose

Syncs structured attendance and Beacon outcome data from the BigQuery data warehouse into Postgres. This is the primary source for all quantitative student data.

## What Gets Synced

### Attendance Records
- **Source:** BigQuery table (confirm exact dataset/table with data team before building)
- **Fields pulled:** student ID, date, attendance status, minutes present
- **Destination:** `attendance_records` table in Postgres
- **Sync scope:** All records updated in the last 7 days (rolling window to catch backdated corrections)

### Beacon Outcomes
- **Source:** BigQuery table (confirm exact dataset/table with data team)
- **Fields pulled:** student ID, competency name, level, score, assessed date, term
- **Destination:** `beacon_outcomes` table in Postgres
- **Sync scope:** All records updated in the last 30 days (outcomes can be revised)

## Sync Schedule

AWS EventBridge: **daily at 2:00 AM ET** (via `apps/sync` Fargate task)

For manual triggering: `pnpm --filter bigquery sync`

## Auth

- Google Cloud service account with BigQuery Data Viewer role on the relevant dataset
- Service account JSON stored in `GOOGLE_SERVICE_ACCOUNT_JSON` env var (base64-encoded)
- No OAuth flow — service account only

## Sync Logic (Step by Step)

1. Write a `sync_runs` row with `status = 'running'`
2. Build a BigQuery client from the service account credentials
3. Run the attendance query (rolling 7-day window)
4. For each result row:
   a. Resolve `student_id` (BigQuery source ID) to a canonical `students.id` via `entity_aliases`
   b. If no match found, log a warning and skip the row (don't create orphan records)
   c. Upsert into `attendance_records` using `source_id` as conflict key
5. Run the Beacon outcomes query (rolling 30-day window)
6. Same resolution + upsert pattern
7. Update `sync_runs` row: `status = 'success'`, `records_upserted = total_rows`, `finished_at = now()`
8. On any error: update `sync_runs` row with `status = 'error'`, `error = error.message`

## Error Handling

- BigQuery auth failures → log to `sync_runs` + exit with non-zero code (CloudWatch alerts on non-zero exit)
- Individual row resolution failures → log warning, skip row, continue sync
- Network timeouts → retry up to 3 times with exponential backoff before failing the sync

## Freshness Tracking

Each row in `attendance_records` and `beacon_outcomes` has a `last_synced_at` column updated on every upsert. HQ dashboard shows `max(last_synced_at)` per table as the data freshness indicator.

## Environment Variables Required

```
GOOGLE_SERVICE_ACCOUNT_JSON=   # base64-encoded service account JSON
BIGQUERY_PROJECT_ID=           # GCP project ID
BIGQUERY_DATASET=              # dataset name containing attendance + outcome tables
DATABASE_URL=                  # Postgres connection string
```

## Connector Location

`connectors/bigquery/`

Key files:
- `index.ts` — entrypoint, called by EventBridge via Fargate task
- `queries.ts` — BigQuery SQL queries
- `sync.ts` — main sync orchestration logic
