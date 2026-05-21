import { prisma } from '@lp-ai/db';

export const dynamic = 'force-dynamic';

interface CompletionRow {
  cohort_year: string;
  student_count: string;
  foundations_started: string;
  foundations_complete: string;
  phase_101_started: string;
  phase_101_complete: string;
  lightspeed_started: string;
  lightspeed_complete: string;
  liftoff_started: string;
  liftoff_complete: string;
}

interface AttendanceMonthRow {
  cohort: number;
  month: string;
  avg_attendance: string;
}

interface AttendanceFlagRow {
  student_name: string;
  cohort: number;
  avg_attendance: string;
}

interface StipendRow {
  program: string;
  month: string;
  total_amount: string;
}

interface StipendDiagRow {
  tab_name: string;
  row_count: string;
  sample_row_data: string;
  jsonb_typeof: string;
  sample_date: string | null;
  sample_amount: string | null;
  sample_description: string | null;
  sample_date_time: string | null;
  sample_total_amount: string | null;
}

interface CompetencyAvgRow {
  competency: string;
  avg_performance: string;
  avg_growth: string;
  avg_progress: string;
  student_count: string;
}

interface MissedErRow {
  student_name: string;
  competency: string;
  missed_er: number;
}

interface StipendRecipientRow {
  recipient_label: string;
  matched: boolean;
  has_extraction: boolean;
  program: string;
  txn_count: string;
  total_amount: string;
}

type QueryResult<T> =
  | { data: T; error: null }
  | { data: null; error: string | null };

async function safeQuery<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<QueryResult<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('does not exist')) return { data: null, error: null };
    console.error(`Dashboard [${label}]:`, msg);
    return { data: null, error: msg };
  }
}

function pct(complete: string, started: string): string {
  const c = parseInt(complete, 10);
  const s = parseInt(started, 10);
  if (!s) return '—';
  return `${Math.round((c / s) * 100).toString()}%`;
}

function SectionError({ message }: { message: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span className="font-medium">Query error:</span> {message}
    </div>
  );
}

const completionSql = `
  WITH base AS (
    SELECT
      COALESCE(EXTRACT(YEAR FROM spo.foundations_start_date)::text, 'Unknown') AS cohort_year,
      s.id,
      spo.foundations_start_date, LOWER(TRIM(spo.foundations_status)) AS foundations_status,
      spo.phase_101_start_date,   LOWER(TRIM(spo.phase_101_status))   AS phase_101_status,
      spo.lightspeed_start_date,  LOWER(TRIM(spo.lightspeed_status))  AS lightspeed_status,
      spo.liftoff_start_date,     LOWER(TRIM(spo.liftoff_status))     AS liftoff_status
    FROM students s
    INNER JOIN student_phase_outcomes spo ON s.id = spo.student_id
  ),
  by_cohort AS (
    SELECT
      cohort_year,
      COUNT(DISTINCT id)::text AS student_count,
      COUNT(DISTINCT CASE WHEN foundations_start_date IS NOT NULL THEN id END)::text AS foundations_started,
      COUNT(DISTINCT CASE WHEN foundations_status = 'completed' THEN id END)::text AS foundations_complete,
      COUNT(DISTINCT CASE WHEN phase_101_start_date   IS NOT NULL THEN id END)::text AS phase_101_started,
      COUNT(DISTINCT CASE WHEN phase_101_status   = 'completed' THEN id END)::text AS phase_101_complete,
      COUNT(DISTINCT CASE WHEN lightspeed_start_date  IS NOT NULL THEN id END)::text AS lightspeed_started,
      COUNT(DISTINCT CASE WHEN lightspeed_status  = 'completed' THEN id END)::text AS lightspeed_complete,
      COUNT(DISTINCT CASE WHEN liftoff_start_date     IS NOT NULL THEN id END)::text AS liftoff_started,
      COUNT(DISTINCT CASE WHEN liftoff_status     = 'completed' THEN id END)::text AS liftoff_complete
    FROM base
    GROUP BY cohort_year
  ),
  totals AS (
    SELECT
      'All Time' AS cohort_year,
      COUNT(DISTINCT id)::text AS student_count,
      COUNT(DISTINCT CASE WHEN foundations_start_date IS NOT NULL THEN id END)::text AS foundations_started,
      COUNT(DISTINCT CASE WHEN foundations_status = 'completed' THEN id END)::text AS foundations_complete,
      COUNT(DISTINCT CASE WHEN phase_101_start_date   IS NOT NULL THEN id END)::text AS phase_101_started,
      COUNT(DISTINCT CASE WHEN phase_101_status   = 'completed' THEN id END)::text AS phase_101_complete,
      COUNT(DISTINCT CASE WHEN lightspeed_start_date  IS NOT NULL THEN id END)::text AS lightspeed_started,
      COUNT(DISTINCT CASE WHEN lightspeed_status  = 'completed' THEN id END)::text AS lightspeed_complete,
      COUNT(DISTINCT CASE WHEN liftoff_start_date     IS NOT NULL THEN id END)::text AS liftoff_started,
      COUNT(DISTINCT CASE WHEN liftoff_status     = 'completed' THEN id END)::text AS liftoff_complete
    FROM base
  )
  SELECT * FROM (
    SELECT *, 0 AS sort_order FROM by_cohort
    UNION ALL
    SELECT *, 1 AS sort_order FROM totals
  ) combined
  ORDER BY sort_order, cohort_year DESC NULLS LAST
`;

