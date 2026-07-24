# Root-Level Files

Config and tooling files at the repo root that apply to the entire monorepo.

## Workspace & Build

| File | What it does |
|---|---|
| `package.json` | Root monorepo package — defines `db:*`, `sync:*`, `test`, `lint`, `typecheck` scripts; requires Node ≥22, pnpm ≥10 |
| `pnpm-workspace.yaml` | Declares workspace packages at `apps/*`, `packages/*`, `connectors/*`; allows Prisma engine and esbuild builds |
| `tsconfig.base.json` | Shared TypeScript config — ES2022 target, strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, output to `dist/` |
| `vitest.config.ts` | Test runner — finds tests across all workspace packages; 15s timeout; single-threaded pool; setup file at `test/setup-env.ts` |
| `eslint.config.mjs` | ESLint — no explicit `any`, warns on missing return types, restricts `console` to warn/error |
| `.prettierrc` | Formatter — semicolons, single quotes, trailing commas, 100-char line width, 2-space indent |

## Database

| File | What it does |
|---|---|
| `prisma.config.ts` | Points Prisma at `packages/db/prisma/schema.prisma` and `packages/db/prisma/migrations`; reads `DATABASE_URL` |
| `docker-compose.yml` | Local dev Postgres 16 + pgvector on port 5433; initialized from `infra/postgres-init/`; data in `lp-postgres-data` volume |

## Environment & Security

| File | What it does |
|---|---|
| `.env.example` | Canonical inventory of all env vars — DB URL, LLM keys, Google credentials, sheet IDs, Aplos/Slack/Notion tokens, auth secrets, Sentry DSNs |
| `.gitignore` | Excludes node_modules, build outputs, `.env` variants, service account JSON/PEM files, AWS creds, Terraform sandboxes, Sentry CLI configs |
| `.dockerignore` | Excludes build artifacts, node_modules, and env files from Docker image builds |

## Documentation

| File | What it does |
|---|---|
| `README.md` | System overview — architecture diagram, tech stack table, folder structure, all 16 MCP tools, 8 connectors, setup instructions |
| `mcp-setup-instructions.md` | User-facing guide — how to connect to LP Internal AI via Anthropic Console (OAuth) or Claude Desktop (bridge token); troubleshooting; permissions matrix; curl examples |
| `CLAUDE.md` | Instructions for Claude Code — stack reference, commands, architecture, coding conventions, how to add tools/connectors |
