# GiveButter Connector

**Status:** In progress (V1)
**Destination tables:** `donor_gifts`, `donor_contacts`
**Schedule:** Daily via EventBridge

## Overview

Pulls donation, campaign, and contact data from the GiveButter API into Postgres. GiveButter is Launchpad's fundraising platform. This connector provides the data backing the `query_donors` MCP tool.

## API

- Base URL: `https://api.givebutter.com/v1`
- Auth: API key via `Authorization: Bearer <key>` header
- Docs: https://docs.givebutter.com/

## Key endpoints

| Endpoint | Description | Target table |
|---|---|---|
| `GET /contacts` | All donors / contacts | `donor_contacts` |
| `GET /transactions` | All gifts/donations | `donor_gifts` |
| `GET /campaigns` | Campaign metadata | metadata on `donor_gifts` |
| `GET /plans` | Recurring giving plans | `donor_pipeline` |

## Sync strategy

Full replace on each run (small dataset). Page through all contacts and transactions with cursor-based pagination. Upsert on `givebutter_id`.

## Environment variables

```
GIVEBUTTER_API_KEY=
```

## Implementation notes

- To be implemented in Phase 16
- See V0 stub at `connectors/givebutter/` for starting point
