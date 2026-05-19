# LP Internal AI V1 — Claude Code Instructions

## What This Is

An internal AI intelligence layer for Launchpad that lets team members query Claude with live organizational data — student profiles, program outcomes, certifications, competency scores, finances, donations, and communications. Built on a fully AWS-native stack. The system ingests data through seven connectors (Google Drive, Google Sheets, BigQuery, GiveButter, Aplos, Slack, Roam), stores it in Postgres + pgvector, and exposes it to Claude through an MCP server. A Next.js HQ dashboard provides sync status and operational visibility.

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode throughout) |
| HQ App | Next.js 14 (App Router) |
| MCP Server | `@modelcontextprotocol/sdk` |
| AI Client | `@anthropic-ai/sdk` |
| Embeddings | OpenAI `text-embedding-3-large` |
| Structured DB | Postgres (AWS RDS) via Prisma ORM |
| Vector search | pgvector (extension on RDS Postgres) |
| App hosting | AWS App Runner |
| Cron / scheduling | AWS EventBridge |
| Secrets | AWS Secrets Manager |
| Monitoring | Sentry |
| Auth | NextAuth (Auth.js) + Google provider |
| UI | shadcn/ui + Tailwind |
| BI / dashboards | Metabase (self-hosted on AWS) |
| Workflow automation | n8n (self-hosted on AWS) |
| Ingestion tooling | Airbyte (self-hosted, for future non-Sheets sources) |
| Analytics warehouse | Athena over S3 (for cross-source visualization) |
| Monorepo | pnpm workspaces |

## Active Connectors

| Connector | Source | Destination | Status |
|---|---|---|---|
| `google-sheets` | Launchpad Dashboard + Outcomes sheets | Postgres | Active |
| `google-drive` | Drive docs folder | Postgres + pgvector | Active |
| `bigquery` | `lp-internal-ai` BigQuery project (read-only source pull) | Postgres | Active |
| `givebutter` | GiveButter donation platform | Postgres | Active |
| `aplos` | Aplos nonprofit accounting | Postgres | Active |
| `slack` | Designated Slack channels | pgvector | Active |
| `roam` | Roam chat/messaging app | pgvector | Active |

Connector syncs are scheduled via AWS EventBridge. Each connector also exposes a manual `sync()` CLI entry.

## Directory Structure

```
/
├── CLAUDE.md                          # This file
├── docs/
│   ├── architecture.md                # System diagram and data flow
│   ├── database-schema.md             # All Postgres tables and columns
│   ├── mcp-server-spec.md             # All MCP tool definitions
│   ├── entity-resolution.md           # Alias and canonicalization logic
│   ├── setup/                         # Phase-by-phase setup guides (00–21)
│   ├── runbooks/                      # Operational playbooks
│   ├── decisions/                     # Architecture Decision Records (ADRs)
│   └── data-sources/                  # Per-connector specs
│       ├── google-sheets-connector.md
│       ├── google-drive-connector.md
│       ├── bigquery-connector.md
│       ├── givebutter-connector.md
│       ├── aplos-connector.md
│       ├── slack-connector.md
│       └── roam-connector.md
├── apps/
│   ├── hq/                            # Next.js HQ dashboard (App Router)
│   └── mcp-server/                    # MCP server exposing 13+ tools to Claude
├── packages/
│   ├── db/                            # Prisma client + schema + migrations
│   ├── embedding/                     # OpenAI embedding helpers (batch + retry)
│   └── config/                        # Typed env loader (Secrets Manager + .env fallback)
├── connectors/
│   ├── google-sheets/                 # Sheets → Postgres
│   ├── google-drive/                  # Drive docs → Postgres + pgvector
│   ├── bigquery/                      # BigQuery → Postgres (source pull)
│   ├── givebutter/                    # GiveButter → Postgres
│   ├── aplos/                         # Aplos → Postgres
│   ├── slack/                         # Slack → pgvector
│   └── roam/                          # Roam → pgvector
└── .env.example                       # All required env variable names
```

## Running Things Locally

```bash
# Install all dependencies (monorepo)
pnpm install

# Generate Prisma client
pnpm db:generate

# Run database migrations (requires DATABASE_URL in .env)
pnpm db:migrate

# Open Prisma Studio (database GUI)
pnpm db:studio

# Start MCP server
pnpm --filter @lp-ai/mcp-server dev

# Start HQ dashboard
pnpm --filter @lp-ai/hq dev

# Run a connector sync manually
pnpm sync:sheets
pnpm sync:drive
pnpm sync:bigquery
pnpm sync:givebutter
pnpm sync:aplos
pnpm sync:slack
pnpm sync:roam
```

## Environment Variables

See `.env.example` for the full list. Key groups:

```bash
# Postgres (AWS RDS)
DATABASE_URL=

# AI providers
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# AWS (local dev — production uses IAM role)
AWS_PROFILE=lp-internal
AWS_REGION=us-east-1
USE_AWS_SECRETS=false   # true in production

# Google
GOOGLE_SERVICE_ACCOUNT_JSON=  # base64-encoded service account JSON

# Data source IDs / keys
BIGQUERY_PROJECT_ID=lp-internal-ai
GIVEBUTTER_API_KEY=
APLOS_CLIENT_ID=
APLOS_API_KEY=
SLACK_BOT_TOKEN=
ROAM_API_KEY=
ROAM_GRAPH_NAME=

# Auth
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Monitoring
SENTRY_DSN_HQ=
SENTRY_DSN_MCP=
```

## Coding Conventions

- **TypeScript strict mode** — no `any`, explicit return types on all exported functions
- **Named exports only** — no default exports
- **Prisma** for all Postgres queries — no raw SQL except in migrations
- **Zod schemas** for all external data (API responses, tool inputs)
- **Error handling** — connectors throw typed errors; MCP tools catch and return structured error responses
- **No comments** unless the why is non-obvious
- **Environment variables** accessed only through the typed `env` object from `@lp-ai/config` — never `process.env` directly in business logic
- **pgvector queries** use `$queryRaw` with Prisma for cosine similarity (`<=>` operator)

## Spec Documents

Before modifying any component, read the relevant spec:

- [Architecture](docs/architecture.md) — system overview and data flow
- [Database Schema](docs/database-schema.md) — all Postgres tables
- [MCP Server Spec](docs/mcp-server-spec.md) — all tool definitions with input/output schemas
- [Entity Resolution](docs/entity-resolution.md) — how students/staff are resolved across sources
- [Google Sheets Connector](docs/data-sources/google-sheets-connector.md)
- [Google Drive Connector](docs/data-sources/google-drive-connector.md)
- [BigQuery Connector](docs/data-sources/bigquery-connector.md)
- [GiveButter Connector](docs/data-sources/givebutter-connector.md)
- [Aplos Connector](docs/data-sources/aplos-connector.md)
- [Slack Connector](docs/data-sources/slack-connector.md)
- [Roam Connector](docs/data-sources/roam-connector.md)

## Setup

New to this project? Start at [docs/setup/00-bootstrap.md](docs/setup/00-bootstrap.md) and follow the numbered guides in order.
