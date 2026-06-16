import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/lib-db';
import type { Prisma } from '@lp-ai/lib-db';

import { runTool, parseStr, parseNum } from '../tool-helpers.js';

const NAME = 'query_attendance';

const DESCRIPTION =
  'Query Launchpad student attendance from the three cohort sheets (Cohort 1 / 2 / 3). Use for per-student attendance rates, aggregate rates by phase / race / cohort / school / etc., or raw event drill-downs over a date range. Cohorts are loose Launchpad groupings; rates blend cohort 1 (already-aggregated weekly %), cohort 2 (daily P/A/E codes), and cohort 3 (weekly check-in/out logs with codes). Excused absences are excluded from rate calculations.';

const inputSchema = {
  query_type: z.enum(['by_student', 'aggregate', 'events']),
  student_number: z
    .string()
    .optional()
    .describe('LP#### (joins students.student_number).'),
  cohort: z.number().optional().describe('1, 2, or 3.'),
  current_phase: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  group_by: z
    .enum(['cohort', 'current_phase', 'enrollment_status', 'overall'])
    .optional(),
  limit: z.number().optional(),
};

function buildWhere(raw: Record<string, unknown>): Prisma.AttendanceRecordWhereInput {
  const where: Prisma.AttendanceRecordWhereInput = {};
  const studentNumber = parseStr(raw, 'student_number');
  const cohort = parseNum(raw, 'cohort');
  const startDate = parseStr(raw, 'start_date');
  const endDate = parseStr(raw, 'end_date');

  if (studentNumber) where.studentNumber = studentNumber;
  if (cohort !== undefined) where.cohort = cohort;
  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = new Date(startDate);
    if (endDate) where.date.lte = new Date(endDate);
  }
  return where;
}

interface AttendanceTotals {
  present: number;
  absent: number;
  excused: number;
  cohort1Sum: number;
  cohort1Count: number;
}

function emptyTotals(): AttendanceTotals {
  return { present: 0, absent: 0, excused: 0, cohort1Sum: 0, cohort1Count: 0 };
}

function addRow(
  totals: AttendanceTotals,
  cohort: number,
  code: string | null,
  percentage: number | null,
): void {
  if (cohort === 1 && percentage !== null) {
    totals.cohort1Sum += percentage;
    totals.cohort1Count += 1;
    return;
  }
  if (code === 'P') totals.present += 1;
  else if (code === 'A') totals.absent += 1;
  else if (code === 'E') totals.excused += 1;
}

function rate(totals: AttendanceTotals): number | null {
  const codeDenom = totals.present + totals.absent;
  if (codeDenom === 0 && totals.cohort1Count === 0) return null;
  const codeRate = codeDenom > 0 ? (totals.present / codeDenom) * 100 : null;
  const cohort1Rate =
    totals.cohort1Count > 0 ? totals.cohort1Sum / totals.cohort1Count : null;
  const parts = [codeRate, cohort1Rate].filter((p): p is number => p !== null);
  if (parts.length === 0) return null;
  const sum = parts.reduce((a, b) => a + b, 0);
  return Math.round((sum / parts.length) * 10) / 10;
}

