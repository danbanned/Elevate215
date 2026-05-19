# Phase 5 — Google Connectors (Sheets + Drive)

**Goal:** Set up the Google service account, port both connectors from V0 with Prisma replacing Drizzle at the insert layer, and verify a full sync against RDS.

**Prerequisites:**
- Phase 4 complete — Prisma schema migrated, all tables exist
- Google Cloud project with the service account used in V0 (`GOOGLE_SERVICE_ACCOUNT_JSON`)
- All `GOOGLE_SHEETS_*` IDs from V0's `.env.example` (same sheets, same IDs)

---

## 1. Verify the Google service account

The V0 service account should already have access to the relevant Sheets and Drive folder. Verify:

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Navigate to **IAM & Admin → Service Accounts**
3. Confirm the service account exists and has a key
4. If no key exists, create one: **Actions → Manage keys → Add key → JSON** → download
5. Base64-encode it:

```bash
base64 -i path/to/service-account.json | tr -d '\n'
```

Store this value as `GOOGLE_SERVICE_ACCOUNT_JSON` in `.env` and update `lp-internal/google` in Secrets Manager.

---

## 2. Scaffold the connectors

```bash
# Google Sheets connector
mkdir -p "/Users/christian/Documents/Claude/Projects/LP Internal AI V1/connectors/google-sheets/src"

# Google Drive connector
mkdir -p "/Users/christian/Documents/Claude/Projects/LP Internal AI V1/connectors/google-drive/src"
```

Both connectors follow the same package structure. Example for google-sheets:

**`connectors/google-sheets/package.json`:**
```json
{
  "name": "@lp-ai/connector-google-sheets",
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
    "googleapis": "^140.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.5"
  }
}
```

---

## 3. Port the Sheets connector from V0

The parse logic (tab-by-tab row transformations) is copied unchanged from V0. Only the insert layer changes: `db.insert(table).values(rows)` → `prisma.modelName.upsert(...)`.

**Key files to port from V0** (copy then adapt):
- `connectors/google-sheets/src/sync-students.ts`
- `connectors/google-sheets/src/sync-enrollment.ts`
- `connectors/google-sheets/src/sync-development-crm.ts`
- `connectors/google-sheets/src/sync-attendance.ts`
- `connectors/google-sheets/src/sync-student-competency.ts`
- `connectors/google-sheets/src/sync-phase-dashboard.ts`

**Pattern change (Drizzle → Prisma):**

V0 (Drizzle):
```typescript
await db.insert(students).values(rows).onConflictDoUpdate({
  target: students.canonicalName,
  set: { updatedAt: new Date() }
});
```

V1 (Prisma):
```typescript
for (const row of rows) {
  await prisma.student.upsert({
    where: { canonicalName: row.canonicalName },
    update: { ...row, updatedAt: new Date() },
    create: row,
  });
}
```

---

## 4. Port the Drive connector from V0

The chunking logic is unchanged. Changes:
- Replace Drizzle insert → Prisma upsert on `document_chunks`
- Replace Voyage AI embedding call → OpenAI embedding call (see Phase 6 for the embedding package)

For now, implement the Drive connector without embeddings (store content only) and add embeddings after Phase 6 completes.

**`connectors/google-drive/src/sync-drive.ts`** — key pattern:

```typescript
await prisma.documentChunk.upsert({
  where: { sourceId: chunk.driveFileId + '_' + chunk.chunkIndex },
  update: { content: chunk.content, syncedAt: new Date() },
  create: {
    source: 'google-drive',
    sourceId: chunk.driveFileId + '_' + chunk.chunkIndex,
    title: chunk.title,
    content: chunk.content,
  },
});
```

---

## 5. Run the Sheets sync

```bash
cd "/Users/christian/Documents/Claude/Projects/LP Internal AI V1"
pnpm --filter @lp-ai/connector-google-sheets build
pnpm sync:sheets
```

Expected output: row counts per tab (students, enrollment, certifications, etc.)

Spot-check in Prisma Studio:

```bash
pnpm db:studio
```

Navigate to `students` table — confirm rows match what's in the Google Sheet.

---

## 6. Run the Drive sync

```bash
pnpm --filter @lp-ai/connector-google-drive build
pnpm sync:drive
```

Expected output: file count + chunk count written to `document_chunks`.

---

## Verification checklist

- [ ] `pnpm sync:sheets` completes without errors
- [ ] `students` table in Prisma Studio shows real student records
- [ ] `attendance_records`, `student_competencies`, `enrollment_snapshots` populated
- [ ] `donor_contacts`, `donor_gifts` populated from Development CRM sheet
- [ ] `pnpm sync:drive` completes without errors
- [ ] `document_chunks` table shows rows with `source = 'google-drive'`

---

## Known pitfalls

- **403 on Sheets API** — service account must be shared on each Google Sheet explicitly (open sheet → Share → paste service account email)
- **Drive folder access** — service account must have Viewer access on the Drive folder
- **Upsert key conflicts** — ensure upsert `where` clauses use a stable unique key (canonical name for students, not auto-generated ID)

---

**Next:** [06-embeddings-pgvector.md](06-embeddings-pgvector.md)
