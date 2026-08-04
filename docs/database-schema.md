# Postgres Database Schema

ORM: **Prisma**. The schema lives in `packages/db/prisma/schema.prisma`. The generated Prisma client is output to `packages/db/generated/prisma/` (non-standard path). Migrations are created with `pnpm --filter @lp-ai/lib-db migrate:dev` and applied with `pnpm db:migrate`.

Extensions: `pgvector` (vector similarity), `pg_trgm` (trigram fuzzy matching — currently unused; carried over from the original build's entity-resolution feature, which was removed since this project has no multi-source identity-matching problem).

## Tables (15 models)

### Finance

#### `finance_snapshots`

Generic JSON store for tabular financial data. Each row is one source-sheet/API row; column shapes vary by tab, stored in `row_data`. Currently populated only by the `aplos` connector (`tab_name` values like `aplos:accounts`, `aplos:funds`, `aplos:transactions`).

Key columns: `id` (UUID PK), `source_id` (unique), `tab_name`, `period`, `row_data` (JSON), `last_synced_at`.

Indexes: `tab_name`, `period`.

### School Rollup

#### `school_rollup`

Wide/denormalized by design — one row per school (301 rows), ~45 columns mirroring the PHL School Performance Model's "School Rollup" tab directly, not split into related tables. Populated by the `google-sheets` connector. See [docs/data-sources/school-rollup-dictionary.md](data-sources/school-rollup-dictionary.md) for the full field-by-field dictionary and the schema's own inline comments for known source-data quirks (a malformed header on the `aun` column, float-formatted IDs, etc.).

Key columns: `id` (UUID PK), `aun` + `school_number` (composite unique — the upsert key), `district_name`, `school_name`, `school_type` ("District" | "Charter"), `grade_span_2025_26`, `pct_black_hispanic_2025_26`, `pct_low_income_2025_26`, `excluded_selection_criteria` (Boolean), five exam blocks (PSSA Reading, PSSA Math, Keystone Algebra I, Keystone Biology, Keystone Literature — each with `n_scored`, `pct_proficient`, `predicted`, `residual`, `band`), rollup columns (`simple_avg_residual`, `enrollment_weighted_avg_residual`, `above_line_count`, `within_5_count`, `below_line_count`, `tests_with_data`), and charter-only fields (`current_enrollment_sy_2025_26`, `authorized_enrollment_cap_sy_2025_26`, `unused_seats`, `fill_tier`, `eapi_tier` — always null on District rows).

Percentages, residuals, and predicted values are `Decimal(5,2)` on a **0–100 scale**, not 0–1.

Indexes: `school_type`, `district_name`. Unique: `(aun, school_number)`.

### Connector Auth

#### `connector_credentials`

Third-party connector OAuth credentials (access/refresh token + expiry), keyed by connector + the connector's own account identifier. Currently used by `quickbooks` (`connector: "quickbooks"`, `externalAccountId` = QuickBooks `realmId`). Distinct from `accounts` (NextAuth, HQ sign-in) and the MCP OAuth tables below (Claude/MCP client access) — this is the app authenticating *outward* to a third-party API on behalf of a connector.

Key columns: `id` (UUID PK), `connector`, `external_account_id`, `access_token`, `refresh_token`, `expires_at`, `updated_at`.

Unique: `(connector, external_account_id)`.

### Vector Search & Logging

#### `document_chunks`

Embedded document chunks for semantic search. Backs the `search_documents` MCP tool. No live connector currently writes to this table — the original build populated it from Drive/Slack/Notion, all removed.

Key columns: `id` (UUID PK), `source`, `source_id`, `title`, `content`, `embedding` (`vector(1536)` via pgvector), `metadata` (JSON), `synced_at`.

Index: `(source, source_id)`.

#### `usage_logs`

MCP tool call audit log. Every tool invocation is recorded. Key columns: `id` (UUID PK), `tool_name`, `input_json`, `output_json`, `duration_ms`, `error`, `called_at`, `anthropic_user_id`, `anthropic_user_email`, `anthropic_workspace`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `model`.

Indexes: `tool_name`, `called_at`, `anthropic_user_id`, `anthropic_user_email`.

#### `sync_runs`

One row per connector sync run. Used by HQ dashboard `/sync` page.

Key columns: `id` (UUID PK), `connector`, `status` ('ok' | 'error' | 'noop'), `started_at`, `finished_at`, `records_upserted` (default 0), `error`, `notes`.

Index: `(connector, started_at)`.

### Auth (NextAuth v5)

#### `users`

NextAuth user records for HQ sign-in. Key columns: `id` (cuid PK), `name`, `email` (unique), `email_verified`, `image`.

#### `accounts`

OAuth provider accounts linked to users (Google, for HQ sign-in). Unique: `(provider, provider_account_id)`.

#### `sessions`

NextAuth sessions. Key column: `session_token` (unique).

#### `verification_tokens`

Email verification tokens. Unique: `(identifier, token)`.

### MCP OAuth 2.0

These tables gate MCP tool access independently of HQ sign-in.

#### `mcp_users`

MCP OAuth users, keyed by email. Key columns: `email` (PK), `status` (PENDING | ACTIVE | DISABLED), `roles` (String[]), `last_login`.

Index: `status`.

#### `oauth_clients`

Registered OAuth client applications. Key columns: `client_id` (PK), `client_name`, `redirect_uris` (String[]), `token_lifetime_s` (default 3600).

#### `oauth_authorization_codes`

PKCE authorization codes for the OIDC flow. Key columns: `code` (PK), `client_id`, `user_email`, `redirect_uri`, `code_challenge`, `scopes` (String[]), `expires_at`, `used_at`.

Index: `expires_at`.

#### `oauth_refresh_tokens`

Refresh token storage. Key columns: `token_id` (PK), `client_id`, `user_email`, `expires_at`, `revoked_at`.

Indexes: `user_email`, `expires_at`.

#### `tool_permissions`

Tool-level ACL, editable from HQ `/admin`. The MCP server reads this table (cached ~60s) instead of a static TS registry, so admins can change who can call what without a code deploy.

Key columns: `tool_name` (PK), `allowed_roles` (String[]), `category` ('donor_finance' | 'school_data' | 'search' | 'skills' | 'future' | 'other' — `'students'` also exists as a category but nothing currently uses it), `description`.

## Migration Strategy

- Schema source of truth: `packages/db/prisma/schema.prisma`
- Prisma client output: `packages/db/generated/prisma/`
- Config: `prisma.config.ts` (repo root)
- Dev iteration: `pnpm db:push` (no migration file; uses `prisma db push`)
- Production: `pnpm db:migrate` (tracked migrations via `prisma migrate deploy`)
- Create new migration: `pnpm --filter @lp-ai/lib-db migrate:dev`
- Never edit a migration file after it has been applied to any environment — create a new one instead
- For a brand-new model, generating the migration via `prisma migrate diff` (schema-file to schema-file) is safer than hand-transcribing SQL for anything with more than a handful of columns — see the `school_rollup` migration for the pattern.

## Upsert Pattern

All connectors use Prisma's `upsert` method for idempotent syncs, keyed on a stable natural key from the source (never a row number):

```ts
await prisma.schoolRollup.upsert({
  where: { aun_schoolNumber: { aun: row.aun, schoolNumber: row.schoolNumber } },
  update: data,
  create: { aun: row.aun, schoolNumber: row.schoolNumber, ...data },
});
```