const attendanceMonthlySql = `
  WITH per_student_month AS (
    SELECT
      cohort,
      TO_CHAR(date, 'YYYY-MM') AS month,
      student_number,
      ROUND(
        COUNT(CASE WHEN UPPER(code) IN ('P', 'L') THEN 1 END)::numeric
          / NULLIF(COUNT(*), 0) * 100, 1
      ) AS student_rate
    FROM attendance_records
    WHERE cohort IN (1, 2, 3) AND code IS NOT NULL AND date IS NOT NULL
    GROUP BY cohort, TO_CHAR(date, 'YYYY-MM'), student_number
  )
  SELECT cohort, month, ROUND(AVG(student_rate), 1)::text AS avg_attendance
  FROM per_student_month
  GROUP BY cohort, month
  ORDER BY cohort, month DESC
`;

const attendanceFlaggedSql = `
  WITH rates AS (
    SELECT
      student_number,
      cohort,
      ROUND(
        COUNT(CASE WHEN UPPER(code) IN ('P', 'L') THEN 1 END)::numeric
          / NULLIF(COUNT(*), 0) * 100, 1
      ) AS avg_att
    FROM attendance_records
    WHERE cohort IN (1, 2, 3) AND code IS NOT NULL
    GROUP BY student_number, cohort
    HAVING COUNT(CASE WHEN UPPER(code) IN ('P', 'L') THEN 1 END)::numeric
             / NULLIF(COUNT(*), 0) * 100 < 80
  )
  SELECT
    COALESCE(s.canonical_name, r.student_number) AS student_name,
    r.cohort,
    r.avg_att::text AS avg_attendance
  FROM rates r
  LEFT JOIN students s ON s.student_number = r.student_number
  ORDER BY r.avg_att ASC
  LIMIT 50
`;

