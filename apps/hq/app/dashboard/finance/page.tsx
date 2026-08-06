import Link from 'next/link';
import { prisma } from '@lp-ai/lib-db';
import { formatExactTime } from '../../../lib/format';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// This page reads finance_snapshots, but ONLY rows tagged `quickbooks:*`
// (tabName filter below) — never Aplos rows (`aplos:funds`/`aplos:accounts`/
// `aplos:transactions`), which are deliberately hidden from this dashboard.
// Treating Aplos data as QuickBooks data would be worse than showing
// nothing, so every query here is scoped by tabName, not just "whatever's
// in the table." Cards with no real data source yet still show an honest
// empty state — nothing here is ever fabricated.
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

// Still used as-is for the two metrics that remain genuinely unbuildable
// (restricted/unrestricted funds, deficits by department) — do not change
// this component's behavior for those cards.
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

function TestDataTag(): JSX.Element {
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
      test data
    </span>
  );
}

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

interface RealMetricCardProps {
  title: string;
  subtitle: string;
  primaryValue: number;
  primaryLabel: string;
  secondaryMessage: string;
}

// Half-real cards: one half has a real number from QuickBooks sandbox data,
// the other half is still an honest empty state (Google Sheets forecast
// import not built yet). The real half is always tagged (test data) — this
// is sandbox company data, not Elevate215's actual finances.
function RealMetricCard({
  title,
  subtitle,
  primaryValue,
  primaryLabel,
  secondaryMessage,
}: RealMetricCardProps): JSX.Element {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-xs text-muted">{subtitle}</p>
      <div className="mt-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-ink">{formatCurrency(primaryValue)}</span>
          <TestDataTag />
        </div>
        <p className="mt-1 text-xs text-muted">{primaryLabel}</p>
        <div className="mt-3 rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-center text-xs text-muted">
          {secondaryMessage}
        </div>
      </div>
    </div>
  );
}

interface YearlyTrend {
  label: string;
  netIncome: number | null;
}

