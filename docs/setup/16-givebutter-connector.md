# Phase 16 — GiveButter Connector

**Goal:** Build a full GiveButter → Postgres connector that syncs donor contacts, gifts, and campaign data into the `donor_contacts` and `donor_gifts` tables on a daily schedule.

**Prerequisites:**
- Phase 4 complete — Prisma schema with `donor_contacts`, `donor_gifts`, `donor_pipeline` tables
- Phase 3 complete — `GIVEBUTTER_API_KEY` in Secrets Manager
- GiveButter account with API access enabled

---

## 1. Get your GiveButter API key

1. Log into [app.givebutter.com](https://app.givebutter.com)
2. **Settings → Integrations → API**
3. Generate an API key
4. Store it:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id lp-internal/givebutter \
     --secret-string '{"GIVEBUTTER_API_KEY":"<key>"}'
   ```
5. Add to `.env`: `GIVEBUTTER_API_KEY=<key>`

---

## 2. Scaffold the connector

```bash
mkdir -p "/Users/christian/Documents/Claude/Projects/LP Internal AI V1/connectors/givebutter/src"
```

**`connectors/givebutter/package.json`:**
```json
{
  "name": "@lp-ai/connector-givebutter",
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

## 3. GiveButter API overview

Base URL: `https://api.givebutter.com/v1`
Auth: `Authorization: Bearer <API_KEY>`
Pagination: cursor-based — check `links.next` in each response

Key endpoints:
```
GET /contacts          → donor contacts
GET /transactions      → individual gifts
GET /campaigns         → campaign metadata
GET /plans             → recurring giving plans
```

---

## 4. Implement the sync

**`connectors/givebutter/src/index.ts`:**
```typescript
import { prisma } from '@lp-ai/lib-db';

const API_KEY = process.env['GIVEBUTTER_API_KEY'];
const BASE_URL = 'https://api.givebutter.com/v1';

async function fetchAll<T>(endpoint: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = `${BASE_URL}${endpoint}?limit=100`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!res.ok) throw new Error(`GiveButter API error: ${res.status} on ${url}`);
    const data = (await res.json()) as { data: T[]; links: { next: string | null } };
    results.push(...data.data);
    url = data.links.next;
  }

  return results;
}

async function syncContacts(): Promise<void> {
  const contacts = await fetchAll<GiveButterContact>('/contacts');
  for (const contact of contacts) {
    await prisma.donorContact.upsert({
      where: { givebutterContactId: String(contact.id) },
      update: {
        firstName: contact.first_name,
        lastName: contact.last_name,
        email: contact.email,
        phone: contact.phone,
        organizationName: contact.organization,
        syncedAt: new Date(),
      },
      create: {
        givebutterContactId: String(contact.id),
        firstName: contact.first_name,
        lastName: contact.last_name,
        email: contact.email,
        phone: contact.phone,
        organizationName: contact.organization,
      },
    });
  }
  console.warn(`Synced ${contacts.length} contacts`);
}

async function syncTransactions(): Promise<void> {
  const transactions = await fetchAll<GiveButterTransaction>('/transactions');
  for (const tx of transactions) {
    await prisma.donorGift.upsert({
      where: { givebutterTxId: String(tx.id) },
      update: {
        amount: tx.amount / 100,
        giftDate: tx.created_at.split('T')[0] ?? '',
        campaignName: tx.campaign?.name,
        syncedAt: new Date(),
      },
      create: {
        givebutterTxId: String(tx.id),
        amount: tx.amount / 100,
        giftDate: tx.created_at.split('T')[0] ?? '',
        campaignName: tx.campaign?.name,
        isRecurring: tx.plan_id != null,
      },
    });
  }
  console.warn(`Synced ${transactions.length} transactions`);
}

export async function sync(): Promise<void> {
  await syncContacts();
  await syncTransactions();
}

await sync();
```

---

## 5. Add Zod schemas for API responses

Always validate external API shapes. Add a `schemas.ts` file with:

```typescript
import { z } from 'zod';

export const GiveButterContactSchema = z.object({
  id: z.number(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  organization: z.string().nullable(),
});

export const GiveButterTransactionSchema = z.object({
  id: z.number(),
  amount: z.number(),
  created_at: z.string(),
  plan_id: z.number().nullable(),
  campaign: z.object({ name: z.string() }).nullable(),
});
```

---

## 6. Add to EventBridge schedule

Once the connector is deployed (Phase 9 rebuild), add the cron rule:

```bash
aws events put-rule \
  --name lp-sync-givebutter \
  --schedule-expression "cron(0 3 * * ? *)" \
  --state ENABLED
```

---

## Verification checklist

- [ ] `pnpm sync:givebutter` completes without errors
- [ ] `donor_contacts` table populated in Prisma Studio
- [ ] `donor_gifts` table shows real donation amounts
- [ ] `query_donors` MCP tool returns results after sync

---

**Next:** [17-aplos-connector.md](17-aplos-connector.md)
