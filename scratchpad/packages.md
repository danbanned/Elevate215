# packages/

Shared internal libraries used across apps and connectors. Published as workspace packages via pnpm.

## packages/config/ → @lp-ai/lib-config

Centralized environment variable loading and validation. Every app and connector calls `loadEnv()` from here instead of reading `process.env` directly.

- `src/schema.ts` — Zod schema for 90+ env vars (DB URL, API keys, Google sheet IDs, auth secrets, AWS config, Sentry DSNs, feature flags)
- `src/secrets.ts` — If `USE_AWS_SECRETS=true`, fetches from AWS Secrets Manager under `lp-internal/` prefix; otherwise reads `.env`
- `src/index.ts` — Exports `loadEnv()` which validates and returns the typed env object

Empty strings in `.env` are treated as undefined so placeholder lines don't fail validation.

## packages/db/ → @lp-ai/lib-db

Prisma ORM layer — canonical schema, entity resolution, sync tracking, and seed utilities.

- `prisma/schema.prisma` — 30 models: students (80+ columns), staff, all outcome tables, finance, document_chunks (pgvector), sync_runs, usage_logs, mcp_users, tool_permissions, NextAuth tables. Extensions: `vector`, `pg_trgm`
- `prisma/migrations/` — 8 migrations (May–June 2026): initial schema, student v2 fields, Anthropic usage columns, MCP OAuth tables, tool permissions, alias backfill
- `src/client.ts` — Prisma singleton with async adapter; generated client output at `generated/prisma/`
- `src/entity-resolution.ts` — Fuzzy name matching: exact match → trigram (≥0.85 confidence, auto-linked) → below threshold (queued as pending alias)
- `src/sync-runs.ts` — `runSync()` wrapper used by every connector; records start/end time, status, record count, and notes; enforces 5% integrity guard (warns if a table drops >5% row count)
- `src/seed.ts` / `seed-cli.ts` — Seeds staff roster, initial aliases, and default tool permissions

## packages/embedding/ → @lp-ai/lib-embedding

OpenAI embedding wrapper with batching and retry logic.

- `src/index.ts` — `embedText(text)` for single embeddings; `embedBatch(texts[])` for bulk with 100-per-batch chunking, 100ms inter-batch delay, exponential backoff (500ms base, 5 retries max)
- Model: `text-embedding-3-large` (1536 dimensions)
- Retries on 429 (rate limit) and 5xx errors
- `resetClient()` exported for test isolation
