# Phase 19 — Roam Connector

**Goal:** Build a Roam → pgvector connector. This phase begins with API research since Roam's access model needs to be confirmed before any code is written.

**Prerequisites:**
- Phase 6 complete — `@lp-ai/lib-embedding` and `document_chunks` ready
- Phase 18 complete — Slack connector pattern established (Roam follows the same approach)
- Roam account access + admin permissions

---

## Step 1 (required first): API research

Before writing any code, answer these questions and update this doc with the findings.

### Questions to investigate

1. **Does Roam have a REST API?**
   - Check: [roamresearch.com](https://roamresearch.com) API docs, or the Roam-specific app used by the Launchpad team
   - If it's Roam Research (the note-taking app): check the [Roam API docs](https://roamresearch.com/#/app/developer-documentation) — Roam does have a REST API for graph access

2. **Authentication model**
   - API key? OAuth? User token?
   - Is auth per-graph or per-user?

3. **Data model**
   - What data is available: pages, blocks, daily notes, conversations?
   - Is there a concept of channels or threads?
   - What metadata is on each item: author, timestamp, parent page?

4. **Rate limits and pagination**
   - Requests per minute?
   - Cursor-based or offset pagination?

5. **Export option as fallback**
   - If no REST API exists: does Roam support JSON export?
   - If export-only, the connector becomes a manual process rather than an automated sync

### How to research

```bash
# Check if Roam has public API docs
# Look for: api.roamresearch.com, Roam API in their help docs

# Try a test API call (once you have credentials)
curl -H "Authorization: Bearer <token>" \
  https://api.roamresearch.com/api/graph/<graph-name>/q \
  -d '{"query": "[:find ?e :where [?e :node/title]]"}'
```

**Update this document with findings before proceeding.**

---

## Step 2: Implementation (once API is confirmed)

Based on findings, implement following one of these patterns:

### Pattern A: REST API (preferred)

If Roam exposes a REST API, follow the Slack connector pattern exactly:
- Authenticate with API key or OAuth token
- Fetch pages/blocks since last sync timestamp
- Chunk by page or conversation thread
- Embed with OpenAI + upsert into `document_chunks` with `source = 'roam'`

**`connectors/roam/package.json`:**
```json
{
  "name": "@lp-ai/connector-roam",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "sync": "node --env-file=../../.env dist/index.js",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@lp-ai/lib-db": "workspace:*",
    "@lp-ai/lib-config": "workspace:*",
    "@lp-ai/lib-embedding": "workspace:*",
    "zod": "^3.23.0"
  }
}
```

```typescript
// connectors/roam/src/index.ts
import { embedText } from '@lp-ai/lib-embedding';
import { prisma } from '@lp-ai/lib-db';

const API_KEY = process.env['ROAM_API_KEY'];
const GRAPH = process.env['ROAM_GRAPH_NAME'];

export async function sync(): Promise<void> {
  // Implementation depends on API findings
  // Fetch pages → chunk by page → embed → upsert into document_chunks
}
```

### Pattern B: JSON export (fallback)

If Roam is export-only:
1. Export the graph as JSON from the Roam UI
2. Write a one-time import script that reads the JSON and upserts into `document_chunks`
3. Schedule a manual export + import process (no automated sync)

This is less ideal but still gets the data into pgvector for semantic search.

---

## Environment variables

```bash
ROAM_API_KEY=
ROAM_GRAPH_NAME=
```

Update `lp-internal/roam` in Secrets Manager once credentials are known.

---

## Verification checklist

- [ ] **API research complete** — this doc updated with findings
- [ ] `pnpm sync:roam` runs and populates `document_chunks` with `source = 'roam'`
- [ ] `search_conversations` MCP tool returns Roam content for a relevant query
- [ ] EventBridge rule added for scheduled sync (frequency TBD based on data volume)

---

## Known pitfalls

- **Roam Research uses Datalog queries** — the query interface uses Clojure Datalog, not SQL. The API returns nested blocks. You'll need a flattening step to turn blocks into flat text chunks.
- **Export JSON is deeply nested** — Roam's JSON export format uses `children` arrays recursively. Write a recursive flattener before embedding.

---

**Next:** [20-bigquery-connector.md](20-bigquery-connector.md)
