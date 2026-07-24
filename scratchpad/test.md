# test/

Shared test infrastructure for the monorepo. Minimal — just environment setup for Vitest.

## Files

| File | What it does |
|---|---|
| `setup-env.ts` | Loads `.env` from the repo root before any tests run using `dotenv`; uses `fileURLToPath` for ESM-compatible path resolution |

## How it's used

`vitest.config.ts` at the root points `setupFiles` here. All live-DB integration tests are gated on `DATABASE_URL` containing `localhost` — they skip automatically in CI unless the pgvector service container is running. MCP integration tests spawn the actual server binary via `McpStdioClient`.