function MultiYearTrendsCard({ trends }: { trends: YearlyTrend[] }): JSX.Element {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-ink">Multi-year trends</h3>
      <p className="mt-1 text-xs text-muted">How this year compares to prior years.</p>
      <div className="mt-4 space-y-1.5">
        {trends.map((t) => (
          <div key={t.label} className="flex items-center justify-between text-sm">
            <span className="text-muted">{t.label}</span>
            <span className="font-medium tabular-nums text-ink">
              {t.netIncome === null ? '—' : formatCurrency(t.netIncome)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <TestDataTag />
        <span className="text-[11px] text-muted">Net income by year</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuickBooks ProfitAndLoss report parsing — the report's Rows are a
// recursive tree (see docs/data-sources for the shape, confirmed against
// live sandbox data). Total Income / Net Income live as top-level rows
// identified by `group`, not by array position, since nesting depth under
// them varies by company chart-of-accounts. ColData is always positionally
// aligned to Columns.Column, with the Total column always last regardless
// of how many period columns precede it.
// ---------------------------------------------------------------------------

interface ColDataEntry {
  value: string;
  id?: string;
}

interface ReportRow {
  Header?: { ColData: ColDataEntry[] };
  Rows?: { Row: ReportRow[] };
  Summary?: { ColData: ColDataEntry[] };
  type?: string;
  group?: string;
}

interface ProfitAndLossReport {
  Header?: { StartPeriod?: string; EndPeriod?: string; SummarizeColumnsBy?: string };
  Columns?: { Column: Array<{ ColTitle: string }> };
  Rows?: { Row: ReportRow[] };
}

function findGroupTotal(report: ProfitAndLossReport, group: string): number | null {
  const rows = report.Rows?.Row ?? [];
  const row = rows.find((r) => r.group === group);
  const colData = row?.Summary?.ColData;
  const last = colData?.[colData.length - 1];
  if (!last) return null;
  const n = Number(last.value);
  return Number.isFinite(n) ? n : null;
}

// columns[0] is the account-label column and the last column is always
// "Total" — the period columns (one per year) sit in between, positionally
// aligned to the same offsets in each row's ColData.
function extractYearlyNetIncome(report: ProfitAndLossReport): YearlyTrend[] {
  const columns = report.Columns?.Column ?? [];
  const rows = report.Rows?.Row ?? [];
  const netIncomeRow = rows.find((r) => r.group === 'NetIncome');
  const colData = netIncomeRow?.Summary?.ColData ?? [];
  const periodColumns = columns.slice(1, -1);
  return periodColumns.map((col, i) => {
    const raw = colData[i + 1]?.value;
    const n = raw !== undefined ? Number(raw) : NaN;
    return { label: col.ColTitle, netIncome: Number.isFinite(n) ? n : null };
  });
}

interface ProfitAndLossSummary {
  totalIncome: number | null;
  netIncome: number | null;
}

async function fetchLatestProfitAndLoss(): Promise<ProfitAndLossSummary | null> {
  const row = await prisma.financeSnapshot.findFirst({
    where: { tabName: 'quickbooks:profit_and_loss' },
    orderBy: { period: 'desc' },
  });
  if (!row) return null;
  const report = row.rowData as unknown as ProfitAndLossReport;
  return {
    totalIncome: findGroupTotal(report, 'Income'),
    netIncome: findGroupTotal(report, 'NetIncome'),
  };
}

async function fetchLatestProfitAndLossByYear(): Promise<YearlyTrend[] | null> {
  const row = await prisma.financeSnapshot.findFirst({
    where: { tabName: 'quickbooks:profit_and_loss_by_year' },
    orderBy: { period: 'desc' },
  });
  if (!row) return null;
  const report = row.rowData as unknown as ProfitAndLossReport;
  if (report.Header?.SummarizeColumnsBy !== 'Year') return null;
  return extractYearlyNetIncome(report);
}

export default async function FinanceDashboardPage(): Promise<JSX.Element> {
  const [{ connected, lastSyncedAt }, profitAndLoss, yearlyTrends] = await Promise.all([
    fetchQuickBooksConnection(),
    fetchLatestProfitAndLoss(),
    fetchLatestProfitAndLossByYear(),
  ]);

  // QuickBooks accounting sync (Phase 2) isn't built yet, so these stay
  // empty regardless of connection — but the message tells the ED which
  // blocker applies right now.
  const connectMessage = (metric: string): string => `Connect QuickBooks to see ${metric}.`;
  const waitingOnSyncMessage = 'QuickBooks is connected — this will appear once we finish building the accounting sync.';
  const forecastNotBuiltMessage = 'Goal — needs the Google Sheets forecast import, not built yet.';
  const forecastActualNotBuiltMessage = 'Forecast — needs the Google Sheets forecast import, not built yet.';

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Finances</h1>
        <p className="mt-1 text-sm text-muted">
          The connection status below is live. Cards marked (test data) show real numbers pulled
          from a QuickBooks sandbox company for development — not Elevate215&apos;s actual
          finances. Every other card is an empty state until its real data source exists.
        </p>
      </header>

      <ConnectionBanner connected={connected} lastSyncedAt={lastSyncedAt} />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Source: QuickBooks ProfitAndLoss report — Total Income (revenue half only). */}
        {profitAndLoss?.totalIncome !== null && profitAndLoss?.totalIncome !== undefined ? (
          <RealMetricCard
            title="Revenue vs. goal"
            subtitle="How much you've raised against this year's target."
            primaryValue={profitAndLoss.totalIncome}
            primaryLabel="Total Income (test data)"
            secondaryMessage={forecastNotBuiltMessage}
          />
        ) : (
          <MetricCard
            title="Revenue vs. goal"
            subtitle="How much you've raised against this year's target."
            emptyMessage={connected ? waitingOnSyncMessage : connectMessage('revenue vs. goal')}
          />
        )}

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
          from QuickBooks. The Sheets forecast import doesn't exist yet, so
          only the actual half can ever render here.
        */}
        {profitAndLoss?.netIncome !== null && profitAndLoss?.netIncome !== undefined ? (
          <RealMetricCard
            title="Forecast vs. actual"
            subtitle="How your projections compare to what actually happened."
            primaryValue={profitAndLoss.netIncome}
            primaryLabel="Net Income (test data)"
            secondaryMessage={forecastActualNotBuiltMessage}
          />
        ) : (
          <MetricCard
            title="Forecast vs. actual"
            subtitle="How your projections compare to what actually happened."
            emptyMessage={
              connected
                ? 'Still needs a Google Sheets forecast import — not built yet.'
                : 'Connect QuickBooks, plus a Google Sheets forecast import — not built yet.'
            }
          />
        )}

        {/* Source: QuickBooks ProfitAndLoss report, summarized by year. */}
        {yearlyTrends && yearlyTrends.length > 0 ? (
          <MultiYearTrendsCard trends={yearlyTrends} />
        ) : (
          <MetricCard
            title="Multi-year trends"
            subtitle="How this year compares to prior years."
            emptyMessage={connected ? waitingOnSyncMessage : connectMessage('multi-year trends')}
          />
        )}
      </section>
    </div>
  );
}
