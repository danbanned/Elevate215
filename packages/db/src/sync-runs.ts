import { prisma } from './client.js';

export interface SyncRunResult {
  status: 'ok' | 'noop' | 'error';
  recordsUpserted?: number;
  notes?: string;
}

export interface SyncRunRecord {
  id: string;
  connector: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  recordsUpserted: number;
  error: string | null;
  notes: string | null;
  durationMs: number;
}

export async function runSync(
  connector: string,
  body: () => Promise<SyncRunResult>,
): Promise<SyncRunRecord> {
  const startedAt = new Date();
  const run = await prisma.syncRun.create({
    data: { connector, status: 'running', startedAt },
  });

  let status: 'ok' | 'noop' | 'error' = 'ok';
  let recordsUpserted = 0;
  let notes: string | null = null;
  let errorMessage: string | null = null;

  try {
    const result = await body();
    status = result.status;
    recordsUpserted = result.recordsUpserted ?? 0;
    notes = result.notes ?? null;
  } catch (err) {
    status = 'error';
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const finishedAt = new Date();
  await prisma.syncRun.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt,
      recordsUpserted,
      error: errorMessage,
      notes,
    },
  });

  return {
    id: run.id,
    connector,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    recordsUpserted,
    error: errorMessage,
    notes,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };
}
