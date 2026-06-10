# Slack Connector

> **Status: Deferred to V0.2.** Not part of the V0.1 thin-slice build. The Slack app is created and configured in advance (see `PRE_BUILD_CHECKLIST.md` V0.2 section), but the connector itself ships in V0.2.

## Purpose

Ingests Slack messages from all public channels and opted-in private channels into pgvector (`document_chunks` table) for semantic search. Enables questions like "What has the team been saying about student X?" and "What was discussed in #general about the spring showcase?"

## Channel Scope

- **All public channels** — automatically included
- **Private channels** — included only if the channel has been opted in (see below)
- **Direct messages** — excluded (privacy boundary for V0)

## Private Channel Opt-In Mechanism

For V0, opt-in is managed via a plaintext file in the designated Google Drive folder: `slack-private-channels.txt`. Each line is a channel ID. The connector reads this file at the start of each sync. A channel owner adds their channel ID to opt in.

This avoids building a UI for V0. Phase 1 can add a proper UI.

## Historical Backfill

On first run, the connector backlogs up to **180 days** of history per channel. Subsequent runs are incremental (only messages newer than the last successful sync timestamp for that channel).

Backfill rate limiting: Slack's Web API allows ~20 requests/minute per token for conversation history. The connector uses a 100ms delay between channel history requests during backfill to stay well under limits. Full backfill of a large workspace may take 30–60 minutes and should run as a one-time manual trigger, not during the regular hourly cron.

## Sync Approach

**Polling (not Socket Mode).** The connector runs on an hourly AWS EventBridge schedule (via `apps/sync` Fargate task) and fetches messages newer than the last sync timestamp. Socket Mode (real-time events) adds operational complexity and isn't necessary where hourly freshness is acceptable.

Last sync timestamp per channel is stored in Postgres (`sync_runs` table with channel_id in a metadata JSON column).

## Message Chunking Strategy

Slack messages are chunked at the **thread level** for V0:
- A top-level message + all its replies = one logical unit
- If a thread is short (≤300 tokens total), it becomes one chunk
- If a thread is long (>300 tokens), it is split at reply boundaries, with 1–2 replies of overlap between chunks

Rationale: preserving thread context makes search results dramatically more useful — a reply without its parent is often meaningless.

## Metadata per Chunk

Key metadata fields (stored in `document_chunks.metadata` JSON): `channel_id`, `channel_name`, `author_id`, `author_name`, `timestamp`, `thread_ts`, `entity_ids`.

Entity ID resolution: the connector attempts to resolve `author_id` (Slack user ID) and any `@mentions` in the message text to canonical entity UUIDs via the entity alias graph.

## Bot Scopes Required

The Slack bot token (`SLACK_BOT_TOKEN`) must have these OAuth scopes:

```
channels:history        # read public channel messages
channels:read           # list public channels
groups:history          # read private channel messages (opted-in)
groups:read             # list private channels bot is added to
users:read              # resolve user IDs to display names
users:read.email        # resolve user emails for entity matching
```

For private channel access, the bot must be **manually invited** to each opted-in channel (`/invite @lp-ai-bot`).

## Error Handling

- Rate limit (429) → respect `Retry-After` header, wait, retry
- Channel access denied → log warning, skip channel, continue
- Individual message parse errors → log and skip, do not fail entire sync

## Environment Variables Required

```
SLACK_BOT_TOKEN=               # xoxb- token
DATABASE_URL=
OPENAI_API_KEY=                # for text-embedding-3-large embeddings
GOOGLE_SERVICE_ACCOUNT_JSON=   # to read the opt-in file from Drive
GOOGLE_DRIVE_FOLDER_ID=        # same Drive folder, for slack-private-channels.txt
```

## Connector Location

`connectors/slack/`

Key files:
- `index.ts` — entrypoint
- `slack-client.ts` — Slack Web API wrapper
- `channels.ts` — channel list + opt-in logic
- `backfill.ts` — one-time historical backfill
- `sync.ts` — incremental sync orchestration