export function registerQueryAttendance(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const queryType = parseStr(raw, 'query_type') ?? 'aggregate';
      const where = buildWhere(raw);

      if (queryType === 'events') {
        const limit = Math.min(parseNum(raw, 'limit') ?? 200, 500);
        const [totalMatched, rows] = await Promise.all([
          prisma.attendanceRecord.count({ where }),
          prisma.attendanceRecord.findMany({
            where,
            orderBy: [{ date: 'desc' }],
            take: limit,
          }),
        ]);
        const students = await loadStudents(rows.map((r) => r.studentNumber));
        return {
          query_type: 'events',
          total_rows_matched: totalMatched,
          records_returned: rows.length,
          truncated: rows.length < totalMatched,
          records: rows.map((r) => ({
            id: r.id,
            cohort: r.cohort,
            student_number: r.studentNumber,
            student_name: students.get(r.studentNumber)?.canonicalName ?? null,
            current_phase: students.get(r.studentNumber)?.currentPhase ?? null,
            date: r.date,
            code: r.code,
            percentage: r.percentage,
            row_data: r.rowData,
          })),
        };
      }

      const rows = await prisma.attendanceRecord.findMany({
        where,
        select: {
          cohort: true,
          code: true,
          percentage: true,
          studentNumber: true,
        },
      });
      const students = await loadStudents(rows.map((r) => r.studentNumber));

      if (queryType === 'by_student') {
        const perStudent = new Map<
          string,
          { totals: AttendanceTotals; cohorts: Set<number> }
        >();
        for (const r of rows) {
          let entry = perStudent.get(r.studentNumber);
          if (!entry) {
            entry = { totals: emptyTotals(), cohorts: new Set() };
            perStudent.set(r.studentNumber, entry);
          }
          addRow(entry.totals, r.cohort, r.code, r.percentage ? Number(r.percentage) : null);
          entry.cohorts.add(r.cohort);
        }
        return {
          query_type: 'by_student',
          total_students: perStudent.size,
          students: Array.from(perStudent.entries()).map(([sn, e]) => ({
            student_number: sn,
            canonical_name: students.get(sn)?.canonicalName ?? null,
            current_phase: students.get(sn)?.currentPhase ?? null,
            cohorts: Array.from(e.cohorts).sort(),
            attendance_rate_pct: rate(e.totals),
            rows_counted:
              e.totals.present + e.totals.absent + e.totals.excused + e.totals.cohort1Count,
            present: e.totals.present,
            absent: e.totals.absent,
            excused: e.totals.excused,
          })),
        };
      }

      const groupBy = parseStr(raw, 'group_by') ?? 'cohort';
      const groups = new Map<
        string,
        { totals: AttendanceTotals; students: Set<string> }
      >();
      for (const r of rows) {
        const student = students.get(r.studentNumber);
        const key =
          groupBy === 'cohort'
            ? `cohort_${r.cohort}`
            : groupBy === 'current_phase'
              ? (student?.currentPhase ?? 'unknown')
              : groupBy === 'enrollment_status'
                ? (student?.enrollmentStatus ?? 'unknown')
                : 'overall';
        let entry = groups.get(key);
        if (!entry) {
          entry = { totals: emptyTotals(), students: new Set() };
          groups.set(key, entry);
        }
        addRow(entry.totals, r.cohort, r.code, r.percentage ? Number(r.percentage) : null);
        entry.students.add(r.studentNumber);
      }

      const overallTotals = emptyTotals();
      const overallStudents = new Set<string>();
      for (const r of rows) {
        addRow(overallTotals, r.cohort, r.code, r.percentage ? Number(r.percentage) : null);
        overallStudents.add(r.studentNumber);
      }

      return {
        query_type: 'aggregate',
        group_by: groupBy,
        overall: {
          student_count: overallStudents.size,
          attendance_rate_pct: rate(overallTotals),
          rows_counted:
            overallTotals.present +
            overallTotals.absent +
            overallTotals.excused +
            overallTotals.cohort1Count,
        },
        breakdown: Array.from(groups.entries()).map(([group, e]) => ({
          group,
          student_count: e.students.size,
          attendance_rate_pct: rate(e.totals),
          rows_counted:
            e.totals.present + e.totals.absent + e.totals.excused + e.totals.cohort1Count,
          present: e.totals.present,
          absent: e.totals.absent,
          excused: e.totals.excused,
        })),
      };
    }),
  );
}

async function loadStudents(
  numbers: string[],
): Promise<Map<string, { canonicalName: string; currentPhase: string | null; enrollmentStatus: string | null }>> {
  if (numbers.length === 0) return new Map();
  const uniq = [...new Set(numbers)];
  const students = await prisma.student.findMany({
    where: { studentNumber: { in: uniq } },
    select: {
      studentNumber: true,
      canonicalName: true,
      currentPhase: true,
      enrollmentStatus: true,
    },
  });
  const map = new Map<string, { canonicalName: string; currentPhase: string | null; enrollmentStatus: string | null }>();
  for (const s of students) {
    if (s.studentNumber) {
      map.set(s.studentNumber, {
        canonicalName: s.canonicalName,
        currentPhase: s.currentPhase,
        enrollmentStatus: s.enrollmentStatus,
      });
    }
  }
  return map;
}
