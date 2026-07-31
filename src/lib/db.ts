import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env (see .env.example).",
    );
  }
  return url;
}

declare global {
  // eslint-disable-next-line no-var
  var __elevateSql: NeonQueryFunction<false, false> | undefined;
}

/** Shared Neon SQL client (server-only). Uses DATABASE_URL from .env. */
export const sql: NeonQueryFunction<false, false> =
  globalThis.__elevateSql ?? neon(requireDatabaseUrl());

if (process.env.NODE_ENV !== "production") {
  globalThis.__elevateSql = sql;
}

export type School = {
  id: string;
  aun: string;
  school_id: string;
  district_name: string;
  school_name: string;
  school_type: "District" | "Charter";
  grade_span_2025_26: string | null;
  pct_black_hispanic_2025_26: string | null;
  pct_low_income_2025_26: string | null;
  excluded_selection_criteria: string | null;

  pssa_reading_n_scored_2025: number | null;
  pssa_reading_pct_proficient_2025: string | null;
  pssa_reading_predicted: string | null;
  pssa_reading_residual: string | null;
  pssa_reading_band: string | null;

  pssa_math_n_scored_2025: number | null;
  pssa_math_pct_proficient_2025: string | null;
  pssa_math_predicted: string | null;
  pssa_math_residual: string | null;
  pssa_math_band: string | null;

  keystone_algebra_n_scored_2025: number | null;
  keystone_algebra_pct_proficient_2025: string | null;
  keystone_algebra_predicted: string | null;
  keystone_algebra_residual: string | null;
  keystone_algebra_band: string | null;

  keystone_biology_n_scored_2025: number | null;
  keystone_biology_pct_proficient_2025: string | null;
  keystone_biology_predicted: string | null;
  keystone_biology_residual: string | null;
  keystone_biology_band: string | null;

  keystone_literature_n_scored_2025: number | null;
  keystone_literature_pct_proficient_2025: string | null;
  keystone_literature_predicted: string | null;
  keystone_literature_residual: string | null;
  keystone_literature_band: string | null;

  simple_avg_residual: string | null;
  enrollment_weighted_avg_residual: string | null;
  above_line_count: number | null;
  within_5_count: number | null;
  below_line_count: number | null;
  tests_with_data: number | null;

  current_enrollment_2025_26: number | null;
  authorized_enrollment_cap_2025_26: number | null;
  unused_seats: number | null;
  fill_tier: string | null;

  eapi_tier: string | null;

  created_at: string;
  updated_at: string;
};

export type DbHealth = {
  ok: true;
  database: string;
  schema: string;
  table: "schools";
  columns: number;
  schoolCount: number;
  serverTime: string;
};

/** Verify Neon connectivity and that the schools schema exists. */
export async function checkDbHealth(): Promise<DbHealth> {
  const rows = await sql`
    SELECT
      current_database() AS database,
      current_schema() AS schema,
      (
        SELECT COUNT(*)::int
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'schools'
      ) AS columns,
      (SELECT COUNT(*)::int FROM schools) AS school_count,
      NOW() AS server_time
  `;

  const row = rows[0] as {
    database: string;
    schema: string;
    columns: number;
    school_count: number;
    server_time: string;
  };

  if (!row || row.columns === 0) {
    throw new Error(
      'Table public.schools not found. Run "npm run db:migrate" first.',
    );
  }

  return {
    ok: true,
    database: row.database,
    schema: row.schema,
    table: "schools",
    columns: row.columns,
    schoolCount: row.school_count,
    serverTime: row.server_time,
  };
}

export async function getSchools(limit = 50): Promise<School[]> {
  return (await sql`
    SELECT *
    FROM schools
    ORDER BY district_name, school_name
    LIMIT ${limit}
  `) as School[];
}

export async function getSchoolBySchoolId(
  schoolId: string,
): Promise<School | null> {
  const rows = (await sql`
    SELECT *
    FROM schools
    WHERE school_id = ${schoolId}
    LIMIT 1
  `) as School[];
  return rows[0] ?? null;
}
