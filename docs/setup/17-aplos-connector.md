# Phase 17 — Aplos Connector

**Goal:** Build a full Aplos → Postgres connector that syncs accounting transactions and fund balances into `finance_snapshots` on a daily schedule.

**Prerequisites:**
- Phase 4 complete — Prisma schema with `finance_snapshots` table
- Phase 3 complete — `APLOS_CLIENT_ID` and `APLOS_API_KEY` in Secrets Manager
- Aplos account with API access (contact Aplos support if API isn't enabled)

---

## 1. Get Aplos API credentials

1. Log into [app.aplos.com](https://app.aplos.com)
2. **Settings → Integrations → API Access**
3. Note your **Client ID** and generate an **API key**
4. Store them:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id lp-internal/aplos \
     --secret-string '{"APLOS_CLIENT_ID":"<id>","APLOS_API_KEY":"<key>"}'
   ```
5. Add to `.env`

---

## 2. Aplos API authentication

Aplos uses a two-step auth: exchange API key for a Bearer token, then use that token for data requests.

```typescript
async function getAplosToken(): Promise<string> {
  const res = await fetch('https://www.aplos.com/apis/v1/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: process.env['APLOS_CLIENT_ID'],
      password: process.env['APLOS_API_KEY'],
    }),
  });
  if (!res.ok) throw new Error(`Aplos auth failed: ${res.status}`);
  const data = (await res.json()) as { data: { token: { access_token: string } } };
  return data.data.token.access_token;
}
```

---

## 3. Scaffold the connector

```bash
mkdir -p "/Users/christian/Documents/Claude/Projects/LP Internal AI V1/connectors/aplos/src"
```

**`connectors/aplos/package.json`:**
```json
{
  "name": "@lp-ai/connector-aplos",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "sync": "node --env-file=../../.env dist/index.js",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@lp-ai/lib-db": "workspace:*",
    "@lp-ai/lib-config": "workspace:*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.5"
  }
}
```

---

## 4. Key API endpoints

| Endpoint | Description | Target |
|---|---|---|
| `GET /funds` | All fund definitions | metadata |
| `GET /accounts` | Chart of accounts | metadata |
| `GET /transactions?f_startDate=YYYY-MM-DD` | Transactions by date range | `finance_snapshots` |
| `GET /reports/fund-balances` | Current fund balances | `finance_snapshots` |

---

## 5. Implement the sync

```typescript
async function syncFundBalances(token: string): Promise<void> {
  const res = await fetch('https://www.aplos.com/apis/v1/reports/fund-balances', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as AplosFundBalanceResponse;

  for (const fund of data.data.rows) {
    await prisma.financeSnapshot.upsert({
      where: {
        // composite unique: category + period + fundOrPhase
        category_period_fundOrPhase: {
          category: 'fund-balance',
          period: new Date().toISOString().split('T')[0] ?? '',
          fundOrPhase: fund.name,
        },
      },
      update: { amount: fund.balance, syncedAt: new Date() },
      create: {
        category: 'fund-balance',
        subcategory: fund.type,
        amount: fund.balance,
        period: new Date().toISOString().split('T')[0] ?? '',
        fundOrPhase: fund.name,
        source: 'aplos',
      },
    });
  }
}
```

> **Note:** The `finance_snapshots` table may need a composite unique constraint added to the Prisma schema to support this upsert. Add `@@unique([category, period, fundOrPhase])` to the model and run `pnpm db:migrate:dev`.

---

## 6. Sync window strategy

- **Daily run:** Sync the rolling 7-day window of transactions (handles late-posting entries)
- **Monthly full refresh:** First of each month, sync the full prior month (catches any corrections)

```typescript
const today = new Date();
const sevenDaysAgo = new Date(today);
sevenDaysAgo.setDate(today.getDate() - 7);

const startDate = sevenDaysAgo.toISOString().split('T')[0];
```

---

## Verification checklist

- [ ] `pnpm sync:aplos` authenticates and fetches data without errors
- [ ] `finance_snapshots` table shows rows with `source = 'aplos'`
- [ ] `query_finances` MCP tool returns Aplos data
- [ ] EventBridge rule added for daily sync at 3:30am UTC

---

## Known pitfalls

- **Aplos token expiry** — tokens expire after a period; refresh at the start of each sync run rather than caching
- **Fund name changes** — if a fund is renamed in Aplos, the old name remains in Postgres. Consider using Aplos's internal fund ID as the upsert key instead of the name

---

**Next:** [18-slack-connector.md](18-slack-connector.md)
