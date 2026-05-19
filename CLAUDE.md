# LP Internal AI V1 — Claude Code Instructions

## What This Is

An internal AI intelligence layer for Launchpad that lets team members query Claude with live organizational data — student profiles, program outcomes, certifications, competency scores, finances, donations, and communications. Built on a fully AWS-native stack. The system ingests data through seven connectors (Google Drive, Google Sheets, BigQuery, GiveButter, Aplos, Slack, Roam), stores it in Postgres + pgvector, and exposes it to Claude through an MCP server. A Next.js HQ dashboard provides sync status and operational visibility.

## Current State

V1 is **functionally end-to-end against a local Docker Postgres** while awaiting AWS credentials and external API keys. What works today:

- All 12 workspace projects build, typecheck, and pass tests (31 tests, 5 files).
- Postgres 16 + pgvector + pg_trgm run locally via `docker compose`; schema is applied and sample data seeded.
- MCP server exposes 14 tools (13 V0.1 spec tools + new `search_documents`) over both stdio (Claude Desktop) and Streamable HTTP (App Runner production); all 14 handlers are wired to real Prisma queries.
- HQ Next.js dashboard renders data freshness, sync status, and tool-call logs against live Postgres; NextAuth v5 + Google OAuth + domain restriction; middleware gates protected routes.
- One connector (GiveButter) has a real REST client; the other six are working skeletons that write to `sync_runs` and are ready for per-source implementations.
- Production-shaped Docker images for both apps; GitHub Actions CI runs the full suite against a pgvector service container.

Status per setup phase: see [docs/setup/README.md](docs/setup/README.md). Per-credential gating: see [docs/runbooks/credentials-checklist.md](docs/runbooks/credentials-checklist.md).

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode throughout) |
| HQ App | Next.js 14 (App Router) |
| MCP Server | `@modelcontextprotocol/sdk` (stdio + Streamable HTTP transports) |
| AI Client | `@anthropic-ai/sdk` (Claude is the consumer of the MCP server, not embedded) |
| Embeddings | OpenAI `text-embedding-3-large` (1536 dimensions) |
| Structured DB | Postgres 16 via Prisma ORM (local Docker today, AWS RDS in production) |
| Vector search | pgvector extension |
| App hosting | AWS App Runner (production); local Docker images built and verified |
| Cron / scheduling | AWS EventBridge |
| Secrets | AWS Secrets Manager (production); `.env` for local dev |
| Monitoring | Sentry |
| Auth | NextAuth v5 (Auth.js) + Google provider, gated to `@launchpadphilly.org` |
| UI | Tailwind (shadcn-style components inline) |
| BI / dashboards | Metabase (self-hosted on AWS) |
| Workflow automation | n8n (self-hosted on AWS) |
| Ingestion tooling | Airbyte (self-hosted, for future non-Sheets sources) |
| Analytics warehouse | Athena over S3 (for cross-source visualization) |
| Tests | Vitest (unit + live-DB integration + spawned MCP server integration) |
| CI | GitHub Actions with a pgvector service container |
| Monorepo | pnpm workspaces |

## Connectors

| Connector | Source | Destination | Status |
|---|---|---|---|
| `google-sheets` | Launchpad Dashboard + Outcomes sheets | Postgres | Skeleton — awaiting `GOOGLE_SERVICE_ACCOUNT_JSON` |
| `google-drive` | Drive docs folder | Postgres + pgvector | Skeleton — awaiting `GOOGLE_SERVICE_ACCOUNT_JSON` |
| `bigquery` | `lp-internal-ai` BigQuery project | Postgres | Skeleton — awaiting Google service account |
| `givebutter` | GiveButter donation platform | `donor_contacts`, `donor_gifts` | **REST client implemented**; awaiting `GIVEBUTTER_API_KEY` |
| `aplos` | Aplos nonprofit accounting | Postgres | Skeleton — awaiting `APLOS_CLIENT_ID` + `APLOS_API_KEY` |
| `slack` | Designated Slack channels | pgvector | Skeleton — awaiting `SLACK_BOT_TOKEN` |
| `roam` | Roam chat/messaging app | pgvector | Skeleton — awaiting `ROAM_API_KEY` |

Every connector exposes a `sync()` function that calls `runSync('<name>', ...)` so each run lands in the `sync_runs` table and shows up in the HQ `/sync` page. Connector syncs will be scheduled via AWS EventBridge in production; each also has a manual CLI entry (`pnpm sync:<name>`).

## Directory Structure

