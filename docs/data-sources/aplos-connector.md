# Aplos Connector

**Status:** In progress (V1)
**Destination tables:** `finance_snapshots`
**Schedule:** Daily via EventBridge

## Overview

Pulls chart-of-accounts and transaction data from Aplos (Launchpad's nonprofit accounting platform) into Postgres. This connector provides the financial data backing the `query_finances` MCP tool.

## API

- Base URL: `https://www.aplos.com/apis/v1`
- Auth: OAuth 2.0 (client credentials flow)
- Docs: https://www.aplos.com/aws/kb/aplos-api-documentation/

## Key endpoints

| Endpoint | Description | Target table |
|---|---|---|
| `GET /funds` | Fund list | metadata |
| `GET /accounts` | Chart of accounts | metadata |
| `GET /transactions` | All transactions | `finance_snapshots` |
| `GET /reports/fund-balances` | Fund balance summary | `finance_snapshots` |

## Sync strategy

Incremental by date range. Pull transactions for the rolling 30-day window on each run; full refresh monthly. Upsert on Aplos transaction ID.

## Environment variables

```
APLOS_CLIENT_ID=
APLOS_API_KEY=
```

## Implementation notes

- To be implemented in Phase 17
- See V0 stub at `connectors/aplos/` for starting point
