import { prisma } from '@lp-ai/lib-db';
import type { Prisma } from '@lp-ai/lib-db';

import { fetchProfitAndLoss } from './quickbooks-accounting-client.js';

interface ReportHeader {
  StartPeriod?: string;
  EndPeriod?: string;
}

// QuickBooks reports carry their own reporting window in Header.StartPeriod/
// EndPeriod — prefer that over our own snapshot date so `period` reflects
// what the report actually covers, not just when we happened to pull it.
function extractPeriod(report: unknown, fallback: string): string {
  const header = (report as { Header?: ReportHeader } | undefined)?.Header;
  if (header?.StartPeriod && header?.EndPeriod) {
    return `${header.StartPeriod}_${header.EndPeriod}`;
  }
  return fallback;
}

/** The actual data Elevate215's finance dashboard needs — revenue vs. goal, department breakdowns. */
export async function syncProfitAndLoss(realmId: string): Promise<number> {
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const report = await fetchProfitAndLoss(realmId);
  const period = extractPeriod(report, snapshotDate);
  const sourceId = `quickbooks:profit_and_loss:${realmId}:${period}:${snapshotDate}`;
  const rowData = {
    ...(report as Record<string, unknown>),
    realm_id: realmId,
    snapshot_date: snapshotDate,
  } as unknown as Prisma.InputJsonValue;

  await prisma.financeSnapshot.upsert({
    where: { sourceId },
    create: { sourceId, tabName: 'quickbooks:profit_and_loss', period, rowData },
    update: { rowData },
  });

  return 1;
}

/**
 * Same report, summarized by calendar year across the last 3 years —
 * confirmed against live sandbox data (start/end date range +
 * summarize_column_by=Year) to return one Money column per year plus a
 * Total column, with every row's ColData positionally aligned to
 * Columns.Column. Stored under a distinct tabName so it never collides
 * with the flat single-period snapshot above — both persist independently
 * across syncs, since "multi-year trends" needs the year-summarized shape
 * specifically, not something derivable from the flat snapshot.
 */
export async function syncProfitAndLossByYear(realmId: string): Promise<number> {
  const now = new Date();
  const snapshotDate = now.toISOString().slice(0, 10);
  const startDate = `${now.getUTCFullYear() - 2}-01-01`;
  const report = await fetchProfitAndLoss(realmId, {
    startDate,
    endDate: snapshotDate,
    summarizeColumnBy: 'Year',
  });
  const period = extractPeriod(report, `${startDate}_${snapshotDate}`);
  const sourceId = `quickbooks:profit_and_loss_by_year:${realmId}:${period}:${snapshotDate}`;
  const rowData = {
    ...(report as Record<string, unknown>),
    realm_id: realmId,
    snapshot_date: snapshotDate,
  } as unknown as Prisma.InputJsonValue;

  await prisma.financeSnapshot.upsert({
    where: { sourceId },
    create: { sourceId, tabName: 'quickbooks:profit_and_loss_by_year', period, rowData },
    update: { rowData },
  });

  return 1;
}
