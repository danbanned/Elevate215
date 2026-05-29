import { prisma } from '@lp-ai/lib-db';
import type { Prisma } from '@lp-ai/lib-db';
import { aplosPaginate } from './aplos-client.js';

interface AplosFund {
  id: number;
  name?: string;
  balance_account_name?: string;
  balance_account_number?: string;
  [key: string]: unknown;
}

export async function syncFunds(): Promise<number> {
  let synced = 0;
  const snapshotDate = new Date().toISOString().slice(0, 10);
  for await (const fund of aplosPaginate<AplosFund>('/hermes/api/v1/funds', 'funds')) {
    if (fund.id == null) continue;
    const sourceId = `aplos:funds:${String(fund.id)}:${snapshotDate}`;
    const rowData = { ...fund, snapshot_date: snapshotDate } as unknown as Prisma.InputJsonValue;
    await prisma.financeSnapshot.upsert({
      where: { sourceId },
      create: { sourceId, tabName: 'aplos:funds', period: snapshotDate, rowData },
      update: { rowData },
    });
    synced += 1;
  }
  return synced;
}
