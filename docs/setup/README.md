# LP Internal AI V1 — Setup Guide Index

This folder contains a step-by-step setup guide for every system in the V1 stack. Work through them in order — each phase assumes the previous one is complete.

**Stack locked:** May 18 2026 · Next review: August 2026

---

## Checklist

| # | Phase | Guide | Status |
|---|---|---|---|
| 0 | Project bootstrap — monorepo, git, config files | [00-bootstrap.md](00-bootstrap.md) | ✅ Complete |
| 1 | AWS account + IAM baseline | [01-aws-baseline.md](01-aws-baseline.md) | 🔲 Pending |
| 2 | AWS RDS Postgres + pgvector extension | [02-rds-postgres.md](02-rds-postgres.md) | 🔲 Pending |
| 3 | AWS Secrets Manager + `@lp-ai/config` package | [03-secrets-manager.md](03-secrets-manager.md) | 🔲 Pending |
| 4 | Prisma schema — port all tables from V0 | [04-prisma-schema.md](04-prisma-schema.md) | 🔲 Pending |
| 5 | Google connectors — Sheets + Drive | [05-google-connectors.md](05-google-connectors.md) | 🔲 Pending |
| 6 | Embeddings + pgvector search | [06-embeddings-pgvector.md](06-embeddings-pgvector.md) | 🔲 Pending |
| 7 | MCP server — port all 13 tools | [07-mcp-server.md](07-mcp-server.md) | 🔲 Pending |
| 8 | HQ dashboard — Next.js + NextAuth | [08-hq-dashboard.md](08-hq-dashboard.md) | 🔲 Pending |
| 9 | AWS App Runner deployment | [09-app-runner.md](09-app-runner.md) | 🔲 Pending |
| 10 | AWS EventBridge cron scheduling | [10-eventbridge-cron.md](10-eventbridge-cron.md) | 🔲 Pending |
| 11 | Sentry error monitoring | [11-sentry.md](11-sentry.md) | 🔲 Pending |
| 12 | Notion knowledge base | [12-notion.md](12-notion.md) | 🔲 Pending |
| 13 | n8n workflow automation (self-hosted) | [13-n8n.md](13-n8n.md) | 🔲 Pending |
| 14 | Metabase BI dashboards (self-hosted) | [14-metabase.md](14-metabase.md) | 🔲 Pending |
| 15 | Airbyte ingestion tooling (self-hosted) | [15-airbyte.md](15-airbyte.md) | 🔲 Pending |
| 16 | GiveButter connector | [16-givebutter-connector.md](16-givebutter-connector.md) | 🔲 Pending |
| 17 | Aplos connector | [17-aplos-connector.md](17-aplos-connector.md) | 🔲 Pending |
| 18 | Slack connector | [18-slack-connector.md](18-slack-connector.md) | 🔲 Pending |
| 19 | Roam connector | [19-roam-connector.md](19-roam-connector.md) | 🔲 Pending |
| 20 | BigQuery connector (source pull) | [20-bigquery-connector.md](20-bigquery-connector.md) | 🔲 Pending |
| 21 | Athena over S3 (analytics warehouse) | [21-athena-s3.md](21-athena-s3.md) | 🔲 Pending |

---

## How this works

Each guide covers one system end-to-end:

1. **Prerequisites** — what must be done first
2. **Step-by-step setup** — exact commands, console steps, and config values
3. **Verification** — how to confirm it's working
4. **Teardown** — how to undo (useful for dev/staging environments)
5. **Known pitfalls** — common mistakes and fixes

When a phase is complete, update the status column above to `✅ Complete`.

---

## Stack reference

| Layer | Tool |
|---|---|
| Language | TypeScript (strict) |
| Monorepo | pnpm workspaces |
| ORM | Prisma |
| Relational DB | Postgres on AWS RDS |
| Vector search | pgvector (on RDS) |
| Embeddings | OpenAI `text-embedding-3-large` |
| App hosting | AWS App Runner |
| Cron | AWS EventBridge |
| Secrets | AWS Secrets Manager |
| Auth | NextAuth (Auth.js) + Google |
| Frontend | Next.js 14 + shadcn/ui |
| Monitoring | Sentry |
| BI | Metabase (self-hosted) |
| Automation | n8n (self-hosted) |
| Ingestion | Airbyte (self-hosted) |
| Warehouse | Athena over S3 |
| AI | Claude (Anthropic) via MCP |
