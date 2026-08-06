import Link from 'next/link';
import { prisma } from '@lp-ai/lib-db';
import { formatExactTime, formatRelativeTime } from '../../lib/format';

export const dynamic = 'force-dynamic';

// Plain-English description of what the user was doing, keyed by the
// underlying MCP tool name. New tools should get an entry here — anything
// missing falls back to the raw name so it's never silently hidden.
const TOOL_DESCRIPTIONS: Record<string, string> = {
  query_school_rollup: 'Looked up school performance data',
  query_finances: 'Looked up financial data',
  get_finance_brief: 'Generated a financial summary',
  search_documents: 'Searched documents',
  skill_finance_audit: 'Ran a finance review',
};

function describeTool(toolName: string): string {
  return TOOL_DESCRIPTIONS[toolName] ?? toolName;
}

interface PageProps {
  searchParams: { tool?: string; status?: string };
}

export default async function ActivityPage({ searchParams }: PageProps): Promise<JSX.Element> {
  const toolFilter = searchParams.tool;
  const statusFilter = searchParams.status;

  const where = {
    ...(toolFilter ? { toolName: toolFilter } : {}),
    ...(statusFilter === 'error' ? { error: { not: null } } : {}),
    ...(statusFilter === 'ok' ? { error: null } : {}),
  };

  const [rows, distinctTools] = await Promise.all([
    prisma.usageLog.findMany({
      where,
      orderBy: { calledAt: 'desc' },
      take: 100,
    }),
    prisma.usageLog.groupBy({
      by: ['toolName'],
      _count: { _all: true },
      orderBy: { _count: { toolName: 'desc' } },
    }),
  ]);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold text-ink">AI Activity</h1>
        <p className="mt-1 text-sm text-muted">
          Who&apos;s been using the system and what they&apos;ve been asking, most recent first.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Filter:</span>
        <Link
          href="/tools"
          className={`rounded border px-2 py-1 ${!toolFilter && !statusFilter ? 'bg-ink text-white' : 'bg-white'}`}
        >
          All activity
        </Link>
        <Link
          href="/tools?status=error"
          className={`rounded border px-2 py-1 ${statusFilter === 'error' ? 'bg-ink text-white' : 'bg-white'}`}
        >
          Only issues
        </Link>
        {distinctTools.map((t) => (
          <Link
            key={t.toolName}
            href={`/tools?tool=${encodeURIComponent(t.toolName)}`}
            className={`rounded border px-2 py-1 ${toolFilter === t.toolName ? 'bg-ink text-white' : 'bg-white'}`}
          >
            {describeTool(t.toolName)} · {t._count._all.toString()}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2">Who</th>
              <th className="px-4 py-2">What they were doing</th>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Result</th>
              <th className="px-4 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-muted" colSpan={5}>
                  No matching activity.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-4 py-2 text-xs text-ink">
                    {r.anthropicUserEmail ?? (r.anthropicUserId ? `${r.anthropicUserId.slice(0, 8)}…` : 'Unknown user')}
                  </td>
                  <td className="px-4 py-2">{describeTool(r.toolName)}</td>
                  <td className="px-4 py-2 text-xs text-muted">
                    <time dateTime={r.calledAt.toISOString()} title={formatExactTime(r.calledAt)}>
                      {formatRelativeTime(r.calledAt)}
                    </time>
                  </td>
                  <td className="px-4 py-2">
                    {r.error ? (
                      <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">
                        ⚠ Needs attention
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">
                        ✓ Success
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <details>
                      <summary className="cursor-pointer text-muted hover:text-ink">
                        Show details
                      </summary>
                      <div className="mt-2 max-w-md space-y-1 rounded bg-slate-50 p-2 text-[10px] leading-tight">
                        <div>
                          <span className="font-medium text-muted">Tool:</span>{' '}
                          <span className="font-mono">{r.toolName}</span>
                        </div>
                        <div>
                          <span className="font-medium text-muted">Duration:</span>{' '}
                          {r.durationMs !== null ? `${r.durationMs.toString()} ms` : 'not recorded'}
                        </div>
                        {r.error && (
                          <div>
                            <span className="font-medium text-muted">Error:</span> {r.error}
                          </div>
                        )}
                        <pre className="max-h-64 overflow-auto rounded bg-white p-2">
                          {JSON.stringify({ input: r.inputJson, output: r.outputJson }, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
