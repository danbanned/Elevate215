# Credentials Checklist

What credentials to request, from whom, and what each one unlocks.

## Quick-glance table

| # | Credential | Who can provide | Unlocks | Local-dev workaround |
|---|---|---|---|---|
| 1 | AWS IAM access | AWS account admin | RDS/Neon, ECS, EventBridge, Secrets Manager, EC2 deploy | Docker Postgres works for everything except production deploy |
| 2 | `OPENAI_API_KEY` | OpenAI billing-account owner | Embedding generation; `search_documents` MCP tool (no live connector populates `document_chunks` yet, so this doesn't unlock much today) | n/a |
| 3 | `ANTHROPIC_API_KEY` | Anthropic billing-account owner | Only needed for systems that *call* Claude directly. The MCP server is *called by* Claude, so MCP itself does not need this key. | n/a |
| 4 | Google OAuth client (`AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` + `AUTH_SECRET`) | Google Workspace admin for Elevate215's actual domain | HQ dashboard sign-in | Set `HQ_DEV_NO_AUTH=true` (dev only — has no effect when `NODE_ENV=production`) |
| 5 | `APLOS_CLIENT_ID` + `APLOS_API_KEY` | Aplos account owner | `aplos` connector + `get_finance_brief` + `query_finances` | ✅ Live |
| 6 | `QUICKBOOKS_CLIENT_ID`/`_CLIENT_SECRET` (or `QUICKBOOKS_DEV_*`) + `QUICKBOOKS_REDIRECT_URI` | Intuit developer account | `quickbooks` connector's OAuth connect/callback + token refresh. Dev keys work today; production keys require Intuit's app-review process. | `QUICKBOOKS_DEV_*` vars are a safe fallback when the production ones are unset |
| 7 | `GOOGLE_SERVICE_ACCOUNT_JSON` + the School Rollup sheet ID | Google Workspace admin | Not currently required — the `google-sheets` connector reads a local Excel file (Option B). Only needed if/when it's swapped to the live Sheets API (Option A). | n/a |
| 8 | `SENTRY_DSN_HQ` + `SENTRY_DSN_MCP` | Sentry workspace owner | Production error monitoring | Local errors print to stderr |
| 9 | `SYNC_SECRET` | Generated | Bearer auth on the MCP server's `/mcp` HTTP endpoint | Endpoint is unauthed when unset |
| 10 | MCP OAuth (`MCP_OAUTH_ISSUER`, `JWT_PRIVATE_KEY`, `JWT_KID`) | Generated | MCP OAuth 2.0 PKCE flow for tool-level access control | Tools accessible without OAuth when unset |

## Recommended order

**Tier 1 — unlocks the most work**

1. **AWS IAM access (#1)** — RDS/Neon, EC2 deploy, EventBridge scheduling, Secrets Manager.
2. **Aplos credentials (#5)** — ✅ live; unlocks `query_finances`/`get_finance_brief` immediately, independent of AWS.

**Tier 2 — QuickBooks**

3. **QuickBooks dev keys (#6)** — get the OAuth connect/callback flow working end-to-end against Intuit's sandbox before requesting production approval (which has its own multi-step process: app description, compliance questionnaire, legal docs).

**Tier 3 — auth + observability**

4. **Google OAuth client (#4)** — needed once you want to share the HQ dashboard with the team rather than running it locally or with `HQ_DEV_NO_AUTH`.
5. **Sentry DSNs (#8)** — production-only.
6. **`SYNC_SECRET` (#9)** — generate with `openssl rand -base64 32` once the MCP server's HTTP endpoint is exposed.

## What's safe to share with admins

When you message an admin to request a credential, you can safely share:
- That this is an internal Elevate215 AI project storing data in Postgres
- That the data flows are read-only (the system never writes back to source systems)
- That production secrets are kept out of the codebase (currently a `.env` file on the deploy host; AWS Secrets Manager is supported and can be switched on via `USE_AWS_SECRETS=true`)

Things to **never** share over chat:
- The credential values themselves once issued
- Any database connection string with embedded password

## For each credential — where it goes

All credentials are added to `.env` locally (gitignored). The Zod schema in `packages/config/src/schema.ts` is the authoritative list of every env var the codebase understands.

| Variable | Local | Production |
|---|---|---|
| `DATABASE_URL` | `.env` (Docker or Neon) | `.env` on the deploy host, or Secrets Manager `lp-internal/db` |
| `OPENAI_API_KEY` | `.env` | Secrets Manager `lp-internal/openai` |
| `ANTHROPIC_API_KEY` | `.env` (optional) | Secrets Manager `lp-internal/anthropic` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` / `AUTH_SECRET` | `.env` | Secrets Manager `lp-internal/nextauth` |
| `APLOS_CLIENT_ID` / `APLOS_API_KEY` | `.env` | Secrets Manager `lp-internal/aplos` |
| `QUICKBOOKS_CLIENT_ID` / `_CLIENT_SECRET` / `_DEV_CLIENT_ID` / `_DEV_CLIENT_SECRET` / `_REDIRECT_URI` | `.env` | `.env` on the deploy host |
| `SENTRY_DSN_HQ` / `SENTRY_DSN_MCP` | `.env` | Secrets Manager `lp-internal/sentry` |
| `SYNC_SECRET` | `.env` | Secrets Manager `lp-internal/sync` |
| `MCP_OAUTH_ISSUER` / `JWT_PRIVATE_KEY` / `JWT_KID` | `.env` | Secrets Manager `lp-internal/mcp-oauth` |

Once `USE_AWS_SECRETS=true`, `packages/config` fetches all of these from Secrets Manager on startup and validates them through the Zod schema before any business logic runs.
