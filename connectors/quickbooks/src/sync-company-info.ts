import { prisma } from '@lp-ai/lib-db';
import type { Prisma } from '@lp-ai/lib-db';

import { fetchCompanyInfo } from './quickbooks-accounting-client.js';

/** Simplest possible smoke test of a real QuickBooks data call — one row per realm per day. */
export async function syncCompanyInfo(realmId: string): Promise<number> {
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const companyInfo = await fetchCompanyInfo(realmId);
  const sourceId = `quickbooks:company_info:${realmId}:${snapshotDate}`;
  const rowData = {
    ...(companyInfo as Record<string, unknown>),
    realm_id: realmId,
    snapshot_date: snapshotDate,
  } as unknown as Prisma.InputJsonValue;

  await prisma.financeSnapshot.upsert({
    where: { sourceId },
    create: { sourceId, tabName: 'quickbooks:company_info', period: snapshotDate, rowData },
    update: { rowData },
  });

  return 1;
}
