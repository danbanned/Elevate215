import { prisma } from '@lp-ai/db';

export const dynamic = 'force-dynamic';

interface SourceFreshness {
  source: string;
  table: string;
  rowCount: number;
  lastSyncedAt: Date | null;
}

async function fetchFreshness(): Promise<SourceFreshness[]> {
  const [students, info, certifications, competencies, attendance, finance, donors, chunks, outcomes] =
    await Promise.all([
      latest('students', 'updated_at'),
      latest('student_info', 'synced_at'),
      latest('student_certifications', 'last_synced_at'),
      latest('student_competencies', 'last_synced_at'),
      latest('attendance_records', 'last_synced_at'),
      latest('finance_snapshots', 'last_synced_at'),
      latest('donor_contacts', 'synced_at'),
      latest('document_chunks', 'synced_at'),
      latest('student_phase_outcomes', 'last_synced_at'),
    ]);

  return [
    { source: 'Students roster', table: 'students', ...students },
    { source: 'Phase outcomes', table: 'student_phase_outcomes', ...outcomes },
    { source: 'Certifications (PCEP)', table: 'student_certifications', ...certifications },
    { source: 'Competencies', table: 'student_competencies', ...competencies },
    { source: 'Attendance', table: 'attendance_records', ...attendance },
    { source: 'Finance (Sheets)', table: 'finance_snapshots', ...finance },
    { source: 'Drive student notes', table: 'student_info', ...info },
    { source: 'Donors (B21 CRM)', table: 'donor_contacts', ...donors },
    { source: 'Vector chunks', table: 'document_chunks', ...chunks },
  ];
}

async function latest(
  table: string,
  column: string,
): Promise<{ rowCount: number; lastSyncedAt: Date | null }> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ count: bigint; last_at: Date | null }>
  >(
    `SELECT COUNT(*)::bigint AS count, MAX("${column}") AS last_at FROM "${table}"`,
  );
  const r = rows[0];
  return {
    rowCount: r ? Number(r.count) : 0,
    lastSyncedAt: r?.last_at ?? null,
  };
}

async function fetchRecentUsage(): Promise<
  Array<{ id: string; toolName: string; durationMs: number | null; error: string | null; calledAt: Date }>
> {
  const rows = await prisma.usageLog.findMany({
    orderBy: { calledAt: 'desc' },
    take: 10,
  });
  return rows.map((r) => ({
    id: r.id,
    toolName: r.toolName,
    durationMs: r.durationMs,
    error: r.error,
    calledAt: r.calledAt,
  }));
}

export default async function HomePage(): Promise<JSX.Element> {
  const [freshness, usage] = await Promise.all([fetchFreshness(), fetchRecentUsage()]);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold text-ink">Data freshness</h1>
        <p className="mt-1 text-sm text-muted">
          Row count + most recent sync timestamp per backing table.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {freshness.map((f) => (
            <div
              key={f.table}
              className="rounded-lg border bg-white p-4 shadow-sm"
            >
              <div className="text-sm font-medium text-ink">{f.source}</div>
              <div className="mt-1 text-xs text-muted">{f.table}</div>
              <div className="mt-3 text-2xl font-semibold tabular-nums">
                {f.rowCount.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-muted">
                {f.lastSyncedAt
                  ? `last synced ${f.lastSyncedAt.toISOString().slice(0, 16)}Z`
                  : 'no data yet'}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-ink">Recent tool calls</h2>
        <p className="mt-1 text-sm text-muted">
          Most recent 10 MCP tool invocations from <code>usage_logs</code>.
        </p>
        <div className="mt-4 overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2">Tool</th>
                <th className="px-4 py-2">Duration</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Called at</th>
              </tr>
            </thead>
            <tbody>
              {usage.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted" colSpan={4}>
                    No tool calls yet.
                  </td>
                </tr>
              ) : (
                usage.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">{u.toolName}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {u.durationMs !== null ? `${u.durationMs.toString()} ms` : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {u.error ? (
                        <span className="inline-flex rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">
                          error
                        </span>
                      ) : (
                        <span className="inline-flex rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">
                          ok
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {u.calledAt.toISOString().slice(0, 19)}Z
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
