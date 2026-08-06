import { prisma } from '@lp-ai/lib-db';
import { formatExactTime, formatRelativeTime } from '../lib/format';

export const dynamic = 'force-dynamic';

interface DataSourceStatus {
  name: string;
  state: 'updated' | 'connected-pending' | 'not-connected';
  when: Date | null;
}

async function fetchDataSourceStatus(): Promise<DataSourceStatus[]> {
  const [qbCredential, qbLastOkRun, sheetsLastOkRun] = await Promise.all([
    prisma.connectorCredential.findFirst({ where: { connector: 'quickbooks' } }),
    prisma.syncRun.findFirst({
      where: { connector: 'quickbooks', status: 'ok' },
      orderBy: { finishedAt: 'desc' },
    }),
    prisma.syncRun.findFirst({
      where: { connector: 'google-sheets', status: 'ok' },
      orderBy: { finishedAt: 'desc' },
    }),
  ]);

  const quickbooks: DataSourceStatus = qbLastOkRun?.finishedAt
    ? { name: 'QuickBooks', state: 'updated', when: qbLastOkRun.finishedAt }
    : qbCredential
      ? { name: 'QuickBooks', state: 'connected-pending', when: null }
      : { name: 'QuickBooks', state: 'not-connected', when: null };

  const schoolData: DataSourceStatus = sheetsLastOkRun?.finishedAt
    ? { name: 'School Performance Data', state: 'updated', when: sheetsLastOkRun.finishedAt }
    : { name: 'School Performance Data', state: 'not-connected', when: null };

  return [schoolData, quickbooks];
}

