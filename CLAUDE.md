# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An internal AI intelligence layer for Elevate215 that lets team members query Claude with live organizational data. Two real data sources: QuickBooks (nonprofit finance — OAuth connect + token refresh live, but the Phase 2 accounting-data sync is **not yet built**, so no financial data flows from it yet) and the PHL School Performance Model ("School Rollup" tab — school-level performance and enrollment data, **live**, 301 rows). The system ingests data through connectors, stores it in Postgres + pgvector, and exposes it to Claude through an MCP server. A Next.js HQ dashboard provides sync status and operational visibility.

`connectors/aplos/` also exists in this repo, but it is **not a data source for Elevate215** — Aplos is Launchpad's own internal accounting system, kept here only as a code-pattern reference for building `connectors/quickbooks/`. It must never be described as syncing Elevate215 data, and it's deliberately hidden from the entire HQ UI (sync status, data-source lists, everywhere). `finance_snapshots` currently still holds leftover Aplos rows from before this distinction was enforced — see Known Gaps.

Primary deployment target is AWS EC2 + Docker (`apps/hq`) / ECS Fargate (`apps/mcp-server`, `apps/sync`), currently blocked on infra access; Vercel is a working fallback for `apps/hq` used to get a live HTTPS URL quickly (e.g. for the QuickBooks OAuth Redirect URI) — see the Deploy block under Commands, and the "App hosting" row in Stack. Because of that, "fully AWS-native" is no longer accurate for `apps/hq` specifically, even though it remains the production target.

This repo began as a fork of a similar internal AI platform built for a different nonprofit client. Every client-specific connector, Prisma model, and MCP tool from that original build was removed during a restructure; the shared architecture (connector pattern, storage layer, MCP server, HQ dashboard) was kept as the template for Elevate215. If you see a reference to that original client's name, program terminology (phases, cohorts, etc.), or a deleted connector (Notion, Slack, Roam, BigQuery, Google Drive) anywhere in code or docs, it's very likely stale — flag it rather than assuming it's still relevant.

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode throughout) |
| HQ App | Next.js 14 (App Router) |
| MCP Server | `@modelcontextprotocol/sdk` (stdio + Streamable HTTP transports) |
| AI Client | `@anthropic-ai/sdk` (Claude is the consumer of the MCP server, not embedded) |
| Embeddings | OpenAI `text-embedding-3-large` (1536 dimensions) — wired but no live connector currently populates `document_chunks` |
| Structured DB | Postgres 16 via Prisma ORM (local Docker today, Neon in production) |
| Vector search | pgvector extension |
| App hosting | `apps/hq`: dual target — AWS EC2 + Docker, SSH-deployed (production target, currently blocked on infra access) **and** Vercel (`apps/hq/vercel.json`, working fallback used to get a live HTTPS URL, e.g. for the QuickBooks OAuth Redirect URI). `apps/mcp-server`/`apps/sync`: AWS ECS Fargate |
| Cron / scheduling | AWS EventBridge |
| Secrets | `.env` file on the host (current); AWS Secrets Manager supported via `USE_AWS_SECRETS=true` |
| Monitoring | Sentry |
| Auth | NextAuth v5 (Auth.js) + Google provider, domain-gated via `AUTH_ALLOWED_DOMAIN` |
| UI | Tailwind (shadcn-style components inline) |
| Tests | Vitest (unit tests across packages; one live-DB MCP integration suite, skipped unless `DATABASE_URL` is `localhost`) |
| CI | GitHub Actions with a pgvector service container |
| Monorepo | pnpm workspaces |

## Connectors

| Connector | Source | Destination | Status |
|---|---|---|---|
| `quickbooks` | Intuit QuickBooks (OAuth) — finance | `connector_credentials` now; `finance_snapshots` once Phase 2 ships | OAuth connect/callback + token refresh live (`connectors/quickbooks/`, thin routes in `apps/hq/app/api/quickbooks/`). **Phase 2 accounting-data sync not yet built** — no financial data flows from QuickBooks yet |
| `google-sheets` | PHL School Performance Model, "School Rollup" tab only | `school_rollup` | ✅ Live — 301 rows loaded, `query_school_rollup` MCP tool registered and working. Reads a local Excel file today (`connectors/google-sheets/data/`); see `school-rollup-extract.ts`'s file comment for the Google Sheets API swap point (Option A) |

