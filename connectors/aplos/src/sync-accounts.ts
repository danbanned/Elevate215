import { prisma } from '@lp-ai/db';
import type { Prisma } from '@lp-ai/db';
import { aplosPaginate } from './aplos-client.js';

interface AplosAccount {
  account_number?: number | string;
  name?: string;
  category?: string;
  type?: string;
  activity?: string;
  [key: string]: unknown;
}

export async function syncAccounts(): Promise<number> {
  let synced = 0;
  for await (const acct of aplosPaginate<AplosAccount>('/hermes/api/v1/accounts', 'accounts')) {
    if (acct.account_number == null) continue;
    const sourceId = `aplos:accounts:${String(acct.account_number)}`;
    const rowData = acct as unknown as Prisma.InputJsonValue;
    await prisma.financeSnapshot.upsert({
      where: { sourceId },
      create: { sourceId, tabName: 'aplos:accounts', period: null, rowData },
      update: { rowData },
    });
    synced += 1;
  }
  return synced;
}