function DataSourceLine({ source }: { source: DataSourceStatus }): JSX.Element {
  if (source.state === 'updated' && source.when) {
    return (
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium text-ink">{source.name}</div>
        <div className="mt-1 text-sm text-green-700">
          Updated{' '}
          <time dateTime={source.when.toISOString()} title={formatExactTime(source.when)}>
            {formatRelativeTime(source.when)}
          </time>
        </div>
        {source.name === 'QuickBooks' && (
          <div className="mt-1 text-xs text-amber-700">Plan tier not confirmed</div>
        )}
      </div>
    );
  }
  if (source.state === 'connected-pending') {
    return (
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="text-sm font-medium text-ink">{source.name}</div>
        <div className="mt-1 text-sm text-amber-700">Connected — waiting on the first update</div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-ink">{source.name}</div>
      <div className="mt-1 text-sm text-muted">Not yet connected</div>
    </div>
  );
}

type Recency = 'fresh' | 'aging' | 'stale';

// School Rollup refreshes on a school-year/test cycle, not daily — these
// thresholds are deliberately loose compared to a typical "stale data" alert.
function classifyRecency(when: Date | null): Recency {
  if (!when) return 'stale';
  const days = (Date.now() - when.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 30) return 'fresh';
  if (days <= 120) return 'aging';
  return 'stale';
}

const RECENCY_CLASS: Record<Recency, string> = {
  fresh: 'text-green-700',
  aging: 'text-amber-700',
  stale: 'text-red-700',
};

interface EnrollmentDataGap {
  count: number;
  schoolNames: string[];
}

async function fetchEnrollmentDataGaps(): Promise<EnrollmentDataGap> {
  const rows = await prisma.schoolRollup.findMany({
    where: {
      schoolType: 'Charter',
      currentEnrollment: null,
      fillTier: null,
      eapiTier: null,
    },
    select: { schoolName: true },
    orderBy: { schoolName: 'asc' },
  });
  return { count: rows.length, schoolNames: rows.map((r) => r.schoolName) };
}

function SchoolDataFreshnessCard({
  lastRefreshedAt,
  gaps,
}: {
  lastRefreshedAt: Date | null;
  gaps: EnrollmentDataGap;
}): JSX.Element {
  const recency = classifyRecency(lastRefreshedAt);
  return (
    <section>
      <h2 className="text-xl font-semibold text-ink">School performance data — how current is it?</h2>
      <div className="mt-4 space-y-3 rounded-lg border bg-white p-4 shadow-sm">
        <div>
          <div className="text-sm font-medium text-ink">School performance data</div>
          <div className="text-xs text-muted">Updated through Spring 2025 test results</div>
        </div>
        <div className={`text-sm ${RECENCY_CLASS[recency]}`}>
          {lastRefreshedAt ? (
            <>
              Last updated{' '}
              <time dateTime={lastRefreshedAt.toISOString()} title={formatExactTime(lastRefreshedAt)}>
                {formatRelativeTime(lastRefreshedAt)}
              </time>
            </>
          ) : (
            'Not updated yet'
          )}
        </div>
        <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Test scores are from Spring 2025. Enrollment and income data are from the current 2025-26
          school year — one year newer. This is the standard approach for this dataset.
        </div>
        {gaps.count > 0 && (
          <div className="text-xs text-muted" title={gaps.schoolNames.join(', ')}>
            {gaps.count} charter school{gaps.count === 1 ? '' : 's'}{' '}
            {gaps.count === 1 ? 'is' : 'are'} missing enrollment cap data
          </div>
        )}
      </div>
    </section>
  );
}

// PLACEHOLDER ONLY — marks where the real embedded MCP chat feature will
// live once built. This is a static, non-functional visual placeholder: no
// form action, no state, no backend wiring. Building the actual embedded
// chat (streaming responses, conversation history, MCP tool-call rendering)
// is a separate, larger architecture task that's been deliberately deferred
// — do not extend this component piecemeal into that feature. Replace the
// whole thing when that work starts.
function ChatPlaceholder(): JSX.Element {
  return (
    <section>
      <h2 className="text-xl font-semibold text-ink">Ask a question</h2>
      <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
        <p className="text-sm text-muted">
          AI chat coming soon — for now, connect via Claude Desktop using the Elevate215 connector.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            disabled
            placeholder="Ask about school performance or finances…"
            className="flex-1 rounded border bg-slate-50 px-2 py-1 text-sm text-muted placeholder:text-muted"
          />
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded border bg-slate-100 px-3 py-1 text-sm text-muted"
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
}

const SCHOOL_QUESTIONS = [
  'Which charter schools have the most unused seats?',
  'Which schools are beating expectations in math?',
];

const FINANCE_QUESTIONS = [
  "What's our revenue vs. budget this quarter?",
  'Which departments are over budget?',
];

async function fetchWeeklyQuestionCount(): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return prisma.usageLog.count({ where: { calledAt: { gte: sevenDaysAgo } } });
}

export default async function OverviewPage(): Promise<JSX.Element> {
  const [sources, questionCount, enrollmentGaps] = await Promise.all([
    fetchDataSourceStatus(),
    fetchWeeklyQuestionCount(),
    fetchEnrollmentDataGaps(),
  ]);

  const schoolDataSource = sources.find((s) => s.name === 'School Performance Data');
  const schoolDataLive = schoolDataSource?.state === 'updated';
  const quickBooksLive = sources.some((s) => s.name === 'QuickBooks' && s.state !== 'not-connected');
  const exampleQuestions = [
    ...(schoolDataLive ? SCHOOL_QUESTIONS : []),
    ...(quickBooksLive ? FINANCE_QUESTIONS : []),
  ];

  return (
    <div className="space-y-10">
      {schoolDataLive && (
        <SchoolDataFreshnessCard lastRefreshedAt={schoolDataSource.when} gaps={enrollmentGaps} />
      )}

      <section>
        <h1 className="text-2xl font-semibold text-ink">Is your data current?</h1>
        <p className="mt-1 text-sm text-muted">When each of your data sources last updated.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sources.map((s) => (
            <DataSourceLine key={s.name} source={s} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-ink">What can you ask?</h2>
        <p className="mt-1 text-sm text-muted">
          Example questions the system can answer right now, based on which data sources are live.
        </p>
        <div className="mt-4 rounded-lg border bg-white shadow-sm">
          {exampleQuestions.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">
              Once a data source is connected, example questions will show up here.
            </p>
          ) : (
            <ul className="divide-y">
              {exampleQuestions.map((q) => (
                <li key={q} className="px-4 py-3 text-sm text-ink">
                  &ldquo;{q}&rdquo;
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <ChatPlaceholder />

      <section>
        <h2 className="text-xl font-semibold text-ink">Is your team using it?</h2>
        <p className="mt-1 text-sm text-muted">Questions asked in the last 7 days.</p>
        <div className="mt-4 rounded-lg border bg-white p-4 shadow-sm">
          {questionCount === 0 ? (
            <p className="text-sm text-muted">No one has asked a question in the last 7 days yet.</p>
          ) : (
            <p className="text-2xl font-semibold tabular-nums text-ink">
              {questionCount.toLocaleString()}{' '}
              <span className="text-sm font-normal text-muted">
                question{questionCount === 1 ? '' : 's'} asked in the last 7 days
              </span>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