```
/
├── CLAUDE.md                          # This file
├── docker-compose.yml                 # Local Postgres + pgvector
├── infra/
│   └── postgres-init/                 # Extension creation on container startup
├── docs/
│   ├── architecture.md
│   ├── database-schema.md
│   ├── mcp-server-spec.md
│   ├── entity-resolution.md
│   ├── setup/                         # Phase-by-phase setup guides (00–21)
│   ├── runbooks/                      # Operational playbooks (local-dev, credentials-checklist)
│   ├── decisions/                     # Architecture Decision Records (ADRs)
│   └── data-sources/                  # Per-connector specs
├── apps/
│   ├── hq/                            # Next.js 14 HQ dashboard
│   │   ├── app/                       # App Router pages: /, /sync, /tools, /auth/signin, /api/health
│   │   ├── auth.ts                    # NextAuth v5 config
│   │   ├── middleware.ts              # Routes gated except /auth/signin, /api/auth, /api/health
│   │   └── Dockerfile                 # Next.js standalone production image
│   └── mcp-server/                    # MCP server exposing 14 tools
│       ├── src/index.ts               # stdio entry (Claude Desktop)
│       ├── src/serve-http.ts          # Streamable HTTP entry (App Runner)
│       ├── src/make-server.ts         # Tool registration
│       ├── src/tools/                 # One file per MCP tool
│       └── Dockerfile                 # Production image
├── packages/
│   ├── db/                            # Prisma client + schema + migrations + entity resolution + seed
│   ├── embedding/                     # OpenAI embedding helpers (batch + retry)
│   └── config/                        # Typed env loader (Secrets Manager + .env fallback)
├── connectors/
│   ├── google-sheets/                 # skeleton
│   ├── google-drive/                  # skeleton
│   ├── bigquery/                      # skeleton
│   ├── givebutter/                    # real REST client + unit tests
│   ├── aplos/                         # skeleton
│   ├── slack/                         # skeleton
│   └── roam/                          # skeleton
├── test/
│   └── setup-env.ts                   # Vitest setup loads .env before tests
├── vitest.config.ts
├── .github/workflows/ci.yml
└── .env.example                       # Authoritative env var inventory
```

## Running Things Locally

The single-source local-dev guide is [docs/runbooks/local-dev.md](docs/runbooks/local-dev.md). Short version:

```bash
# Bootstrap (first time)
pnpm install
pnpm db:up                                            # Postgres + pgvector via Docker
pnpm db:generate
pnpm --filter @lp-ai/db push --skip-generate          # Apply schema
pnpm db:seed                                          # 3 students, donors, finance, certs

# Verify
pnpm -r typecheck
pnpm test                                             # 31 tests

# Apps
pnpm --filter @lp-ai/hq dev                           # HQ at http://localhost:3000
pnpm --filter @lp-ai/mcp-server start                 # MCP over stdio (build first)
pnpm --filter @lp-ai/mcp-server start:http            # MCP over HTTP at :8080

# Connector syncs (currently all noop until credentials arrive)
pnpm sync:sheets
pnpm sync:drive
pnpm sync:bigquery
pnpm sync:givebutter
pnpm sync:aplos
pnpm sync:slack
pnpm sync:roam

# Production Docker images
docker build -f apps/hq/Dockerfile -t lp-hq:dev .
docker build -f apps/mcp-server/Dockerfile -t lp-mcp:dev .
```

## Environment Variables

Local `.env` mirrors `.env.example` line-for-line — same keys, with the values you have filled in and the rest blank. Only `DATABASE_URL` is strictly required by the env schema (`packages/config/src/schema.ts`); API keys are optional at load and validated at the call sites that need them (e.g. `embedText` throws if `OPENAI_API_KEY` is missing).

Local `.env` already points `DATABASE_URL` at the Docker Postgres (`postgresql://lpapp:lpapp@localhost:5433/lpinternal?sslmode=disable`). Production will swap that to the RDS URL once Phase 2 lands.

See [docs/runbooks/credentials-checklist.md](docs/runbooks/credentials-checklist.md) for what each variable unlocks and how to obtain it.

## Coding Conventions

- **TypeScript strict mode** — no `any`, explicit return types on all exported functions, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`
- **Named exports only** — no default exports
- **Prisma** for all Postgres queries; `$queryRaw` only for pgvector cosine similarity (`<=>` operator) and `percentile_cont`
- **Zod schemas** for all external data (API responses, tool inputs) and env validation
- **Error handling** — MCP tools return structured `{ error: { code, message } }` envelopes per the spec; connectors throw, the `runSync` wrapper captures errors into the `sync_runs` row
- **No comments** unless the why is non-obvious
- **Environment variables** accessed only through the typed `env` object from `@lp-ai/config` — never `process.env` directly in business logic
- **Tests** — vitest at the workspace root; live-DB tests are gated on `DATABASE_URL` containing `localhost` so they're skipped in environments without a local Postgres

## Spec Documents

Before modifying any component, read the relevant spec:

- [Architecture](docs/architecture.md) — system overview and data flow
- [Database Schema](docs/database-schema.md) — all Postgres tables
- [MCP Server Spec](docs/mcp-server-spec.md) — all 14 tool definitions with input/output schemas
- [Entity Resolution](docs/entity-resolution.md) — how students/staff are resolved across sources
- Per-connector specs in `docs/data-sources/`

## Setup

New to this project?
1. Read this file end-to-end.
2. Follow [docs/runbooks/local-dev.md](docs/runbooks/local-dev.md) to get a working clone.
3. See [docs/runbooks/credentials-checklist.md](docs/runbooks/credentials-checklist.md) for what you need from your admin / service owners to unlock the remaining work.
4. Phase-numbered AWS / production setup guides are in [docs/setup/](docs/setup/README.md) — but most local development doesn't require touching them.