`connectors/aplos/` is intentionally **not** in this table — see the note above. It stays in the codebase as a reference pattern only and must never be listed as an Elevate215 data source.

Every connector exports `sync()` which calls `runSync('<name>', ...)` from `packages/db/src/sync-runs.ts` — each run lands in the `sync_runs` table and appears in the HQ `/sync` page (labeled "Data updates" in the UI).

## Commands

```bash
# First-time bootstrap
pnpm install
pnpm db:up                      # start Postgres + pgvector via Docker
pnpm db:generate                # generate Prisma client
pnpm db:push                    # apply schema (no migration file created)

# Daily development
pnpm -r typecheck               # typecheck all packages
pnpm lint                       # lint all packages
pnpm test                       # run all tests (vitest run)
pnpm test:watch                 # run tests in watch mode

# Run a single test file
pnpm exec vitest run connectors/quickbooks/src/quickbooks-client.test.ts

# HQ dashboard
pnpm --filter @lp-ai/hq dev     # Next.js dev server at http://localhost:3000

# MCP server (development — hot-reload via node --watch)
pnpm --filter @lp-ai/mcp-server build     # compile TypeScript first
pnpm --filter @lp-ai/mcp-server dev       # stdio, hot-reload
pnpm --filter @lp-ai/mcp-server dev:http  # HTTP at :8080, hot-reload

# MCP server (production-like)
pnpm --filter @lp-ai/mcp-server start      # stdio (for Claude Desktop)
pnpm --filter @lp-ai/mcp-server start:http # HTTP at :8080 (for ECS / local testing)

# Connector syncs
pnpm sync:sheets                # google-sheets / School Rollup (live)
pnpm sync:aplos                 # aplos (live)
pnpm sync:quickbooks            # quickbooks (noop today — no sync logic yet)
pnpm sync:all                   # all connectors in parallel

# Deploy
#   apps/hq        — dual target:
#     - AWS: EC2 + Docker over SSH, see .github/workflows/deploy.yml (deploy-hq job).
#       This is the production target but is currently blocked on infra access.
#     - Vercel: apps/hq/vercel.json, a working fallback for a live HTTPS URL today
#       (e.g. the QuickBooks OAuth Redirect URI). Not wired into deploy.yml — deploys
#       via Vercel's own git integration / `vercel` CLI, independently of the AWS path.
#   apps/mcp-server, apps/sync — ECS Fargate, same workflow (deploy-mcp-server / deploy-sync jobs)
#   Auto-deploys on push to main (CI-gated; only changed services deploy)
#   Manual: gh workflow run deploy.yml -f services=hq   (or all|mcp-server|sync)
# Task definitions for the Fargate services (mcp-server, sync) live in infra/ecs/*-taskdef.json
# and are actively used by deploy.yml. infra/ecs/hq-taskdef.json is stale/unused — apps/hq
# no longer deploys via ECS, kept only as reference from an earlier deployment approach.

# Database tools
pnpm db:studio                  # open Prisma Studio
pnpm db:migrate                 # deploy pending migrations (production)
pnpm --filter @lp-ai/lib-db migrate:dev  # create new migration file (dev)
pnpm db:down                    # stop the local Postgres container
```

## Architecture

### Package graph

```
apps/hq              → @lp-ai/lib-db, @lp-ai/lib-config, @lp-ai/connector-quickbooks (OAuth connect/callback routes only)
apps/mcp-server      → @lp-ai/lib-db, @lp-ai/lib-config, @lp-ai/lib-embedding
apps/sync            → connectors/* (one-off Fargate task runner for scheduled syncs)
connectors/*         → @lp-ai/lib-db, @lp-ai/lib-config
packages/db          → Prisma client, sync-runs helper
packages/embedding   → OpenAI embedding batch/retry helpers
packages/config      → Zod env schema, AWS Secrets Manager loader
```

