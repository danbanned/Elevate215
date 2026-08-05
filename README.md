# Elevate215 — Internal AI

An internal AI intelligence layer for Elevate215 that lets team members query Claude with live organizational data — QuickBooks finance data and PHL School Performance Model school-performance data, with the same architecture ready to take on additional sources later.

This repo began as a fork of an internal AI platform originally built for a different nonprofit client (Launchpad) and was restructured into a standalone project for Elevate215: every Launchpad-specific connector, data model, and MCP tool was removed; the shared architecture (connector pattern, Postgres + pgvector storage, MCP server, HQ dashboard) was kept as the foundation.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Folder Structure](#folder-structure)
- [Workspace Packages](#workspace-packages)
- [Getting Started](#getting-started)
- [Package Management](#package-management)
- [MCP Tools](#mcp-tools)
- [Connectors](#connectors)
- [Current Status](#current-status)

---

## System Architecture

Four logical layers: **data sources → connectors → storage → MCP server + Claude**, with the HQ dashboard running alongside.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA SOURCES                                │
│                                                                     │
│  Aplos                    PHL School Performance Model             │
│  (nonprofit accounting)   (local Excel export today — "School      │
│                            Rollup" tab; Google Sheets API later)    │
│                                                                     │
│  QuickBooks (Intuit) — OAuth connect/callback + token refresh live; │
│  accounting-data sync not yet built                                 │
└───────────────────────┬─────────────────────────────────────────────┘
                        │  scheduled syncs (AWS EventBridge → Fargate)
                        │  manual: pnpm sync:<name>
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     CONNECTORS  (3)                                 │
│                                                                     │
│  Each connector runs sync() → calls runSync() → writes to          │
│  sync_runs table. Errors are captured; HQ dashboard shows status.  │
│                                                                     │
│  aplos           google-sheets (School Rollup)      quickbooks     │
└───────────────────────┬─────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        STORAGE                                      │
│                                                                     │
│  Postgres 16 + pgvector (Neon, serverless)                          │
│  ├── finance_snapshots        — generic tab/row JSON sink (Aplos)   │
│  ├── school_rollup             — wide table, one row per school     │
│  │     (~45 columns, PHL School Performance Model)                  │
│  ├── connector_credentials     — QuickBooks OAuth tokens            │
│  ├── sync_runs, usage_logs, tool_permissions                        │
│  ├── users/accounts/sessions   — NextAuth (HQ sign-in)               │
│  ├── mcp_users, oauth_clients, oauth_authorization_codes,           │
│  │     oauth_refresh_tokens    — MCP OAuth 2.0 (tool-level access)  │
│  └── document_chunks (pgvector) — generic semantic-search sink,     │
│        not currently populated by any live connector                │
└───────────────────────┬─────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   MCP SERVER  (5 tools)                             │
│                                                                     │
│  Exposes structured Prisma queries + pgvector semantic search       │
│  as Model Context Protocol tools.                                   │
│                                                                     │
│  Transport A: stdio  → Claude Desktop (local)                       │
│  Transport B: Streamable HTTP → AWS ECS Fargate behind ALB          │
│                                                                     │
│  All tool calls are logged to usage_logs for adoption tracking.     │
│  All tools return structured { error: { code, message } } on fail. │
└───────────────────────┬─────────────────────────────────────────────┘
                        │  MCP protocol
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CLAUDE (Anthropic)                               │
│                                                                     │
│  Receives tool definitions + calls tools at query time.            │
│  Composes answers from structured data + semantic search results.   │
│  Team members interact via Claude Desktop or any MCP-capable client.│
└─────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────┐
                    │   HQ DASHBOARD       │
                    │   (Next.js 14)       │
                    │                      │
                    │  /        freshness  │
                    │  /sync    sync runs  │
                    │  /tools   tool logs  │
                    │  /admin   permissions│
                    │                      │
                    │  Auth: NextAuth v5   │
                    │  Google OAuth        │
                    │  domain-gated        │
                    │  (AUTH_ALLOWED_DOMAIN│
                    │   — see note below)  │
                    └──────────────────────┘
```

At query time, Claude calls MCP tools → the server runs Prisma queries or pgvector similarity search → results are returned and synthesized into a natural-language answer. At sync time, EventBridge (or `pnpm sync:<name>`) triggers a connector → it upserts rows via Prisma → every run writes a result to `sync_runs`.

**Known gap to close before onboarding real Elevate215 users:** `AUTH_ALLOWED_DOMAIN` in `packages/config/src/schema.ts` still defaults to the original client's domains (`launchpadphilly.org,b-21.org`) as a placeholder — set the real env var to Elevate215's Google Workspace domain(s) before relying on the default.

---

## Tech Stack

### Application layer

| Concern | Technology | Notes |
|---|---|---|
| Language | TypeScript 5 (strict) | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Monorepo | pnpm workspaces | 8 workspace packages |
| HQ Dashboard | Next.js 14 (App Router) | Standalone Docker image |
| Auth | NextAuth v5 (Auth.js) | Google OAuth, domain-gated via `AUTH_ALLOWED_DOMAIN` |
| MCP Server | `@modelcontextprotocol/sdk` | stdio + Streamable HTTP transports |
| Embeddings | OpenAI `text-embedding-3-large` | 1536 dimensions; wired but no live connector populates `document_chunks` yet |
| ORM | Prisma | All queries; `$queryRaw` only for pgvector + integrity checks |
| Database | Postgres 16 + pgvector + pg_trgm | Neon (serverless) |
| Validation | Zod | All external data and env vars |
| Tests | Vitest | Unit tests across packages; one live-DB MCP integration suite (skipped unless `DATABASE_URL` is `localhost`) |
| CI | GitHub Actions | pgvector service container; full suite on every push |

### Infrastructure & tooling

| Concern | Technology |
|---|---|
| App hosting — `apps/hq` | EC2 + Docker (SSH-deployed; see `.github/workflows/deploy.yml`) |
| App hosting — `apps/mcp-server`, `apps/sync` | AWS ECS Fargate |
| Scheduling | AWS EventBridge |
| Secrets | `.env` file on the host (current); AWS Secrets Manager supported via `USE_AWS_SECRETS=true` |
| Monitoring | Sentry |

---

## Folder Structure

```
Elevate215/
├── apps/
│   ├── hq/                          # Next.js 14 HQ dashboard
│   │   ├── app/
│   │   │   ├── page.tsx             # / — data freshness overview
│   │   │   ├── sync/page.tsx        # /sync — connector sync run history
│   │   │   ├── tools/page.tsx       # /tools — MCP tool call log
│   │   │   ├── admin/page.tsx       # /admin — MCP OAuth + tool permissions
│   │   │   ├── quickbooks/          # /quickbooks/connected, /error — OAuth landing pages
│   │   │   ├── api/quickbooks/      # OAuth connect + callback routes (thin wrappers over
│   │   │   │                        #   connectors/quickbooks)
│   │   │   └── api/health/route.ts  # GET /api/health (unauthenticated)
│   │   ├── auth.ts                  # NextAuth v5 config + Google provider
│   │   ├── middleware.ts            # Route guard (HQ_DEV_NO_AUTH bypass in dev only)
│   │   └── Dockerfile
│   ├── mcp-server/                  # MCP server — 5 tools
│   │   ├── src/
│   │   │   ├── index.ts             # Entry: stdio (Claude Desktop)
│   │   │   ├── serve-http.ts        # Entry: Streamable HTTP (ECS Fargate)
│   │   │   ├── make-server.ts       # Tool registration
│   │   │   ├── usage-log.ts         # Logs every tool call
│   │   │   └── tools/               # One file per MCP tool
│   │   └── Dockerfile
│   └── sync/                        # One-off Fargate task runner for scheduled syncs
│       └── Dockerfile               # (no package.json — builds/runs whichever connector
│                                     #  the ECS task's `command` override selects)
├── packages/
│   ├── db/                          # @lp-ai/lib-db — Prisma client, schema, sync-runs helper, seed
│   ├── config/                      # @lp-ai/lib-config — typed env loader
│   └── embedding/                   # @lp-ai/lib-embedding — OpenAI batch helpers
├── connectors/                      # One package per source (3 total)
│   ├── aplos/                       # ✅ Live — nonprofit accounting, finance_snapshots
│   ├── google-sheets/               # ✅ Live — PHL School Performance Model "School Rollup" tab
│   │                                #    (reads a local Excel file today; swapping to the
│   │                                #    Sheets API is a one-file change — see the connector's
│   │                                #    own extract-stage comment)
│   └── quickbooks/                  # OAuth connect/callback + token-refresh live;
│                                     #    accounting-data sync not yet built
├── infra/
│   ├── ecs/                         # ECS task defs (mcp-server, sync)
│   └── iam/                         # AWS IAM policy templates
├── docs/
│   ├── database-schema.md           # Current Prisma models with columns + indexes
│   ├── mcp-server-spec.md           # Current tool definitions (input/output schemas)
│   ├── setup/                       # Phase-by-phase AWS setup guides — written for the
│   │                                #   original client's infrastructure buildout; useful as
│   │                                #   a pattern reference, not all content applies as-is
│   ├── runbooks/                    # local-dev.md, credentials-checklist.md, aws-permissions.md
│   ├── reference/v0-migrations/     # Historical SQL snapshots from the original build
│   └── data-sources/                # Per-connector specs
├── docker-compose.yml               # Local Postgres 16 + pgvector
├── vitest.config.ts
├── tsconfig.base.json               # Shared TS config (ES2022, NodeNext, strict)
├── pnpm-workspace.yaml              # Workspace roots: apps/*, packages/*, connectors/*
├── package.json                     # Root scripts: db:*, sync:*, build, test
└── .env.example                     # Authoritative inventory of all env variables
```

---

## Workspace Packages

pnpm resolves `workspace:*` references to local source at install time — no publishing required.

```
@lp-ai/lib-config          (no internal deps)
@lp-ai/lib-db              (no internal deps)
@lp-ai/lib-embedding       (no internal deps)
      │
      ├── @lp-ai/connector-aplos           → lib-config, lib-db
      ├── @lp-ai/connector-google-sheets   → lib-config, lib-db
      ├── @lp-ai/connector-quickbooks      → lib-config, lib-db
      ├── @lp-ai/hq                        → lib-config, lib-db, connector-quickbooks
      └── @lp-ai/mcp-server                → lib-config, lib-db, lib-embedding
```

`@lp-ai/hq` depending on a connector is deliberate and the only such edge in the graph — QuickBooks is the one connector with a 3-legged OAuth flow that needs a live, publicly-reachable HTTP endpoint, which only the deployed web app can serve. `aplos` and `google-sheets` are pure batch connectors invoked via CLI/EventBridge and have no such need.

---

## Getting Started

> Full walkthrough: [docs/runbooks/local-dev.md](docs/runbooks/local-dev.md) — Credential requirements: [docs/runbooks/credentials-checklist.md](docs/runbooks/credentials-checklist.md)

**Prerequisites:** Node ≥ 22, pnpm ≥ 10, Docker Desktop running (for local Postgres).

```bash
pnpm install
cp .env.example .env                                      # fill in values you have
pnpm db:up                                                # start Postgres + pgvector
pnpm db:generate                                          # generate Prisma client
pnpm --filter @lp-ai/lib-db push --skip-generate          # apply schema

pnpm -r typecheck && pnpm test

pnpm --filter @lp-ai/hq dev                               # HQ → http://localhost:3000
pnpm --filter @lp-ai/mcp-server build
pnpm --filter @lp-ai/mcp-server start                     # MCP stdio (Claude Desktop)
pnpm --filter @lp-ai/mcp-server start:http                # MCP HTTP → http://localhost:8080
```

Only `DATABASE_URL` is required to boot. All API keys are optional at load time and validated at first use.

---

## Package Management

All commands run from the **repository root**. Never use `npm` or `yarn`.

### Installing dependencies

```bash
pnpm add <package> --filter @lp-ai/<name>
pnpm add -D <package> --filter @lp-ai/<name>

# Root (shared tooling only: vitest, eslint, prettier, typescript, prisma CLI)
pnpm add -D -w <package>
```

### Updating dependencies

```bash
pnpm update -r --interactive
pnpm update -r <package>
pnpm update --filter @lp-ai/<name>
```

After updating, commit all changed `package.json` files and `pnpm-lock.yaml` together.

### After editing the Prisma schema

```bash
pnpm db:generate                                          # regenerate Prisma client
pnpm --filter @lp-ai/lib-db push --skip-generate          # local dev (no migration file)
pnpm db:migrate                                           # production (tracked migration)
```

Use `push` for local iteration. Use `migrate` for any change that must be tracked and replayed on the production database. **Never** run `deleteMany`/`TRUNCATE` before an upsert in connector code — see the sync-safety rule in `CLAUDE.md`.

---

## MCP Tools

All tools return structured JSON. Errors use `{ error: { code, message } }`.

| Tool | Description |
|---|---|
| `query_finances` | Look up financial data from `finance_snapshots` (Aplos accounting tabs) |
| `get_finance_brief` | Fund balances, chart-of-accounts summary, recent transactions |
| `query_school_rollup` | School-level performance/enrollment data from the PHL School Performance Model — PSSA/Keystone proficiency, predicted-vs-actual residuals, performance bands, charter enrollment/fill-tier |
| `search_documents` | Semantic search over `document_chunks` (pgvector) — not currently populated by any live connector |
| `skill_finance_audit` | Generates multi-view financial reports (monthly close, audit prep, board financials, fund reconciliation, ad-hoc queries) |

Full input/output schemas: [docs/mcp-server-spec.md](docs/mcp-server-spec.md)

---

## Connectors

| Connector | Source | Destination | Status |
|---|---|---|---|
| `aplos` | Aplos nonprofit accounting | `finance_snapshots` | ✅ Live — RSA-decryption auth |
| `google-sheets` | PHL School Performance Model, "School Rollup" tab only | `school_rollup` | ✅ Live — reads a local Excel export today; see connector comments for the Google Sheets API swap point |
| `quickbooks` | Intuit QuickBooks (OAuth) | `connector_credentials` | OAuth connect/callback + token refresh live; no accounting-data sync yet |

Each connector's `sync()` is wrapped by `runSync()`, which writes a success/error row to `sync_runs` on every run — visible in the HQ `/sync` page.

---

## Intuit Error Handling Policies

QuickBooks-specific error handling, all in `connectors/quickbooks/src/`:

**Error class hierarchy** (`errors.ts`):

```
Error
├── QuickBooksNotConnectedError      — no credential row for this realmId (auth)
├── QuickBooksReauthRequiredError    — refresh token expired/revoked (auth)
└── QuickBooksApiError               — a data-endpoint response QuickBooks itself rejected
    ├── QuickBooksValidationError    — 400/404/other 4xx: the request is malformed
    │                                  (bad date range, invalid account ref, etc.) — not
    │                                  an auth problem, retrying unchanged never helps
    └── QuickBooksTransientError     — 429/5xx: rate-limited or QuickBooks-side failure —
                                       `.retryable` is true, retrying later may succeed
```

The auth errors (`QuickBooksNotConnectedError`, `QuickBooksReauthRequiredError`) and the
`QuickBooksApiError` family are deliberately separate branches, not siblings under one
shared base class — a credential problem and a malformed-request problem should never be
confusable at a glance. `classifyQuickBooksApiError()` turns a Data API HTTP status +
`Fault` response body into the right `QuickBooksApiError` subtype.

**All QuickBooks calls must go through `quickBooksRequest()`** (`quickbooks-client.ts`) —
never call `fetch()` directly against Intuit. This is what both the OAuth token
calls (exchange + refresh) and any future Phase 2 data calls route through, so
`intuit_tid` capture and error classification stay consistent everywhere instead of
depending on whichever call site remembered to add them. The OAuth token endpoint
supplies its own `classifyError` override (different error body shape, plus the
`invalid_grant` → `QuickBooksReauthRequiredError` special case) rather than using the
default Data API classifier.

**What gets logged on every QuickBooks error**, via `logQuickBooksError()`
(`quickbooks-error-logging.ts`): `realmId`, `endpoint`, `intuit_tid`, HTTP status,
QuickBooks' own error code/detail, timestamp, and (for `QuickBooksApiError`s)
whether it's retryable. `intuit_tid` specifically exists so Intuit's own support team
can look up a failed request instantly if we ever need to escalate to them — the
difference between "here's the exact request, here's the ID" and "something failed
sometime yesterday."

**Open question, not resolved here:** whether these logs should stay as structured
console output (today's default) or move to a dedicated, queryable table (e.g. a
Prisma model) — see item #3 in `Error_Handling_Support_Pitch (1).md`. `logQuickBooksError()`
takes a pluggable `sink`, so this can change later without touching any call site.

---

## Current Status

| Area | State |
|---|---|
| Typecheck | ✅ Passes across all workspace packages |
| MCP tools | ✅ All 5 wired to real Prisma queries |
| HQ dashboard | ✅ Renders against live Postgres; auth gated |
| Aplos connector | ✅ RSA-decryption auth, live |
| School Rollup connector | ✅ Live — 301 schools loaded, validated |
| QuickBooks connector | 🟡 OAuth + token refresh built; accounting-data sync not yet implemented |
| `apps/hq` production deploy | 🟡 EC2 + Docker, SSH-based; being finalized |
| `apps/mcp-server` / `apps/sync` production deploy | AWS ECS Fargate |
| CI | ✅ GitHub Actions with pgvector service container |

See [docs/runbooks/credentials-checklist.md](docs/runbooks/credentials-checklist.md) for credential requirements.
