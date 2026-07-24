# connectors/

Data integration packages that pull from external One package per source means each app or service (Google Drive, Slack, Notion, QuickBooks, etc.) has its own connector. Each connector knows how to talk to that specific system.
One shared contract means every connector follows the same set of rules. Even though they're connecting to different systems, they all work the same way, making them easy to manage.
sync() is the function that pulls the latest data from that source.
runSync() is a wrapper around sync(). It handles things like logging, error handling, and making sure the sync is completed safely.
Upserts rows by a stable sourceId means:
If a record already exists, update it.
If it's new, create it.
Don't create duplicates because every record has a permanent ID from its original source.
Never truncates first means it doesn't delete all the data before syncing. That's important because if something crashes halfway through, you don't lose everything.
Deletes only the rows it didn't see this run means after the sync finishes successfully, it removes records that no longer exist in the original system. This keeps your database in sync without risking data loss.
Document sources chunk text means for things like Google Docs or Slack messages, large documents are broken into smaller pieces so AI can process them more effectively.
Call OpenAI to embed it means each chunk is converted into a numerical representation (an embedding) that lets AI search by meaning, not just keywords. For example, asking "Show me grants about STEM education" can find relevant documents even if they don't contain those exact words.
Every run writes one row to sync_runs means every time a connector syncs, it creates a log entry saying when it ran, whether it succeeded or failed, and other useful details.
Visible on HQ's /sync page means there's an admin dashboard where you can see the status and history of all syncs.
In one sentence

Each connector safely pulls data from one system, updates only what changed, logs every sync, and—if it's documents—prepares the content so AI can search and understand it intelligently.

from me:

the connecters are our ideal workflow for pulling data from specifc places, like slack. the frame work breaks large data into chunks, it upserts into specifc ids so no data is duplicated, it can be interrupted without data being deleted becauyse the connecters dont truncuate.



## Connectors

### aplos/ — Financial Data
Syncs bank accounts, funds, and transactions from the Aplos nonprofit accounting system.
- `aplos-client.ts` — RSA-encrypted OAuth token auth with caching
- `sync-accounts.ts`, `sync-funds.ts`, `sync-transactions.ts` — upsert each data type
- Writes to: `finance_snapshots`

### google-sheets/ — Core Org Data (15 sync modules)
The largest connector — syncs students, attendance, certifications, competencies, employment, postsecondary, enrollment, and financials from 12+ Google Sheets.
- `sheets-client.ts` — Google Sheets API wrapper
- `parse.ts` — Zod-based row validation
- `errors.ts` — `HeaderMismatchError` for schema drift detection
- Individual sync files for each data type (students, attendance, phase outcomes, CRM, etc.)
- Writes to: `students`, `student_phase_outcomes`, `student_certifications`, `student_competencies`, `student_employment`, `student_postsecondary`, `attendance_records`, `enrollment_snapshots`, `finance_snapshots`, `entity_aliases`

### notion/ — Meeting Transcripts & Documents
Syncs Notion pages and databases into `document_chunks` for vector search.
- `notion-client.ts` — Notion API wrapper
- `block-walker.ts` — Recursive Notion block traversal (paragraphs, headings, lists, code)
- `chunker.ts` — Splits content into embedding-sized chunks
- `sync-meetings.ts`, `sync-databases.ts` — sync entry points
- Writes to: `document_chunks`

### google-drive/, slack/, bigquery/, roam/ — Skeletons
Return `status: 'noop'` — implementations pending.

## Shared Pattern
```
sync() → runSync('name', async () => {
  // upsert records by stable sourceId
  // after all upserts: delete stale rows
  return { status: 'ok', recordsUpserted: n }
})
```
Never truncate before insert — always upsert + stale cleanup after.