`apps/hq` depending on a connector (`connector-quickbooks`) is the one deliberate exception to "apps only depend on packages" — QuickBooks needs a live, publicly-reachable HTTP endpoint for its OAuth handshake, which only the deployed web app can serve. `aplos` and `google-sheets` are pure batch connectors with no such need.

### Key files

- `packages/db/prisma/schema.prisma` — single source of truth for the DB schema; Prisma client is generated to `packages/db/generated/prisma/` (non-standard path)
- `prisma.config.ts` (repo root) — Prisma config pointing at the schema and migrations
- `packages/db/src/sync-runs.ts` — `runSync()` wrapper used by every connector
- `apps/mcp-server/src/make-server.ts` — registers all tools; edit here to add/remove tools
- `apps/mcp-server/src/tool-helpers.ts` — `runTool()` wrapper (error capture + usage logging + permission checks), `parseStr()`, `parseNum()`, `SERVICE_ALLOWED_TOOLS`
- `apps/mcp-server/src/permissions.ts` — the fixed `ROLES` enum and DB-backed tool ACL cache
- `apps/mcp-server/src/usage-log.ts` — writes every tool call to `usage_logs` table; surfaced in HQ `/tools`
- `apps/hq/auth.ts` + `apps/hq/auth.config.ts` — NextAuth v5 config; domain restricted to `AUTH_ALLOWED_DOMAIN`
- `apps/hq/middleware.ts` — gates all routes except `/auth/signin`, `/api/auth`, `/api/health`; supports `HQ_DEV_NO_AUTH=true` bypass for local dev (dev-only — has no effect when `NODE_ENV=production`)

### HQ dashboard routes

| Route | Purpose |
|---|---|
| `/` | Data freshness overview (`finance_snapshots`, `document_chunks`) |
| `/sync` | Connector sync run history (`sync_runs` table) |
| `/tools` | MCP tool call log (`usage_logs` table) |
| `/admin` | MCP OAuth user/role management + tool permissions |
| `/quickbooks/connected`, `/quickbooks/error` | Minimal landing pages for the QuickBooks OAuth callback |
| `/api/health` | Unauthenticated health check |
| `/api/quickbooks/connect`, `/api/quickbooks/callback` | Thin wrappers around `connectors/quickbooks`'s OAuth logic |
| `/auth/signin` | Google OAuth sign-in (whitelisted from auth middleware) |

### Adding a new MCP tool

1. Create `apps/mcp-server/src/tools/<tool-name>.ts` — export `registerXxx(server: McpServer): void`
2. Inside, call `server.registerTool(NAME, { description, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, (input) => runTool(NAME, input, async () => { ... }))` — annotations are required on all tools to avoid per-call approval prompts in Claude
3. Use `toolError(code, message)` or `notImplemented(NAME)` for structured error returns
4. Import and call `registerXxx(server)` in `apps/mcp-server/src/make-server.ts`
5. Update the count in `apps/mcp-server/src/__tests__/tools.test.ts` and add the tool name to the expected list
6. **Add a `tool_permissions` migration** so the tool is accessible to users. Without this, the tool will be blocked for all roles. Create a migration at `packages/db/prisma/migrations/<timestamp>_add_<name>_permission/migration.sql`:
   ```sql
   INSERT INTO "tool_permissions" ("tool_name", "allowed_roles", "category", "description", "updated_at")
   VALUES (
     '<tool_name>',
     ARRAY['<role1>', '<role2>', 'leadership', 'admin'],
     '<category>',
     '<human-readable description>',
     NOW()
   )
   ON CONFLICT ("tool_name") DO NOTHING;
   ```
   Roles come from the fixed `ROLES` enum in `apps/mcp-server/src/permissions.ts` (mirrored in `apps/hq/app/admin/roles.ts`) — currently `pending`, `program_staff`, `development`, `sales`, `finance`, `software_dev`, `leadership`, `admin`. This is a starter taxonomy inherited from the original build; Elevate215's real role set isn't finalized, so double-check before assuming a role name (e.g. there is no plain `staff` role — the closest match is `program_staff`). Categories in use: `donor_finance`, `school_data`, `search`, `skills`, `future`, `other` (`students` also exists from the original build but nothing uses it currently).
