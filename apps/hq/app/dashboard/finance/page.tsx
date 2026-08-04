import Link from 'next/link';
import { prisma } from '@lp-ai/lib-db';
import { formatExactTime } from '../../../lib/format';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// This page shows NO fabricated numbers. Every metric below is an empty
// state until the real data source exists. Do not read `finance_snapshots`
// here — today it holds Aplos (Launchpad's own accounting) rows, which are
// deliberately hidden from this dashboard; treating that data as QuickBooks
// data would be worse than showing nothing.
// ---------------------------------------------------------------------------

async function fetchQuickBooksConnection(): Promise<{
  connected: boolean;
  lastSyncedAt: Date | null;
}> {
  const credential = await prisma.connectorCredential.findFirst({
    where: { connector: 'quickbooks' },
    orderBy: { updatedAt: 'desc' },
  });
  return { connected: credential !== null, lastSyncedAt: credential?.updatedAt ?? null };
}

function ConnectionBanner({
  connected,
  lastSyncedAt,
}: {
  connected: boolean;
  lastSyncedAt: Date | null;
}): JSX.Element {
  if (connected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <div className="text-sm text-green-800">
          <span className="font-medium">Connected</span>
          {' — last synced '}
          {lastSyncedAt ? formatExactTime(lastSyncedAt) : 'unknown'}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-ink">QuickBooks not yet connected</div>
      <Link
        href="/api/quickbooks/connect"
        className="inline-flex w-fit rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        Connect QuickBooks
      </Link>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  subtitle: string;
  emptyMessage: string;
}

// Every card is an empty state today — no card renders a number yet. Once
// Phase 2 (QuickBooks accounting sync) lands, each card's body swaps from
// `emptyMessage` to the real primary number + comparison line described in
// the design brief (one big number, plain-English line underneath).
function MetricCard({ title, subtitle, emptyMessage }: MetricCardProps): JSX.Element {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-xs text-muted">{subtitle}</p>
      <div className="mt-4 rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-muted">
        {emptyMessage}
      </div>
    </div>
  );
}

export default async function FinanceDashboardPage(): Promise<JSX.Element> {
  const { connected, lastSyncedAt } = await fetchQuickBooksConnection();

  // QuickBooks accounting sync (Phase 2) isn't built yet, so these stay
  // empty regardless of connection — but the message tells the ED which
  // blocker applies right now.
  const connectMessage = (metric: string): string => `Connect QuickBooks to see ${metric}.`;
  const waitingOnSyncMessage = 'QuickBooks is connected — this will appear once we finish building the accounting sync.';

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Finances</h1>
        <p className="mt-1 text-sm text-muted">
          The connection status below is live. Every card underneath it is an empty state until
          QuickBooks accounting data is flowing in.
        </p>
      </header>

      <ConnectionBanner connected={connected} lastSyncedAt={lastSyncedAt} />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Source: QuickBooks ProfitAndLoss report. */}
        <MetricCard
          title="Revenue vs. goal"
          subtitle="How much you've raised against this year's target."
          emptyMessage={connected ? waitingOnSyncMessage : connectMessage('revenue vs. goal')}
        />

        {/*
          Source: QuickBooks class/fund tracking on the ProfitAndLoss report.
          UNCONFIRMED: whether Elevate215's QuickBooks tier supports
          class/fund tracking at all — this is an open question with the
          client, not just a "not built yet" gap. Don't build this out
          further until that's confirmed.
        */}
        <MetricCard
          title="Restricted vs. unrestricted funds"
          subtitle="How much of your funding is committed vs. flexible to use."
          emptyMessage={
            connected ? waitingOnSyncMessage : connectMessage('restricted vs. unrestricted funds')
          }
        />

        {/* Source: QuickBooks ProfitAndLoss report, by class/department. */}
        <MetricCard
          title="Deficits by department"
          subtitle="Which departments are over or under budget."
          emptyMessage={connected ? waitingOnSyncMessage : connectMessage('deficits by department')}
        />

        {/*
          Source: TWO sources that both need to exist and be joined —
          forecast numbers live in the client's Google Sheets, actuals come
          from QuickBooks. Neither the Sheets forecast import nor the join
          exists yet; this stays empty even after QuickBooks is connected.
        */}
        <MetricCard
          title="Forecast vs. actual"
          subtitle="How your projections compare to what actually happened."
          emptyMessage={
            connected
              ? 'Still needs a Google Sheets forecast import — not built yet.'
              : 'Connect QuickBooks, plus a Google Sheets forecast import — not built yet.'
          }
        />

        {/* Source: QuickBooks ProfitAndLoss report, across multiple years. */}
        <MetricCard
          title="Multi-year trends"
          subtitle="How this year compares to prior years."
          emptyMessage={connected ? waitingOnSyncMessage : connectMessage('multi-year trends')}
        />
      </section>
    </div>
  );
}
