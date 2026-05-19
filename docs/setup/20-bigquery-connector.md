# Phase 20 — BigQuery Connector (Source Pull)

**Goal:** Build a read-only BigQuery → Postgres connector that pulls outcome and enrollment data from the existing `lp-internal-ai` BigQuery project into Postgres, where it becomes queryable through the MCP tools.

**Prerequisites:**
- Phase 4 complete — Prisma schema ready
- Phase 3 complete — `GOOGLE_SERVICE_ACCOUNT_JSON` in Secrets Manager (same service account used for Sheets/Drive, if it has BigQuery access)
- BigQuery project `lp-internal-ai` accessible
- Service account has `BigQuery Data Viewer` + `BigQuery Job User` roles on the project

---

## 1. Grant the service account BigQuery access

In Google Cloud Console:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → project `lp-internal-ai`
2. **IAM & Admin → IAM → Grant Access**
3. Add the service account email
4. Roles to assign:
   - `BigQuery Data Viewer` — read table data
   - `BigQuery Job User` — run queries

Or via CLI:
```bash
gcloud projects add-iam-policy-binding lp-internal-ai \
  --member="serviceAccount:<service-account-email>" \
  --role="roles/bigquery.dataViewer"

gcloud projects add-iam-policy-binding lp-internal-ai \
  --member="serviceAccount:<service-account-email>" \
  --role="roles/bigquery.jobUser"
```

---

## 2. Discover what's in BigQuery

Before building the sync, explore what tables exist:

```bash
# List datasets
bq ls --project_id=lp-internal-ai

# List tables in a dataset
bq ls lp-internal-ai:<dataset-name>

# Preview a table
bq head --max_rows=5 lp-internal-ai:<dataset>.<table>

# Describe schema
bq show lp-internal-ai:<dataset>.<table>
```

Document the tables and their schemas here before writing the sync code.

**Known tables (update as discovered):**
| BigQuery table | Description | Target Postgres table |
|---|---|---|
| TBD | TBD | TBD |

---

## 3. Scaffold the connector

```bash
mkdir -p "/Users/christian/Documents/Claude/Projects/LP Internal AI V1/connectors/bigquery/src"
```

**`connectors/bigquery/package.json`:**
```json
{
  "name": "@lp-ai/connector-bigquery",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "sync": "node --env-file=../../.env dist/index.js",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@lp-ai/db": "workspace:*",
    "@lp-ai/config": "workspace:*",
    "@google-cloud/bigquery": "^7.0.0",
    "zod": "^3.23.0"
  }
}
```

---

## 4. Implement the sync

```typescript
import { BigQuery } from '@google-cloud/bigquery';
import { prisma } from '@lp-ai/db';

const bigquery = new BigQuery({
  projectId: process.env['BIGQUERY_PROJECT_ID'],
  credentials: JSON.parse(
    Buffer.from(process.env['GOOGLE_SERVICE_ACCOUNT_JSON'] ?? '', 'base64').toString('utf-8')
  ),
});

async function syncOutcomes(): Promise<void> {
  const [rows] = await bigquery.query({
    query: `
      SELECT
        student_name,
        phase,
        outcome,
        exit_reason,
        start_date,
        end_date
      FROM \`lp-internal-ai.<dataset>.outcomes\`
      WHERE updated_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    `,
  });

  for (const row of rows) {
    const student = await prisma.student.findFirst({
      where: { canonicalName: row.student_name },
    });
    if (!student) continue;

    await prisma.studentPhaseOutcome.upsert({
      where: {
        studentId_phase: { studentId: student.id, phase: row.phase },
      },
      update: {
        outcome: row.outcome,
        exitReason: row.exit_reason,
        endDate: row.end_date,
        syncedAt: new Date(),
      },
      create: {
        studentId: student.id,
        phase: row.phase,
        outcome: row.outcome,
        exitReason: row.exit_reason,
        startDate: row.start_date,
        endDate: row.end_date,
      },
    });
  }

  console.warn(`Synced ${rows.length} outcome records from BigQuery`);
}

export async function sync(): Promise<void> {
  await syncOutcomes();
  // Add more sync functions as tables are discovered
}

await sync();
```

---

## 5. Conflict resolution: BigQuery vs Google Sheets

Both BigQuery and Google Sheets may provide outcome/enrollment data. When both sources are active, BigQuery is authoritative for that data. The connector should overwrite Sheets-sourced data for the same student + phase combination.

Add a `source` field to track where each row came from:

```typescript
await prisma.studentPhaseOutcome.upsert({
  update: { ...data, source: 'bigquery', syncedAt: new Date() },
  create: { ...data, source: 'bigquery' },
});
```

If a student has a BigQuery record, skip the Sheets record for the same outcome.

---

## Verification checklist

- [ ] Service account has `BigQuery Data Viewer` and `BigQuery Job User` roles
- [ ] `bq ls lp-internal-ai` lists the expected datasets
- [ ] `pnpm sync:bigquery` runs and pulls data without permission errors
- [ ] Synced rows appear in `student_phase_outcomes` with `source = 'bigquery'`
- [ ] `query_outcomes` MCP tool returns BigQuery-sourced data
- [ ] EventBridge rule added (recommended: hourly)

---

## Known pitfalls

- **BigQuery query costs** — each query scans data and costs $5/TB. Use `WHERE updated_at >=` clauses to scan only recent data. Avoid `SELECT *` on large tables.
- **Schema drift** — BigQuery schemas evolve. Add Zod validation on the query results and alert (Sentry) if expected columns are missing.
- **Entity matching** — BigQuery uses student names; Postgres uses UUIDs. The connector must resolve names via `entity_aliases` before upserting. If no match is found, log the unmatched name for manual review.

---

**Next:** [21-athena-s3.md](21-athena-s3.md)
