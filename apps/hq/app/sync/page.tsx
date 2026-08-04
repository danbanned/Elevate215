import { prisma } from '@lp-ai/lib-db';
import { formatExactTime, formatRelativeTime } from '../../lib/format';

export const dynamic = 'force-dynamic';

// Aplos is Launchpad's own internal accounting system — it must never appear
// in Elevate215's dashboard. The connector code stays in connectors/aplos/ as
// a reference pattern, it's just never listed here.
const CONNECTORS = ['quickbooks', 'google-sheets'] as const;

const CONNECTOR_LABELS: Record<(typeof CONNECTORS)[number], string> = {
  quickbooks: 'QuickBooks',
  'google-sheets': 'School Performance Data',
};

type PlainStatus = 'up-to-date' | 'updating' | 'nothing-new' | 'needs-attention' | 'never-run';

function toPlainStatus(status: string | null): PlainStatus {
  if (status === null) return 'never-run';
  if (status === 'ok') return 'up-to-date';
  if (status === 'running') return 'updating';
  if (status === 'noop') return 'nothing-new';
  return 'needs-attention';
}

const PLAIN_STATUS_LABEL: Record<PlainStatus, string> = {
  'up-to-date': 'Up to date',
  updating: 'Updating…',
  'nothing-new': 'Nothing new yet',
  'needs-attention': 'Needs attention',
  'never-run': 'Not set up yet',
};

const PLAIN_STATUS_CLASS: Record<PlainStatus, string> = {
  'up-to-date': 'bg-green-50 text-green-700',
  updating: 'bg-blue-50 text-blue-700',
  'nothing-new': 'bg-slate-100 text-slate-700',
  'needs-attention': 'bg-red-50 text-red-700',
  'never-run': 'bg-slate-100 text-slate-500',
};

const DOT_CLASS: Record<PlainStatus, string> = {
  'up-to-date': 'bg-green-400',
  updating: 'bg-blue-400',
  'nothing-new': 'bg-slate-300',
  'needs-attention': 'bg-red-400',
  'never-run': 'bg-slate-200',
};

interface ConnectorRow {
  connector: (typeof CONNECTORS)[number];
  lastFinishedAt: Date | null;
  lastStatus: PlainStatus;
  recent: Array<{
    startedAt: Date;
    status: PlainStatus;
    rawStatus: string;
    error: string | null;
  }>;
}

async function fetchConnectorStatus(): Promise<ConnectorRow[]> {
  return Promise.all(
    CONNECTORS.map(async (connector) => {
      const recent = await prisma.syncRun.findMany({
        where: { connector },
        orderBy: { startedAt: 'desc' },
        take: 5,
      });
      const latest = recent[0];
      return {
        connector,
        lastFinishedAt: latest?.finishedAt ?? null,
        lastStatus: toPlainStatus(latest?.status ?? null),
        recent: recent.map((r) => ({
          startedAt: r.startedAt,
          status: toPlainStatus(r.status),
          rawStatus: r.status,
          error: r.error,
        })),
      };
    }),
  );
}

function StatusBadge({ status }: { status: PlainStatus }): JSX.Element {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs ${PLAIN_STATUS_CLASS[status]}`}>
      {PLAIN_STATUS_LABEL[status]}
    </span>
  );
}

export default async function DataUpdatesPage(): Promise<JSX.Element> {
  const rows = await fetchConnectorStatus();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Data updates</h1>
        <p className="mt-1 text-sm text-muted">
          Where your information comes from and when it last refreshed.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2">Data source</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Last updated</th>
              <th className="px-4 py-2">Recent</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.connector} className="border-t align-top">
                <td className="px-4 py-3 font-medium">{CONNECTOR_LABELS[r.connector]}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.lastStatus} />
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {r.lastFinishedAt ? (
                    <time
                      dateTime={r.lastFinishedAt.toISOString()}
                      title={formatExactTime(r.lastFinishedAt)}
                    >
                      {formatRelativeTime(r.lastFinishedAt)}
                    </time>
                  ) : (
                    'Not yet'
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {r.recent.map((run, i) => (
                      <span
                        key={i}
                        title={`${formatExactTime(run.startedAt)} · ${PLAIN_STATUS_LABEL[run.status]}${
                          run.error ? ' · ' + run.error : ''
                        }`}
                        className={`inline-block h-2 w-6 rounded ${DOT_CLASS[run.status]}`}
                      />
                    ))}
                    {r.recent.length === 0 && (
                      <span className="text-xs text-muted">no updates yet</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
