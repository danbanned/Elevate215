# Roam Connector

**Status:** Research required (V1)
**Destination:** `document_chunks` (pgvector)
**Schedule:** TBD pending API research

## Overview

Ingests messages and content from Roam (a chat/messaging app used by the Launchpad team) into pgvector for semantic search. Content is chunked, embedded via OpenAI `text-embedding-3-large`, and stored alongside Drive and Slack content in `document_chunks`.

## API Research Needed

Before implementation (Phase 19), the following must be confirmed:

1. **What API or export mechanism does Roam expose?**
   - REST API with auth token?
   - Webhook-based push?
   - Export-only (e.g., JSON dump)?

2. **Authentication model** — API key, OAuth, or user token?

3. **Data model** — message threads, channels, DMs? What metadata is available (author, timestamp, channel)?

4. **Rate limits and pagination**

## Planned sync strategy

Once API access is confirmed, ingest messages from designated channels/spaces. Chunk by message thread or conversation window. Embed and upsert into `document_chunks` with `source = 'roam'`.

## Environment variables

```
ROAM_API_KEY=
ROAM_GRAPH_NAME=
```

## Implementation notes

- To be implemented in Phase 19
- No V0 stub exists — this is a net-new connector
- Start with API research; update this doc before writing any code
