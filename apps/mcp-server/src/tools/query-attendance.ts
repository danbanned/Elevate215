import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/db';
import type { Prisma } from '@lp-ai/db';

import { runTool } from '../tool-helpers.js';

const NAME = 'query_attendance';

const DESCRIPTION =
  'Query Launchpad student attendance from the three cohort sheets (Cohort 1 / 2 / 3). Use for per-student attendance rates, aggregate rates by phase / race / cohort / school / etc., or raw event drill-downs over a date range. Cohorts are loose Launchpad groupings (students may move between them as they accelerate); rates blend cohort 1 (already-aggregated weekly %), cohort 2 (daily P/A/E codes), and cohort 3 (weekly check-in/out logs with codes). Excused absences are excluded from rate calculations.';

const inputSchema = {
  query_type: z.enum(['by_student', 'aggregate', 'events']),
  student_number: z
    .string()
    .optional()
    .describe('LP#### (joins students.student_id).'),
  cohort: z
    .number()
    .optional()
    .describe('Restrict to one cohort (1, 2, or 3). Default: all three.'),
  current_phase: z.string().optional(),
  race: z.string().optional(),
  gender: z.string().optional(),
  school: z.string().optional().describe('Partial match.'),
  enrollment_status: z.string().optional(),
  graduation_year: z.number().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  group_by: z
    .enum([
      'cohort',
      'current_phase',
      'race',
      'gender',
      'school',
      'enrollment_status',
      'graduation_year',
    ])
    .optional(),
  limit: z.number().optional(),
};

function buildWhere(input: Record<string, unknown>): Prisma.AttendanceRecordWhereInput {
  const where: Prisma.AttendanceRecordWhereInput = {};
  const studentNumber =
    typeof input['student_number'] === 'string' ? input['student_number'] : undefined;
  const cohort = typeof input['cohort'] === 'number' ? input['cohort'] : undefined;
  const currentPhase =
    typeof input['current_phase'] === 'string' ? input['current_phase'] : undefined;
  const enrollmentStatus =
    typeof input['enrollment_status'] === 'string'
      ? input['enrollment_status']
      : undefined;
  const startDate =
    typeof input['start_date'] === 'string' ? input['start_date'] : undefined;
  const endDate =
    typeof input['end_date'] === 'string' ? input['end_date'] : undefined;

  const studentFilter: Prisma.StudentWhereInput = {};
  if (studentNumber) studentFilter.studentNumber = studentNumber;
  if (currentPhase) studentFilter.currentPhase = currentPhase;
  if (enrollmentStatus) studentFilter.enrollmentStatus = enrollmentStatus;
  if (Object.keys(studentFilter).length > 0) where.student = studentFilter;

  if (cohort !== undefined) where.cohort = String(cohort);
  if (startDate || endDate) {
    where.attendanceDate = {};
    if (startDate) where.attendanceDate.gte = startDate;
    if (endDate) where.attendanceDate.lte = endDate;
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
  cohort: string,
  code: string | null,
  percentage: number | null,
): void {
  if (cohort === '1' && percentage !== null) {
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
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const queryType = String(raw['query_type'] ?? 'aggregate');
      const where = buildWhere(raw);

      if (queryType === 'events') {
        const limit = Math.min(
          typeof raw['limit'] === 'number' ? (raw['limit'] as number) : 200,
          500,
        );
        const [totalMatched, rows] = await Promise.all([
          prisma.attendanceRecord.count({ where }),
          prisma.attendanceRecord.findMany({
            where,
            include: {
              student: {
                select: {
                  canonicalName: true,
                  studentNumber: true,
                  currentPhase: true,
                },
              },
            },
            orderBy: [{ attendanceDate: 'desc' }],
            take: limit,
          }),
        ]);
        return {
          query_type: 'events',
          total_rows_matched: totalMatched,
          records_returned: rows.length,
          truncated: rows.length < totalMatched,
          records: rows.map((r) => ({
            id: r.id,
            cohort: Number(r.cohort),
            student_number: r.student.studentNumber,
            student_name: r.student.canonicalName,
            current_phase: r.student.currentPhase,
            date: r.attendanceDate,
            code: r.code,
            percentage: r.percentage,
            row_data: r.rowData,
          })),
        };
      }

      const rows = await prisma.attendanceRecord.findMany({
        where,
        select: {
          studentId: true,
          cohort: true,
          code: true,
          percentage: true,
          student: {
            select: {
              canonicalName: true,
              studentNumber: true,
              currentPhase: true,
              cohort: true,
              enrollmentStatus: true,
            },
          },
        },
      });

      if (queryType === 'by_student') {
        type StudentRow = (typeof rows)[number]['student'];
        const perStudent = new Map<
          string,
          {
            totals: AttendanceTotals;
            cohorts: Set<number>;
            student: StudentRow;
          }
        >();
        for (const r of rows) {
          let entry = perStudent.get(r.studentId);
          if (!entry) {
            entry = { totals: emptyTotals(), cohorts: new Set(), student: r.student };
            perStudent.set(r.studentId, entry);
          }
          addRow(entry.totals, r.cohort, r.code, r.percentage);
          const n = Number(r.cohort);
          if (Number.isFinite(n)) entry.cohorts.add(n);
        }
        return {
          query_type: 'by_student',
          total_students: perStudent.size,
          students: Array.from(perStudent.values()).map((e) => ({
            student_number: e.student.studentNumber,
            canonical_name: e.student.canonicalName,
            current_phase: e.student.currentPhase,
            cohorts: Array.from(e.cohorts).sort(),
            attendance_rate_pct: rate(e.totals),
            rows_counted:
              e.totals.present +
              e.totals.absent +
              e.totals.excused +
              e.totals.cohort1Count,
            present: e.totals.present,
            absent: e.totals.absent,
            excused: e.totals.excused,
          })),
        };
      }

      const groupBy = String(raw['group_by'] ?? 'cohort');
      const groups = new Map<
        string,
        { totals: AttendanceTotals; students: Set<string> }
      >();
      for (const r of rows) {
        const key =
          groupBy === 'cohort'
            ? `cohort_${r.cohort}`
            : groupBy === 'current_phase'
              ? (r.student.currentPhase ?? 'unknown')
              : groupBy === 'enrollment_status'
                ? (r.student.enrollmentStatus ?? 'unknown')
                : 'overall';
        let entry = groups.get(key);
        if (!entry) {
          entry = { totals: emptyTotals(), students: new Set() };
          groups.set(key, entry);
        }
        addRow(entry.totals, r.cohort, r.code, r.percentage);
        entry.students.add(r.studentId);
      }

      const overallTotals = emptyTotals();
      const overallStudents = new Set<string>();
      for (const r of rows) {
        addRow(overallTotals, r.cohort, r.code, r.percentage);
        overallStudents.add(r.studentId);
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
            e.totals.present +
            e.totals.absent +
            e.totals.excused +
            e.totals.cohort1Count,
          present: e.totals.present,
          absent: e.totals.absent,
          excused: e.totals.excused,
        })),
      };
    }),
  );
}
