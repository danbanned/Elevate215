import { prisma } from '@lp-ai/db';
import { getSheetRows } from './sheets-client.js';
import {
  EXPECTED_STUDENTS_HEADERS,
  parseStudentRow,
  parseCertificationRow,
  parseOutcomesRow,
} from './parse.js';
import { HeaderMismatchError } from './errors.js';

function checkHeaders(live: string[]): void {
  for (let i = 0; i < EXPECTED_STUDENTS_HEADERS.length; i++) {
    const expected = EXPECTED_STUDENTS_HEADERS[i]?.trim() ?? '';
    const actual = live[i]?.trim() ?? '';
    if (expected !== actual) {
      throw new HeaderMismatchError(
        `col ${i + 1}: expected "${expected}", got "${actual}"`,
      );
    }
  }
}

function toDate(yyyymmdd: string | null): Date | null {
  return yyyymmdd ? new Date(`${yyyymmdd}T00:00:00Z`) : null;
}

export async function syncStudents(): Promise<number> {
  const sheetId = process.env['GOOGLE_SHEETS_STUDENT_INFO_ID'];
  if (!sheetId) throw new Error('GOOGLE_SHEETS_STUDENT_INFO_ID not set');

  const headerRow = await getSheetRows(sheetId, 'Students!A1:AL1');
  checkHeaders(headerRow[0] ?? []);

  const dataRows = await getSheetRows(sheetId, 'Students!A2:AL');
  let synced = 0;

  for (const raw of dataRows) {
    const parsed = parseStudentRow(raw);
    if (!parsed) continue;

    const data = {
      canonicalName: parsed.canonicalName,
      enrollmentStatus: parsed.enrollmentStatus,
      currentPhase: parsed.currentPhase,
      launchpadEmail: parsed.launchpadEmail,
      gender: parsed.gender,
      raceEthnicity: parsed.raceEthnicity,
      schoolName: parsed.schoolName,
      hsGraduationYear: parsed.hsGraduationYear,
      entryDate: toDate(parsed.entryDate),
      withdrawalDate: toDate(parsed.withdrawalDate),
      withdrawalCode: parsed.withdrawalCode,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      interviewScore: parsed.interviewScore,
      techInterestOnboarding: parsed.techInterestOnboarding,
      interviewPassionScore: parsed.interviewPassionScore,
      interviewCollegeScore: parsed.interviewCollegeScore,
      hsGpa: parsed.hsGpa,
      algebra1Grade: parsed.algebra1Grade,
      geometryGrade: parsed.geometryGrade,
      collegeEnroll: parsed.collegeEnroll,
      university: parsed.university,
      major: parsed.major,
      workforceProgramReferral: parsed.workforceProgramReferral,
      workforceReferralStatus: parsed.workforceReferralStatus,
      internshipStatus: parsed.internshipStatus,
      income: parsed.income,
      parentalEd: parsed.parentalEd,
    };

    await prisma.student.upsert({
      where: { studentNumber: parsed.studentNumber },
      create: { studentNumber: parsed.studentNumber, ...data },
      update: data,
    });

    synced += 1;
  }

  return synced;
}

export async function syncOutcomes(): Promise<number> {
  const sheetId = process.env['GOOGLE_SHEETS_STUDENT_INFO_ID'];
  if (!sheetId) throw new Error('GOOGLE_SHEETS_STUDENT_INFO_ID not set');

  const dataRows = await getSheetRows(sheetId, 'Outcomes!A2:O');
  let synced = 0;

  for (let i = 0; i < dataRows.length; i += 1) {
    const raw = dataRows[i];
    if (!raw) continue;
    const parsed = parseOutcomesRow(raw);
    if (!parsed) continue;

    const student = await prisma.student.findUnique({
      where: { studentNumber: parsed.studentNumber },
      select: { id: true },
    });
    if (!student) {
      console.warn(`syncOutcomes: student ${parsed.studentNumber} not found, skipping row ${i + 2}`);
      continue;
    }

    const data = {
      foundationsStatus: parsed.foundationsStatus,
      foundationsStartDate: toDate(parsed.foundationsStartDate),
      foundationsEndDate: toDate(parsed.foundationsEndDate),
      phase101Status: parsed.phase101Status,
      phase101StartDate: toDate(parsed.phase101StartDate),
      phase101EndDate: toDate(parsed.phase101EndDate),
      lightspeedStatus: parsed.lightspeedStatus,
      lightspeedStartDate: toDate(parsed.lightspeedStartDate),
      lightspeedEndDate: toDate(parsed.lightspeedEndDate),
      liftoffStatus: parsed.liftoffStatus,
      liftoffStartDate: toDate(parsed.liftoffStartDate),
      liftoffEndDate: toDate(parsed.liftoffEndDate),
    };

    await prisma.studentPhaseOutcome.upsert({
      where: { studentId: student.id },
      create: { studentId: student.id, ...data },
      update: data,
    });

    synced += 1;
  }

  return synced;
}

export async function syncCertifications(): Promise<number> {
  const sheetId = process.env['GOOGLE_SHEETS_STUDENT_INFO_ID'];
  if (!sheetId) throw new Error('GOOGLE_SHEETS_STUDENT_INFO_ID not set');

  const dataRows = await getSheetRows(sheetId, 'Certifications!A2:H');
  let synced = 0;

  for (let i = 0; i < dataRows.length; i += 1) {
    const raw = dataRows[i];
    if (!raw) continue;
    const parsed = parseCertificationRow(raw);
    if (!parsed) continue;

    const student = await prisma.student.findUnique({
      where: { studentNumber: parsed.studentNumber },
      select: { id: true },
    });
    if (!student) {
      console.warn(`syncCertifications: student ${parsed.studentNumber} not found, skipping row ${i + 2}`);
      continue;
    }

    const data = {
      studentId: student.id,
      type: parsed.type,
      date: parsed.date,
      result: parsed.result,
      score: parsed.score,
      phase: parsed.phase,
    };

    await prisma.studentCertification.upsert({
      where: { sourceId: parsed.sourceId },
      create: { sourceId: parsed.sourceId, ...data },
      update: data,
    });

    synced += 1;
  }

  return synced;
}
