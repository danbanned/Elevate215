# Aplos Connector

**Status:** ✅ Live
**Destination table:** `finance_snapshots`
**Schedule:** Manual (`pnpm sync:aplos`) — not yet wired to a recurring EventBridge schedule

## Overview

Pulls chart-of-accounts, fund, and transaction data from Aplos (nonprofit accounting software) into Postgres. Provides the financial data backing the `query_finances` and `get_finance_brief` MCP tools.

This connector's pattern (`aplos-client.ts`'s `loadEnv()`-per-call + module-level cache-with-expiry check) is the reference template this repo's other connectors follow when they need a similarly-shaped static-credential API client — see `connectors/quickbooks/src/quickbooks-client.ts`'s comments for exactly how it differs (QuickBooks needs a DB round-trip on every call and a DB write on refresh; Aplos re-derives from a static key with no DB involved at all).

## API

- Base URL: `https://app.aplos.com`
- Auth: RSA-encrypted token exchange (`APLOS_CLIENT_ID` + `APLOS_API_KEY`, an RSA private key) — see `connectors/aplos/src/aplos-client.ts`. The decrypted access token is cached in-memory with a 60-second expiry buffer and re-derived from the static key on cache miss; there is no database involved in this connector's auth path.
- Docs: https://www.aplos.com/aws/kb/aplos-api-documentation/

## Key endpoints

| Endpoint | Description | Target table |
|---|---|---|
| `GET /hermes/api/v1/accounts` | Chart of accounts | `finance_snapshots` (`aplos:accounts`) |
| `GET /hermes/api/v1/funds` | Fund list | `finance_snapshots` (`aplos:funds`) |
| `GET /hermes/api/v1/transactions` | Transactions | `finance_snapshots` (`aplos:transactions`) |

## Environment variables

```
APLOS_CLIENT_ID=
APLOS_API_KEY=
```

## Connector Location

`connectors/aplos/`

Key files:
- `src/aplos-client.ts` — RSA auth + cached access token + `aplosFetch`/`aplosPaginate` helpers
- `src/sync-accounts.ts`, `src/sync-funds.ts`, `src/sync-transactions.ts` — one sync function per endpoint
- `src/index.ts` — orchestrates the three syncs inside `runSync('aplos', ...)`
- `src/cli.ts` — entrypoint