7. **If using a new category**, add it to `CATEGORY_ORDER` and `CATEGORY_LABELS` in `apps/hq/app/admin/PermissionsMatrix.tsx`. Without this, tools in the new category won't render on the admin page.
8. Also add the tool to `SERVICE_ALLOWED_TOOLS` in `apps/mcp-server/src/tool-helpers.ts` if service callers (`SYNC_SECRET`-authenticated requests) should be able to invoke it.
9. Apply the migration locally (`pnpm db:migrate`) and to production (via ECS one-off task or bastion — the production DB is not publicly accessible)

### Implementing a connector

All connectors follow the same pattern:

```ts
export async function sync(): Promise<SyncRunRecord> {
  return runSync('connector-name', async () => {
    const env = await loadEnv();
    if (!env.REQUIRED_KEY) return { status: 'noop', notes: 'key not set' };
    // ... upsert records into Prisma ...
    return { status: 'ok', recordsUpserted: n };
  });
}
```

The `runSync` wrapper creates the `sync_runs` row, captures errors, records duration, and runs a **5% integrity guard** — if any declared table drops more than 5% in row count during a sync, an `INTEGRITY WARNING` is appended to the `sync_runs.notes` field.

Pass the `tables` option to declare which tables a connector writes to:
```ts
return runSync('connector-name', async () => { ... }, {
  tables: ['finance_snapshots'],
});
```

**Critical sync safety rule:** NEVER use `deleteMany({})` or `TRUNCATE` before inserting data. If the sync crashes midway, the table is left empty with no recovery. Instead:
1. **Upsert** every row using a stable natural key (e.g. `(aun, schoolNumber)` for School Rollup — never row numbers)
2. **Track** which keys were seen during this run
3. **After all upserts succeed**, delete only rows whose key was NOT seen
4. If the sync fails at any point, existing data is untouched

See `connectors/google-sheets/src/school-rollup-load.ts` as the reference for the upsert + stale-cleanup pattern — note it treats a row as "seen" if it was *attempted* this run, not only if its upsert *succeeded*, so a transient failure on one row doesn't cause the stale-cleanup step to also delete that row's previously-good data.

## Environment Variables

Only `DATABASE_URL` is required at startup; all other keys are validated at call sites. Local `.env` points `DATABASE_URL` at Docker Postgres (`postgresql://lpapp:lpapp@localhost:5433/lpinternal?sslmode=disable`) or a Neon connection string.

In production, set `USE_AWS_SECRETS=true` to have `loadEnv()` (from `@lp-ai/lib-config`) fetch secrets from AWS Secrets Manager under the `lp-internal/` prefix instead of reading `.env`. Currently `apps/hq` in production reads from a `.env` file placed directly on the EC2 host rather than Secrets Manager — faster to stand up, revisit once there's runway. On Vercel, `USE_AWS_SECRETS` should stay unset/`false` — there's no IAM role available there, so `loadEnv()` reads straight from `process.env`, which is exactly what Vercel dashboard env vars populate.

`AUTH_ALLOWED_DOMAIN` is intentionally **different per environment**, not a bug if the two don't match: `launchpadphilly.org` (the schema default) for the AWS/internal deployment, `elevate215.org` for the client-facing Vercel deployment. Set it explicitly per environment rather than relying on the default in either place.

`QUICKBOOKS_CLIENT_ID`/`QUICKBOOKS_CLIENT_SECRET` fall back to `QUICKBOOKS_DEV_CLIENT_ID`/`QUICKBOOKS_DEV_CLIENT_SECRET` when unset (see `connectors/quickbooks/src/quickbooks-client.ts`) — safe to run on Intuit's development keys until production app approval lands. `QUICKBOOKS_REDIRECT_URI` has no such fallback — it must always be set explicitly per environment, and currently points at a placeholder host until the real domain is assigned (see the `TODO` comment next to it in `.env.example`).

