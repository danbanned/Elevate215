# Phase 22 — Anthropic Admin API Usage Connector

**Goal:** Populate `usage_logs` with real Claude token consumption per workspace user so the HQ home page's token usage section shows actual data.

**Prerequisites:**
- Phase 4 complete — `usage_logs` table includes `anthropic_user_id`, `anthropic_user_email`, `anthropic_workspace`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `model` columns
- Anthropic workspace admin access (required for Admin API tokens)

---

## Why a separate connector

The MCP server only sees tool invocations, not Claude's full token spend. Token data lives on Anthropic's side — accessible via the **Admin API** (`/v1/organizations/usage_report`) using an admin-scoped API key.

This connector pulls usage_report records and either:
- **Backfills** `usage_logs` rows with token totals matched to existing tool-call records (preferred), or
- **Inserts** new rows representing daily aggregate usage per user (fallback if matching by timestamp is unreliable)

---

## 1. Generate an Admin API key

1. Log into [console.anthropic.com](https://console.anthropic.com) as an **organization admin**
2. **Settings → Admin Keys → Create Admin Key**
3. Scope: `usage_report:read` (minimal — no write access needed)
4. Store the key:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id lp-internal/anthropic \
     --secret-string '{"ANTHROPIC_API_KEY":"sk-ant-...","ANTHROPIC_ADMIN_KEY":"sk-ant-admin-..."}'
   ```

---

## 2. API reference

- Docs: https://docs.anthropic.com/en/api/admin-api
- Endpoint: `GET https://api.anthropic.com/v1/organizations/usage_report/messages`
- Auth: `x-api-key: <admin-key>` header
- Key parameters:
  - `starting_at` (ISO 8601)
  - `ending_at` (ISO 8601)
  - `bucket_width`: `"1m"` | `"1h"` | `"1d"` (granularity)
  - `group_by[]`: `["workspace_id", "api_key_id", "model"]`

Each returned bucket contains:
```
{
  "starting_at": "...",
  "ending_at": "...",
  "results": [
    {
      "workspace_id": "wrkspc_...",
      "api_key_id": "apikey_...",
      "model": "claude-sonnet-4-5",
      "input_tokens": ...,
      "output_tokens": ...,
      "cache_read_input_tokens": ...,
      "cache_creation_input_tokens": ...
    }
  ]
}
```

> **Note:** Admin API returns `workspace_id` and `api_key_id`, NOT user emails. To map back to humans, you also need to call the `/v1/organizations/api_keys` endpoint and join `api_key_id → user`.

---

## 3. Scaffold the connector

```bash
mkdir -p "connectors/anthropic-usage/src"
```

**`connectors/anthropic-usage/package.json`:**
```json
{
  "name": "@lp-ai/connector-anthropic-usage",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "sync": "node --env-file=../../.env dist/index.js",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@lp-ai/db": "workspace:*",
    "@lp-ai/config": "workspace:*",
    "zod": "^3.23.0"
  }
}
```

---

## 4. Sync strategy

**Daily aggregate insert** (simplest, recommended for v1 of this connector):

1. Fetch `usage_report` with `bucket_width=1d` for the previous 7 days
2. For each (workspace × api_key × model × day) bucket, insert one synthetic `usage_logs` row:
   ```typescript
   await prisma.usageLog.create({
     data: {
       toolName: '_aggregate_daily',  // sentinel — not a real tool
       calledAt: bucket.endingAt,
       anthropicWorkspace: bucket.workspaceId,
       anthropicUserId: apiKeyToUserMap.get(bucket.apiKeyId) ?? null,
       anthropicUserEmail: apiKeyToEmailMap.get(bucket.apiKeyId) ?? null,
       model: bucket.model,
       inputTokens: bucket.inputTokens,
       outputTokens: bucket.outputTokens,
       cacheReadTokens: bucket.cacheReadInputTokens,
       cacheCreationTokens: bucket.cacheCreationInputTokens,
     },
   });
   ```
3. Use a unique constraint on `(anthropic_workspace, anthropic_user_id, model, called_at)` for `_aggregate_daily` rows so re-runs are idempotent.

**Per-call attribution** (future enhancement):
Match Admin API per-message records to existing `usage_logs` rows by timestamp (within ±2s). Requires `bucket_width=1m` or message-level granularity. More accurate but more complex.

---

## 5. Schedule

Add an EventBridge rule for daily sync at 4am UTC (after Anthropic's usage data has settled):

```bash
aws events put-rule \
  --name lp-sync-anthropic-usage \
  --schedule-expression "cron(0 4 * * ? *)" \
  --state ENABLED
```

---

## 6. UI integration

The HQ home page already reads from these columns. Once the connector starts running, the token usage section automatically begins showing real numbers — no UI changes required.

The "Waiting on data source" banner on the home page checks if any rows have `input_tokens` or `output_tokens` populated in the selected date range. The banner disappears as soon as this connector inserts its first row.

---

## Verification checklist

- [ ] Admin API key created and stored in Secrets Manager
- [ ] `pnpm sync:anthropic-usage` runs without errors
- [ ] `SELECT COUNT(*) FROM usage_logs WHERE input_tokens IS NOT NULL` returns > 0
- [ ] HQ home page token usage section shows per-user totals
- [ ] Date filter updates the table correctly
- [ ] EventBridge rule firing daily

---

## Known pitfalls

- **Admin keys cannot be created by org members** — must be an organization admin in the Anthropic console
- **Usage data lags 1–4 hours** — schedule the sync at least 4 hours after midnight UTC
- **API key → user mapping requires a second call** — `usage_report` returns `api_key_id`; you need `/v1/organizations/api_keys` to resolve it to a person
- **Workspace scoping** — if Launchpad uses multiple workspaces (dev/prod/etc.), the connector should iterate them or filter to one

---

## When to come back here

Build this connector when the home page token usage section needs real data — typically once a few users are actively using Claude with the MCP server in production and you want to see who's consuming what.
