# Google Drive Connector

## Purpose

Ingests two Google Drive documents that contain student information for use by the AI:
1. **"Student Information for Launchpad LLMs"** — structured student profiles + narrative notes
2. **"Outcomes"** — structured outcome summaries

Structured fields go to Postgres. Long narrative sections go to Pinecone.

## Documents in Scope

Documents are identified by name pattern within a designated Drive folder (`GOOGLE_DRIVE_FOLDER_ID`). Do not hardcode document IDs — scan the folder by name to be resilient to file recreation.

| Document pattern | Structured destination | Unstructured destination |
|---|---|---|
| `Student Information for Launchpad LLMs` | `students`, `student_info` | Pinecone `drive_documents` |
| `Outcomes` | `beacon_outcomes` (if structured) | Pinecone `drive_documents` |

## Structured vs. Unstructured Split

### Goes to Postgres (structured)
- Tabular rows where each row = one student: name, ID, grade, cohort, IEP flag, ELL flag, interests list, goals list
- Any field that is discrete and filterable belongs in Postgres

### Goes to Pinecone (unstructured)
- Paragraph-length narrative notes about individual students
- Free-form outcome summaries that don't fit a table schema
- Any content that requires semantic search to retrieve

When in doubt: if you'd filter by it in a WHERE clause, it's structured. If you'd search for it with a sentence, it's unstructured.

## Sync Schedule

Railway cron: **hourly**

For manual triggering: `pnpm --filter google-drive sync`

## Auth

- Same Google service account as BigQuery connector (`GOOGLE_SERVICE_ACCOUNT_JSON`)
- Service account must have Viewer access to the Drive folder
- Uses Google Drive API v3 and Google Docs API

## Sync Logic (Step by Step)

1. Write `sync_log` row with `status = 'running'`
2. List files in `GOOGLE_DRIVE_FOLDER_ID` matching document name patterns
3. For each matching document:
   a. Export document as plain text (Google Docs API `export` endpoint)
   b. Parse the text to extract structured table rows (simple line-by-line parsing for V0)
   c. Upsert structured fields into Postgres (`students`, `student_info`, `beacon_outcomes`)
   d. Pass remaining narrative text through the [embedding pipeline](../embedding-pipeline.md)
   e. Upsert chunks into Pinecone `drive_documents` namespace
4. Update `sync_log`

## Entity Seeding (Special Case)

The "Student Information for Launchpad LLMs" document is **the primary seed source** for entity resolution. The connector runs entity seeding as its first step:

1. Parse the student table in the document
2. For each student row, upsert into `students` (using email or student ID as conflict key)
3. Create `entity_aliases` rows for: full name (source: 'drive'), student ID (source: 'bigquery'), nickname if present (source: 'drive')

This must complete before the BigQuery connector's first run so student IDs can be resolved.

## Error Handling

- Document not found → log warning, skip document, continue with others
- Parse failures (unexpected document format) → log error with document name, skip to Pinecone embedding of full text as fallback
- Auth failures → fail entire sync, write error to `sync_log`

## Environment Variables Required

```
GOOGLE_SERVICE_ACCOUNT_JSON=   # base64-encoded service account JSON
GOOGLE_DRIVE_FOLDER_ID=        # Drive folder ID containing the source documents
DATABASE_URL=
PINECONE_API_KEY=
PINECONE_INDEX_NAME=
VOYAGE_API_KEY=
```

## Connector Location

`connectors/google-drive/`

Key files:
- `index.ts` — entrypoint
- `drive-client.ts` — Drive API wrapper
- `parse.ts` — document text → structured fields
- `sync.ts` — orchestration
