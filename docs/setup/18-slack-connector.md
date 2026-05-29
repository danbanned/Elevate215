# Phase 18 — Slack Connector

**Goal:** Build a Slack → pgvector connector that ingests messages from designated channels, embeds them with OpenAI, and stores them in `document_chunks` so the `search_conversations` MCP tool can surface them.

**Prerequisites:**
- Phase 6 complete — `@lp-ai/lib-embedding` package built, `document_chunks` table ready
- Phase 3 complete — `SLACK_BOT_TOKEN` in Secrets Manager
- Slack workspace admin access to create an app

---

## 1. Create the Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App → From scratch**
2. Name: `LP Internal AI`, Workspace: Launchpad
3. **OAuth & Permissions → Bot Token Scopes**, add:
   - `channels:history` — read messages from public channels
   - `channels:read` — list channels
   - `groups:history` — read messages from private channels (if needed)
   - `users:read` — resolve user IDs to names
4. **Install to Workspace** → copy the **Bot User OAuth Token** (`xoxb-...`)
5. Invite the bot to each channel you want to ingest: `/invite @LP Internal AI`
6. Store the token:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id lp-internal/slack \
     --secret-string '{"SLACK_BOT_TOKEN":"xoxb-..."}'
   ```

---

## 2. Choose which channels to ingest

Not every channel should be indexed. Recommended starting set:
- `#programs` — program operations discussions
- `#development` — fundraising conversations
- `#staff-general` — general team communications

Add these channel IDs to the connector config. Channel IDs (not names) are stable across renames.

```typescript
const CHANNELS_TO_SYNC = [
  'C0XXXXXXX', // #programs
  'C0YYYYYYY', // #development
  'C0ZZZZZZZ', // #staff-general
];
```

---

## 3. Scaffold the connector

```bash
mkdir -p "/Users/christian/Documents/Claude/Projects/LP Internal AI V1/connectors/slack/src"
```

**`connectors/slack/package.json`:**
```json
{
  "name": "@lp-ai/connector-slack",
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
    "@slack/web-api": "^7.0.0",
    "zod": "^3.23.0"
  }
}
```

---

## 4. Implement the sync

```typescript
import { WebClient } from '@slack/web-api';
import { embedText } from '@lp-ai/lib-embedding';
import { prisma } from '@lp-ai/lib-db';

const slack = new WebClient(process.env['SLACK_BOT_TOKEN']);

async function syncChannel(channelId: string): Promise<void> {
  // Only fetch messages since last sync
  const lastSync = await prisma.documentChunk.findFirst({
    where: { source: 'slack', sourceId: { startsWith: channelId } },
    orderBy: { syncedAt: 'desc' },
    select: { syncedAt: true },
  });

  const oldest = lastSync
    ? String(lastSync.syncedAt.getTime() / 1000)
    : String(Date.now() / 1000 - 30 * 24 * 60 * 60); // 30 days back on first run

  let cursor: string | undefined;
  do {
    const result = await slack.conversations.history({
      channel: channelId,
      oldest,
      limit: 200,
      cursor,
    });

    for (const msg of result.messages ?? []) {
      if (!msg.text || msg.subtype) continue;

      const sourceId = `${channelId}_${msg.ts ?? ''}`;
      const embedding = await embedText(msg.text);

      await prisma.$executeRaw`
        INSERT INTO document_chunks (id, source, source_id, content, embedding, metadata, synced_at)
        VALUES (
          gen_random_uuid(),
          'slack',
          ${sourceId},
          ${msg.text},
          ${JSON.stringify(embedding)}::vector,
          ${JSON.stringify({ channel: channelId, user: msg.user, ts: msg.ts })}::jsonb,
          NOW()
        )
        ON CONFLICT (source, source_id) DO UPDATE
          SET content = EXCLUDED.content,
              embedding = EXCLUDED.embedding,
              synced_at = NOW()
      `;
    }

    cursor = result.response_metadata?.next_cursor;
  } while (cursor);
}

export async function sync(): Promise<void> {
  for (const channelId of CHANNELS_TO_SYNC) {
    await syncChannel(channelId);
    console.warn(`Synced channel ${channelId}`);
  }
}

await sync();
```

---

## 5. Add the unique constraint to `document_chunks`

The upsert above requires a unique constraint on `(source, source_id)`. Add to `prisma/schema.prisma`:

```prisma
model DocumentChunk {
  // ...existing fields...
  @@unique([source, sourceId])
}
```

Then migrate: `pnpm db:migrate:dev -- --name add-document-chunk-unique`

---

## Verification checklist

- [ ] Slack app created and bot installed to workspace
- [ ] Bot invited to target channels
- [ ] `pnpm sync:slack` runs and populates `document_chunks` with `source = 'slack'`
- [ ] `search_conversations` MCP tool returns Slack messages for a relevant query
- [ ] EventBridge rule added for hourly sync

---

## Known pitfalls

- **Bot not in channel** — the bot must be explicitly invited to each channel. `/invite @LP Internal AI` in each channel.
- **Rate limits** — Slack Tier 3 methods (conversations.history) allow 50 requests/minute. The connector is well within this for normal use.
- **Message threading** — this connector ingests top-level messages only. Thread replies are not ingested unless you add a `conversations.replies` call per threaded message.

---

**Next:** [19-roam-connector.md](19-roam-connector.md)