const stipendsSql = `
  WITH normalized AS (
    SELECT
      CASE WHEN jsonb_typeof(row_data) = 'string'
           THEN (row_data #>> '{}')::jsonb
           ELSE row_data
      END AS row_data
    FROM finance_snapshots
    WHERE tab_name LIKE 'pex:FY%' OR tab_name LIKE 'rapid:FY%'
  ),
  raw AS (
    SELECT
      COALESCE(NULLIF(TRIM(row_data->>'program'), ''), 'Unknown') AS program,
      COALESCE(
        NULLIF(TRIM(row_data->>'date'), ''),
        NULLIF(TRIM(row_data->>'date_time'), '')
      ) AS raw_date,
      COALESCE(
        NULLIF(TRIM(row_data->>'amount'), ''),
        NULLIF(TRIM(row_data->>'total_amount'), ''),
        NULLIF(TRIM(row_data->>'base_amount'), '')
      ) AS raw_amount
    FROM normalized
  ),
  cleaned AS (
    SELECT
      program,
      SPLIT_PART(raw_date, ' ', 1) AS date_part,
      REPLACE(REPLACE(raw_amount, ',', ''), '$', '') AS amount_part
    FROM raw
  ),
  parsed AS (
    SELECT program, date_part, amount_part
    FROM cleaned
    WHERE date_part ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
      AND amount_part ~ '^-?[0-9]+([.][0-9]+)?$'
  )
  SELECT
    program,
    TO_CHAR(TO_DATE(date_part, 'MM/DD/YYYY'), 'YYYY-MM') AS month,
    ROUND(SUM(amount_part::numeric), 2)::text AS total_amount
  FROM parsed
  GROUP BY program, TO_CHAR(TO_DATE(date_part, 'MM/DD/YYYY'), 'YYYY-MM')
  ORDER BY month DESC, program
`;

const stipendDiagSql = `
  SELECT
    t.tab_name,
    t.row_count::text AS row_count,
    LEFT(s.row_data::text, 400) AS sample_row_data,
    jsonb_typeof(s.row_data) AS jsonb_typeof,
    s.normalized->>'date'         AS sample_date,
    s.normalized->>'amount'       AS sample_amount,
    s.normalized->>'description'  AS sample_description,
    s.normalized->>'date_time'    AS sample_date_time,
    s.normalized->>'total_amount' AS sample_total_amount
  FROM (
    SELECT tab_name, COUNT(*) AS row_count
    FROM finance_snapshots
    WHERE tab_name LIKE 'pex:FY%' OR tab_name LIKE 'rapid:FY%'
    GROUP BY tab_name
  ) t
  JOIN LATERAL (
    SELECT
      row_data,
      CASE WHEN jsonb_typeof(row_data) = 'string'
           THEN (row_data #>> '{}')::jsonb
           ELSE row_data
      END AS normalized
    FROM finance_snapshots
    WHERE tab_name = t.tab_name
    ORDER BY last_synced_at DESC NULLS LAST
    LIMIT 1
  ) s ON true
  ORDER BY t.tab_name
`;

const stipendRecipientsSql = `
  WITH normalized AS (
    SELECT
      CASE WHEN jsonb_typeof(row_data) = 'string'
           THEN (row_data #>> '{}')::jsonb
           ELSE row_data
      END AS row_data
    FROM finance_snapshots
    WHERE tab_name LIKE 'pex:FY%' OR tab_name LIKE 'rapid:FY%'
  ),
  raw AS (
    SELECT
      COALESCE(NULLIF(TRIM(row_data->>'program'), ''), 'Unknown') AS program,
      COALESCE(
        NULLIF(TRIM(row_data->>'date'), ''),
        NULLIF(TRIM(row_data->>'date_time'), '')
      ) AS raw_date,
      COALESCE(
        NULLIF(TRIM(row_data->>'amount'), ''),
        NULLIF(TRIM(row_data->>'total_amount'), ''),
        NULLIF(TRIM(row_data->>'base_amount'), '')
      ) AS raw_amount,
      COALESCE(
        SUBSTRING(row_data->>'description'    FROM 'Funding Adjustment To: (.+)$'),
        SUBSTRING(row_data->>'reference_info' FROM 'Funds Transfer to (.+) [0-9]+$')
      ) AS raw_recipient
    FROM normalized
  ),
  cleaned AS (
    SELECT
      program,
      REPLACE(REPLACE(raw_amount, ',', ''), '$', '') AS amount_part,
      SPLIT_PART(raw_date, ' ', 1) AS date_part,
      NULLIF(TRIM(raw_recipient), '') AS recipient
    FROM raw
  ),
  valid AS (
    SELECT program, amount_part, recipient
    FROM cleaned
    WHERE date_part ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
      AND amount_part ~ '^-?[0-9]+([.][0-9]+)?$'
  ),
  joined AS (
    SELECT
      v.program,
      v.amount_part::numeric AS amount,
      v.recipient,
      s.canonical_name AS student_match
    FROM valid v
    LEFT JOIN students s
      ON v.recipient IS NOT NULL
     AND LOWER(TRIM(s.canonical_name)) = LOWER(TRIM(v.recipient))
  )
  SELECT
    CASE
      WHEN recipient IS NULL THEN '— Admin / Funding —'
      WHEN student_match IS NOT NULL THEN student_match
      ELSE recipient
    END AS recipient_label,
    (student_match IS NOT NULL) AS matched,
    (recipient IS NOT NULL) AS has_extraction,
    program,
    COUNT(*)::text AS txn_count,
    ROUND(SUM(amount), 2)::text AS total_amount
  FROM joined
  GROUP BY
    CASE
      WHEN recipient IS NULL THEN '— Admin / Funding —'
      WHEN student_match IS NOT NULL THEN student_match
      ELSE recipient
    END,
    (student_match IS NOT NULL),
    (recipient IS NOT NULL),
    program
  ORDER BY SUM(amount) DESC NULLS LAST
`;

