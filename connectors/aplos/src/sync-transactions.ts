import { prisma } from '@lp-ai/lib-db';
import type { Prisma } from '@lp-ai/lib-db';
import { aplosPaginate } from './aplos-client.js';

interface AplosTransaction {
  id: number;
  date?: string;
  amount?: number;
  memo?: string;
  [key: string]: unknown;
}

export async function syncTransactions(): Promise<number> {
  let synced = 0;
  for await (const txn of aplosPaginate<AplosTransaction>('/hermes/api/v1/transactions', 'transactions')) {
    if (txn.id == null) continue;
    const sourceId = `aplos:transactions:${String(txn.id)}`;
    const rowData = txn as unknown as Prisma.InputJsonValue;
    const period = typeof txn.date === 'string' ? txn.date.slice(0, 7) : null;
    await prisma.financeSnapshot.upsert({
      where: { sourceId },
      create: { sourceId, tabName: 'aplos:transactions', period, rowData },
      update: { rowData, period },
    });
    synced += 1;
  }
  return synced;
}
