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
  const [sources, questionCount] = await Promise.all([
    fetchDataSourceStatus(),
    fetchWeeklyQuestionCount(),
  ]);

  const schoolDataLive = sources.some((s) => s.name === 'School Performance Data' && s.state === 'updated');
  const quickBooksLive = sources.some((s) => s.name === 'QuickBooks' && s.state !== 'not-connected');
  const exampleQuestions = [
    ...(schoolDataLive ? SCHOOL_QUESTIONS : []),
    ...(quickBooksLive ? FINANCE_QUESTIONS : []),
  ];

  return (
    <div className="space-y-12">
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