const competencyAvgsSql = `
  SELECT
    competency,
    ROUND(AVG(performance_level), 2)::text AS avg_performance,
    ROUND(AVG(growth), 2)::text AS avg_growth,
    ROUND(AVG(progress), 2)::text AS avg_progress,
    COUNT(*)::text AS student_count
  FROM student_competencies
  WHERE performance_level IS NOT NULL
  GROUP BY competency
  ORDER BY competency
`;

const missedErsSql = `
  SELECT
    COALESCE(s.canonical_name, sc.student_number) AS student_name,
    sc.competency,
    sc.missed_er
  FROM student_competencies sc
  LEFT JOIN students s ON s.student_number = sc.student_number
  WHERE sc.missed_er > 1
  ORDER BY sc.missed_er DESC, student_name
  LIMIT 100
`;

export default async function DashboardPage(): Promise<JSX.Element> {
  const [
    completion,
    attendanceMonthly,
    attendanceFlagged,
    stipends,
    stipendDiag,
    stipendRecipients,
    competencyAvgs,
    missedErs,
  ] = await Promise.all([
    safeQuery('completion', () =>
      prisma.$queryRawUnsafe<Array<CompletionRow & { sort_order: number }>>(completionSql),
    ),
    safeQuery('attendance-monthly', () =>
      prisma.$queryRawUnsafe<AttendanceMonthRow[]>(attendanceMonthlySql),
    ),
    safeQuery('attendance-flagged', () =>
      prisma.$queryRawUnsafe<AttendanceFlagRow[]>(attendanceFlaggedSql),
    ),
    safeQuery('stipends', () =>
      prisma.$queryRawUnsafe<StipendRow[]>(stipendsSql),
    ),
    safeQuery('stipend-diag', () =>
      prisma.$queryRawUnsafe<StipendDiagRow[]>(stipendDiagSql),
    ),
    safeQuery('stipend-recipients', () =>
      prisma.$queryRawUnsafe<StipendRecipientRow[]>(stipendRecipientsSql),
    ),
    safeQuery('competency-avgs', () =>
      prisma.$queryRawUnsafe<CompetencyAvgRow[]>(competencyAvgsSql),
    ),
    safeQuery('missed-ers', () =>
      prisma.$queryRawUnsafe<MissedErRow[]>(missedErsSql),
    ),
  ]);

  const completionRows = completion.data ?? [];
  const monthlyRows = attendanceMonthly.data ?? [];
  const flaggedRows = attendanceFlagged.data ?? [];
  const stipendRows = stipends.data ?? [];
  const competencyRows = competencyAvgs.data ?? [];
  const missedErRows = missedErs.data ?? [];

  const attendanceByCohort = new Map<number, AttendanceMonthRow[]>();
  for (const row of monthlyRows) {
    const c = Number(row.cohort);
    if (!attendanceByCohort.has(c)) attendanceByCohort.set(c, []);
    attendanceByCohort.get(c)!.push(row);
  }

  const stipendPrograms = [...new Set(stipendRows.map((r) => r.program))].sort();
  const stipendMonths = [...new Set(stipendRows.map((r) => r.month))].sort().reverse();
  const stipendMap = new Map(stipendRows.map((r) => [`${r.program}|${r.month}`, r.total_amount]));

  const recipientRows = stipendRecipients.data ?? [];
  interface RecipientAgg {
    label: string;
    matched: boolean;
    hasExtraction: boolean;
    txnCount: number;
    total: number;
    programs: Map<string, number>;
  }
  const recipientAggMap = new Map<string, RecipientAgg>();
  let stipendMatchedTxns = 0;
  let stipendMatchedAmt = 0;
  let stipendUnmatchedTxns = 0;
  let stipendUnmatchedAmt = 0;
  let stipendAdminTxns = 0;
  let stipendAdminAmt = 0;
  for (const r of recipientRows) {
    const amt = parseFloat(r.total_amount) || 0;
    const txns = parseInt(r.txn_count, 10) || 0;
    if (!r.has_extraction) {
      stipendAdminTxns += txns;
      stipendAdminAmt += amt;
    } else if (r.matched) {
      stipendMatchedTxns += txns;
      stipendMatchedAmt += amt;
    } else {
      stipendUnmatchedTxns += txns;
      stipendUnmatchedAmt += amt;
    }
    const existing = recipientAggMap.get(r.recipient_label) ?? {
      label: r.recipient_label,
      matched: r.matched,
      hasExtraction: r.has_extraction,
      txnCount: 0,
      total: 0,
      programs: new Map<string, number>(),
    };
    existing.txnCount += txns;
    existing.total += amt;
    existing.programs.set(r.program, (existing.programs.get(r.program) ?? 0) + amt);
    recipientAggMap.set(r.recipient_label, existing);
  }
  const recipientAggs = [...recipientAggMap.values()].sort(
    (a, b) => Math.abs(b.total) - Math.abs(a.total),
  );

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Cross-source analytics: program completion, attendance, stipends, and competency.
        </p>
      </header>

      {/* Program Completion */}
      <section>
        <h2 className="text-lg font-semibold text-ink mb-4">Program Completion</h2>
        {completion.error ? (
          <SectionError message={completion.error} />
        ) : completionRows.length === 0 ? (
          <p className="text-sm text-muted">No phase outcome data synced yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-2 font-medium text-muted border border-slate-200">Cohort</th>
                  <th className="px-4 py-2 font-medium text-muted border border-slate-200">Students</th>
                  <th className="px-4 py-2 font-medium text-muted border border-slate-200 text-center" colSpan={2}>Foundations</th>
                  <th className="px-4 py-2 font-medium text-muted border border-slate-200 text-center" colSpan={2}>101</th>
                  <th className="px-4 py-2 font-medium text-muted border border-slate-200 text-center" colSpan={2}>Lightspeed</th>
                  <th className="px-4 py-2 font-medium text-muted border border-slate-200 text-center" colSpan={2}>LiftOff</th>
                </tr>
                <tr className="bg-slate-50 text-xs text-muted">
                  <th className="px-4 py-1 border border-slate-200" colSpan={2} />
                  <th className="px-4 py-1 border border-slate-200">Started</th>
                  <th className="px-4 py-1 border border-slate-200">Completed</th>
                  <th className="px-4 py-1 border border-slate-200">Started</th>
                  <th className="px-4 py-1 border border-slate-200">Completed</th>
                  <th className="px-4 py-1 border border-slate-200">Started</th>
                  <th className="px-4 py-1 border border-slate-200">Completed</th>
                  <th className="px-4 py-1 border border-slate-200">Started</th>
                  <th className="px-4 py-1 border border-slate-200">Completed</th>
                </tr>
              </thead>
              <tbody>
                {completionRows.map((row) => {
                  const isTotal = row.cohort_year === 'All Time';
                  const rowClass = isTotal
                    ? 'border-t-2 border-slate-400 bg-slate-50 font-semibold'
                    : 'hover:bg-slate-50';
                  const cellClass = `px-4 py-2 border border-slate-200${isTotal ? ' text-ink' : ''}`;
                  return (
                    <tr key={row.cohort_year} className={rowClass}>
                      <td className={`${cellClass} font-medium`}>{row.cohort_year}</td>
                      <td className={cellClass}>{row.student_count}</td>
                      <td className={cellClass}>{row.foundations_started}</td>
                      <td className={cellClass}>
                        {row.foundations_complete}{' '}
                        <span className="text-muted text-xs">
                          ({pct(row.foundations_complete, row.foundations_started)})
                        </span>
                      </td>
                      <td className={cellClass}>{row.phase_101_started}</td>
                      <td className={cellClass}>
                        {row.phase_101_complete}{' '}
                        <span className="text-muted text-xs">
                          ({pct(row.phase_101_complete, row.phase_101_started)})
                        </span>
                      </td>
                      <td className={cellClass}>{row.lightspeed_started}</td>
                      <td className={cellClass}>
                        {row.lightspeed_complete}{' '}
                        <span className="text-muted text-xs">
                          ({pct(row.lightspeed_complete, row.lightspeed_started)})
                        </span>
                      </td>
                      <td className={cellClass}>{row.liftoff_started}</td>
                      <td className={cellClass}>
                        {row.liftoff_complete}{' '}
                        <span className="text-muted text-xs">
                          ({pct(row.liftoff_complete, row.liftoff_started)})
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Attendance */}
      <section>
        <h2 className="text-lg font-semibold text-ink mb-4">Attendance</h2>
        {attendanceMonthly.error ? (
          <SectionError message={attendanceMonthly.error} />
        ) : monthlyRows.length === 0 ? (
          <p className="text-sm text-muted">No attendance data synced yet.</p>
        ) : (
          <div className="space-y-6">
            {[1, 2, 3].map((cohort) => {
              const rows = attendanceByCohort.get(cohort) ?? [];
              if (rows.length === 0) return null;
              return (
                <div key={cohort}>
                  <h3 className="text-sm font-medium text-ink mb-2">Cohort {cohort} — Monthly Average</h3>
                  {cohort === 1 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2">
                      <span className="font-medium">Data caveat:</span> Cohort 1 attendance source may be missing Jan–Aug 2023.
                      Any month before Sept 2023 should be treated as incomplete. Late (L) days count as present in the % below.
                    </p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50">
                          {rows.map((r) => (
                            <th key={r.month} className="px-3 py-2 font-medium text-muted border border-slate-200 text-center min-w-[80px]">
                              {r.month}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {rows.map((r) => {
                            const val = parseFloat(r.avg_attendance);
                            const flagged = val < 80;
                            return (
                              <td key={r.month} className={`px-3 py-2 border border-slate-200 text-center ${flagged ? 'bg-red-50 text-red-700 font-semibold' : 'text-ink'}`}>
                                {r.avg_attendance}%
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            {attendanceFlagged.error ? (
              <SectionError message={attendanceFlagged.error} />
            ) : flaggedRows.length > 0 ? (
              <div>
                <h3 className="text-sm font-medium text-red-700 mb-2">Students Below 80% Attendance</h3>
                <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-red-50 text-left">
                        <th className="px-4 py-2 font-medium text-muted border border-slate-200">Student</th>
                        <th className="px-4 py-2 font-medium text-muted border border-slate-200">Cohort</th>
                        <th className="px-4 py-2 font-medium text-muted border border-slate-200">Avg Attendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flaggedRows.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-2 border border-slate-200">{row.student_name}</td>
                          <td className="px-4 py-2 border border-slate-200">{row.cohort}</td>
                          <td className="px-4 py-2 border border-slate-200 text-red-600 font-semibold">{row.avg_attendance}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* Stipends */}
      <section>
        <h2 className="text-lg font-semibold text-ink mb-4">Stipends — Monthly Totals</h2>
        {stipends.error ? (
          <SectionError message={stipends.error} />
        ) : stipendRows.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">No stipend transactions matched. Diagnostic — what&apos;s actually stored per tab:</p>
            {(stipendDiag.data ?? []).length === 0 ? (
              <p className="text-xs text-muted">
                finance_snapshots has zero rows where tab_name LIKE &apos;pex:FY%&apos; or &apos;rapid:FY%&apos;.
              </p>
            ) : (
              <div className="space-y-4">
                {(stipendDiag.data ?? []).map((r) => (
                  <div key={r.tab_name} className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
                    <div className="font-mono font-semibold mb-1">
                      {r.tab_name} <span className="text-muted font-normal">({r.row_count} rows, jsonb_typeof = {r.jsonb_typeof})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 mb-2">
                      <div><span className="text-muted">date:</span> <span className="font-mono">{r.sample_date ?? <span className="text-slate-400">null</span>}</span></div>
                      <div><span className="text-muted">date_time:</span> <span className="font-mono">{r.sample_date_time ?? <span className="text-slate-400">null</span>}</span></div>
                      <div><span className="text-muted">amount:</span> <span className="font-mono">{r.sample_amount ?? <span className="text-slate-400">null</span>}</span></div>
                      <div><span className="text-muted">total_amount:</span> <span className="font-mono">{r.sample_total_amount ?? <span className="text-slate-400">null</span>}</span></div>
                      <div className="col-span-2"><span className="text-muted">description:</span> <span className="font-mono">{r.sample_description ?? <span className="text-slate-400">null</span>}</span></div>
                    </div>
                    <div className="text-muted mb-0.5">Raw row_data (first 400 chars):</div>
                    <pre className="font-mono text-[10px] bg-slate-50 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">{r.sample_row_data}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-2 font-medium text-muted border border-slate-200">Program</th>
                  {stipendMonths.map((m) => (
                    <th key={m} className="px-3 py-2 font-medium text-muted border border-slate-200 text-right min-w-[90px]">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stipendPrograms.map((program) => (
                  <tr key={program} className="hover:bg-slate-50">
                    <td className="px-4 py-2 border border-slate-200 font-medium">{program}</td>
                    {stipendMonths.map((month) => {
                      const val = stipendMap.get(`${program}|${month}`);
                      return (
                        <td key={month} className="px-3 py-2 border border-slate-200 text-right">
                          {val ? `$${parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!stipends.error && stipendRows.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-medium text-ink mb-2">Stipends by Recipient</h3>
            {stipendRecipients.error ? (
              <SectionError message={stipendRecipients.error} />
            ) : recipientAggs.length === 0 ? (
              <p className="text-xs text-muted">No recipient data.</p>
            ) : (
              <>
                <p className="text-xs text-muted mb-3">
                  <span className="text-ink">{stipendMatchedTxns}</span> txns (<span className="text-ink">${stipendMatchedAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>) matched to students;{' '}
                  <span className="text-amber-700">{stipendUnmatchedTxns}</span> txns (<span className="text-amber-700">${stipendUnmatchedAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>) had an extractable name that didn&apos;t match a student record;{' '}
                  <span className="text-muted">{stipendAdminTxns}</span> txns (<span className="text-muted">${stipendAdminAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>) had no extractable recipient (admin / funding).
                </p>
                <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        <th className="px-4 py-2 font-medium text-muted border border-slate-200">Recipient</th>
                        <th className="px-4 py-2 font-medium text-muted border border-slate-200">Program(s)</th>
                        <th className="px-4 py-2 font-medium text-muted border border-slate-200 text-right">Txns</th>
                        <th className="px-4 py-2 font-medium text-muted border border-slate-200 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipientAggs.map((r) => {
                        const rowClass = !r.hasExtraction
                          ? 'bg-slate-50 text-muted'
                          : !r.matched
                            ? 'bg-amber-50'
                            : 'hover:bg-slate-50';
                        const programs = [...r.programs.keys()].sort().join(', ');
                        return (
                          <tr key={r.label} className={rowClass}>
                            <td className="px-4 py-2 border border-slate-200">
                              {r.label}
                              {r.hasExtraction && !r.matched && (
                                <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-700">unmatched</span>
                              )}
                            </td>
                            <td className="px-4 py-2 border border-slate-200 text-muted text-xs">{programs}</td>
                            <td className="px-4 py-2 border border-slate-200 text-right">{r.txnCount}</td>
                            <td className="px-4 py-2 border border-slate-200 text-right font-medium">
                              ${r.total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Competency */}
      <section>
        <h2 className="text-lg font-semibold text-ink mb-4">Competency</h2>
        {competencyAvgs.error ? (
          <SectionError message={competencyAvgs.error} />
        ) : competencyRows.length === 0 ? (
          <p className="text-sm text-muted">No competency data synced yet.</p>
        ) : (
          <div className="space-y-6">
            <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-2 font-medium text-muted border border-slate-200">Competency</th>
                    <th className="px-4 py-2 font-medium text-muted border border-slate-200 text-center">Students</th>
                    <th className="px-4 py-2 font-medium text-muted border border-slate-200 text-center">Avg Performance</th>
                    <th className="px-4 py-2 font-medium text-muted border border-slate-200 text-center">Avg Growth</th>
                    <th className="px-4 py-2 font-medium text-muted border border-slate-200 text-center">Avg Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {competencyRows.map((row) => {
                    const growth = parseFloat(row.avg_growth);
                    const progress = parseFloat(row.avg_progress);
                    const flagGrowth = !isNaN(growth) && growth < 0;
                    const flagProgress = !isNaN(progress) && progress < 75;
                    const rowFlag = flagGrowth || flagProgress;
                    return (
                      <tr key={row.competency} className={rowFlag ? 'bg-red-50' : 'hover:bg-slate-50'}>
                        <td className="px-4 py-2 border border-slate-200 font-medium">{row.competency}</td>
                        <td className="px-4 py-2 border border-slate-200 text-center text-muted">{row.student_count}</td>
                        <td className="px-4 py-2 border border-slate-200 text-center">{row.avg_performance}</td>
                        <td className={`px-4 py-2 border border-slate-200 text-center ${flagGrowth ? 'text-red-600 font-semibold' : 'text-ink'}`}>
                          {row.avg_growth}{flagGrowth ? ' ↓' : ''}
                        </td>
                        <td className={`px-4 py-2 border border-slate-200 text-center ${flagProgress ? 'text-red-600 font-semibold' : 'text-ink'}`}>
                          {row.avg_progress}%{flagProgress ? ' ⚠' : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {missedErs.error ? (
              <SectionError message={missedErs.error} />
            ) : missedErRows.length > 0 ? (
              <div>
                <h3 className="text-sm font-medium text-red-700 mb-2">Students with &gt;1 Missed ER</h3>
                <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-red-50 text-left">
                        <th className="px-4 py-2 font-medium text-muted border border-slate-200">Student</th>
                        <th className="px-4 py-2 font-medium text-muted border border-slate-200">Competency</th>
                        <th className="px-4 py-2 font-medium text-muted border border-slate-200 text-center">Missed ER</th>
                      </tr>
                    </thead>
                    <tbody>
                      {missedErRows.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-2 border border-slate-200">{row.student_name}</td>
                          <td className="px-4 py-2 border border-slate-200">{row.competency}</td>
                          <td className="px-4 py-2 border border-slate-200 text-center text-red-600 font-semibold">{Number(row.missed_er)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