Full env schema is in `packages/config/src/schema.ts`. See [docs/runbooks/credentials-checklist.md](docs/runbooks/credentials-checklist.md) for what each key unlocks.

## Coding Conventions

- **TypeScript strict mode** — no `any`, explicit return types on all exported functions, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`
- **Named exports only** — no default exports
- **Prisma** for all Postgres queries; `$queryRaw` / `$queryRawUnsafe` only for pgvector cosine similarity (`<=>`) and raw catalog/integrity queries
- **Zod schemas** for all external data (API responses, tool inputs) and env validation
- **Error handling** — MCP tools return `{ error: { code, message } }` envelopes; connectors throw and let `runSync` capture into the `sync_runs` row
- **Environment variables** — always via the typed `env` object from `@lp-ai/lib-config`, never `process.env` directly in business logic
- **Tests** — colocated `*.test.ts` files next to the source they cover, using `vitest.mock()` for DB/env dependencies rather than a live database (the one exception, `apps/mcp-server/src/__tests__/tools.test.ts`, spawns the real MCP server against a live local Postgres and is gated/skipped unless `DATABASE_URL` contains `localhost`)

## Spec Documents

Before modifying any component, read the relevant spec:

- [Database Schema](docs/database-schema.md) — current Postgres tables
- [MCP Server Spec](docs/mcp-server-spec.md) — current tool definitions with input/output schemas
- Per-connector specs in `docs/data-sources/`

`docs/setup/` contains phase-by-phase AWS infrastructure setup guides written during the original build — useful as a pattern reference for how RDS/ECS/EventBridge/Secrets Manager were wired up, but written around the original client's specifics (account IDs, domain names, credential owners); don't assume every detail applies to Elevate215 as-is.

## Known Gaps

What genuinely isn't built yet, as of this writing:

- **QuickBooks Phase 2** — accounting data doesn't sync into `finance_snapshots` yet. `query_finances` and `get_finance_brief` still read the leftover Aplos rows in that table, not QuickBooks; both need rewiring once Phase 2 ships.
- **Google Sheets API extraction** — School Rollup currently reads a local xlsx file (`connectors/google-sheets/data/`) instead of the live Sheets API. `school-rollup-extract.ts`'s `filePath` parameter is the injectable swap point for that (Option A, per the file's own comment).
- **`finance_snapshots` still has leftover Aplos rows** — these predate the decision to hide Aplos from Elevate215 entirely and should eventually be cleared. Until then, don't read this table from anything Elevate215-facing (the HQ finance dashboard deliberately doesn't).
- **6 open data-dictionary questions on School Rollup**, unanswered by the client — see the "Open Questions" section in [docs/data-sources/school-rollup-dictionary.md](docs/data-sources/school-rollup-dictionary.md).
- **CI/CD is Fargate-oriented for `apps/mcp-server`/`apps/sync`**; `apps/hq` deploys via direct EC2 SSH + `docker run`, not ECS at all (see the Deploy block under Commands). `infra/ecs/hq-taskdef.json` is stale/unused, kept only as reference from an earlier deployment approach — don't assume it's live.
- **`apps/hq/tsconfig.json` is missing `noUncheckedIndexedAccess`**, despite this file documenting it above as a repo-wide convention — causes several `no-unnecessary-condition` lint findings in existing code (e.g. `apps/hq/app/sync/page.tsx`). Fix as a separate cleanup task.

Two items sometimes flagged as gaps that are **already fixed**, worth knowing so they don't get "re-fixed" incorrectly: `.github/workflows/deploy.yml` already triggers on `main` (not just a stale `master`-only trigger — see the inline comment there), and `infra/iam/lp-github-deploy-trust-policy.json`'s OIDC trust is already scoped to the actual repo (`Drdraqounof/Elevate215`), not an old placeholder.

## Setup

New to this project?
1. Read this file end-to-end.
2. Follow [docs/runbooks/local-dev.md](docs/runbooks/local-dev.md) to get a working clone.
3. See [docs/runbooks/credentials-checklist.md](docs/runbooks/credentials-checklist.md) for what each API key unlocks and how to obtain it.
