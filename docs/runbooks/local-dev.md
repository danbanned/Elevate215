# Local Development Runbook

Goal: a fresh clone runs end-to-end on Docker Postgres in ~5 minutes — no AWS, no real API keys required for the parts that don't need one.

## Prerequisites

- Node.js ≥ 22 (`node --version`)
- pnpm ≥ 10 (`npm install -g pnpm@latest`)
- Docker Desktop running

## Bootstrap

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Bring up local Postgres + pgvector
pnpm db:up

# 3. Create the local .env from the template (already exists if you cloned the repo)
cp .env.example .env   # only if .env is missing

# 4. Apply the schema to the local DB (uses prisma db push, non-interactive)
pnpm db:generate
pnpm --filter @lp-ai/lib-db push

# 5. Verify
pnpm -r typecheck
pnpm test
```

## Running the apps

### HQ dashboard
```bash
pnpm --filter @lp-ai/hq dev          # http://localhost:3000
```

If HQ logs `MissingSecret` or Prisma attempts to connect with mock credentials, start HQ with explicit local env vars:

```bash
AUTH_SECRET=local-dev-secret-not-for-production-use-only \
DATABASE_URL='postgresql://lpapp:lpapp@localhost:5433/lpinternal?sslmode=disable' \
pnpm --filter @lp-ai/hq dev
```

Then validate:

```bash
curl http://localhost:3000/api/health
```

The dashboard reads from local Postgres. Sign-in is gated by Google OAuth + domain check; the middleware will redirect you to `/auth/signin`. For local dev you can either:
- Set `HQ_DEV_NO_AUTH=true` (only takes effect when `NODE_ENV=development` — has no effect in a production build), or
- Create a Google OAuth client (see `docs/setup/08-hq-dashboard.md`) and fill in `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` in `.env`.

### MCP server (stdio — for Claude Desktop)
```bash
pnpm --filter @lp-ai/mcp-server build
pnpm --filter @lp-ai/mcp-server start
```

Point Claude Desktop at the built `dist/index.js` (see `docs/setup/07-mcp-server.md`).

### MCP server (HTTP — for the ECS Fargate deployment / local testing)
```bash
pnpm --filter @lp-ai/mcp-server build
pnpm --filter @lp-ai/mcp-server start:http   # http://localhost:8080
```

Probe it:
```bash
curl http://localhost:8080/health
curl -X POST http://localhost:8080/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

If `SYNC_SECRET` is set in `.env`, the `/mcp` endpoint requires `Authorization: Bearer <SYNC_SECRET>`.

## Connectors

Each connector exposes a CLI:
```bash
pnpm sync:sheets       # google-sheets — School Rollup (live, reads a local Excel file)
pnpm sync:aplos        # aplos (live)
pnpm sync:quickbooks   # quickbooks (noop today — OAuth/token-refresh only, no data sync yet)
```

Each run writes a row to `sync_runs` — visible in HQ at `/sync`.

## Smoke-test the full pipeline

```bash
# 1. Stdio MCP: list available tools
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node apps/mcp-server/dist/index.js | tail -1

# 2. HQ health endpoint
curl http://localhost:3000/api/health

# 3. Watch usage_logs populate after a tool call
psql "$DATABASE_URL" -c "SELECT tool_name, duration_ms, called_at FROM usage_logs ORDER BY called_at DESC LIMIT 5;"
```

## Building & deploying the app images

- `apps/hq` deploys to EC2 via Docker over SSH — see `.github/workflows/deploy.yml`'s `deploy-hq` job. Auto-deploys on push to `main` (or `master`), or manually with `gh workflow run deploy.yml -f services=hq`.
- `apps/mcp-server` / `apps/sync` still deploy to ECS Fargate, same workflow file.

You do not build or push images by hand for local development; `pnpm dev` runs the apps directly against local Postgres.

## Common operations

| Task | Command |
|---|---|
| Reset local DB | `pnpm db:down && pnpm db:up && pnpm --filter @lp-ai/lib-db push` |
| Open Prisma Studio (GUI) | `pnpm db:studio` |
| Tail Postgres logs | `docker logs -f lp-internal-postgres` |
| Run a single test file | `pnpm exec vitest run connectors/quickbooks/src/quickbooks-client.test.ts` |
| Rebuild Prisma client after schema change | `pnpm db:generate` then `pnpm --filter @lp-ai/lib-db push` |

## Known things that won't work without credentials

- MCP tools that embed (`search_documents`) — require `OPENAI_API_KEY`; will also return nothing until a connector actually populates `document_chunks`
- AWS Secrets Manager fetch path — requires `USE_AWS_SECRETS=true` and an authenticated AWS environment
- Google OAuth sign-in to HQ — requires `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (or set `HQ_DEV_NO_AUTH=true` for local dev only)
- QuickBooks OAuth connect flow — requires `QUICKBOOKS_CLIENT_ID`/`_SECRET` (or the `_DEV_*` fallbacks) and `QUICKBOOKS_REDIRECT_URI`

**Connectors live with credentials:** `sync:aplos`, `sync:sheets`. `sync:quickbooks` runs but doesn't sync data yet (OAuth/token-refresh only).

Everything else above works against a clean clone.
