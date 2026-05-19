import { prisma } from './index.js';
import { linkAlias } from './entity-resolution.js';

interface SeedStudent {
  studentNumber: string;
  canonicalName: string;
  email: string;
  currentPhase: string;
  enrollmentStatus: string;
  cohort: string;
  neighborhood: string;
  aliases: Array<{ alias: string; source: string }>;
  certifications: Array<{
    certName: string;
    result: 'Pass' | 'Fail';
    score: number;
    phase: string;
    issuedDate: string;
  }>;
  competencies: Array<{
    competencyArea: string;
    skillName: string;
    score: number;
    rubricLevel: string;
    assessedDate: string;
    term: string;
  }>;
  attendance: Array<{
    cohort: string;
    code: 'P' | 'A' | 'E';
    attendanceDate: string;
  }>;
  phaseOutcomes: Array<{
    phase: string;
    outcome: string;
    startDate: string;
    endDate: string | null;
  }>;
}

const STUDENTS: SeedStudent[] = [
  {
    studentNumber: 'LP1042',
    canonicalName: 'Maria Garcia',
    email: 'maria.garcia@example.org',
    currentPhase: '101',
    enrollmentStatus: 'E',
    cohort: '2',
    neighborhood: 'Kensington',
    aliases: [
      { alias: 'Maria Garcia', source: 'drive' },
      { alias: 'Maria G.', source: 'drive' },
      { alias: '@maria.g', source: 'slack' },
      { alias: 'LP1042', source: 'bigquery' },
    ],
    certifications: [
      { certName: 'PCEP', result: 'Pass', score: 92, phase: '101', issuedDate: '2026-03-15' },
    ],
    competencies: [
      {
        competencyArea: 'Critical Thinking',
        skillName: 'Identify problem',
        score: 3.5,
        rubricLevel: 'Proficient',
        assessedDate: '2026-04-01',
        term: 'Spring 2026',
      },
      {
        competencyArea: 'Communication',
        skillName: 'Active listening',
        score: 3.0,
        rubricLevel: 'Developing',
        assessedDate: '2026-04-01',
        term: 'Spring 2026',
      },
    ],
    attendance: buildWeeklyAttendance('2', '2026-04', 18, 2, 1),
    phaseOutcomes: [
      {
        phase: 'Foundations',
        outcome: 'Completed',
        startDate: '2025-09-02',
        endDate: '2025-12-19',
      },
      { phase: '101', outcome: 'In Progress', startDate: '2026-01-13', endDate: null },
    ],
  },
  {
    studentNumber: 'LP1051',
    canonicalName: 'Tai Pham',
    email: 'tai.pham@example.org',
    currentPhase: 'Foundations',
    enrollmentStatus: 'E',
    cohort: '3',
    neighborhood: 'Olney',
    aliases: [
      { alias: 'Tai Pham', source: 'drive' },
      { alias: '@tai.p', source: 'slack' },
      { alias: 'LP1051', source: 'bigquery' },
    ],
    certifications: [
      { certName: 'PCEP', result: 'Fail', score: 62, phase: 'Foundations', issuedDate: '2026-02-10' },
    ],
    competencies: [
      {
        competencyArea: 'Coding',
        skillName: 'Loops & conditionals',
        score: 2.5,
        rubricLevel: 'Developing',
        assessedDate: '2026-03-15',
        term: 'Spring 2026',
      },
    ],
    attendance: buildWeeklyAttendance('3', '2026-04', 16, 3, 1),
    phaseOutcomes: [
      {
        phase: 'Foundations',
        outcome: 'In Progress',
        startDate: '2026-01-13',
        endDate: null,
      },
    ],
  },
  {
    studentNumber: 'LP1078',
    canonicalName: 'Janelle Brooks',
    email: 'janelle.brooks@example.org',
    currentPhase: 'LiftOff',
    enrollmentStatus: 'E',
    cohort: '1',
    neighborhood: 'West Philly',
    aliases: [
      { alias: 'Janelle Brooks', source: 'drive' },
      { alias: 'Jay Brooks', source: 'drive' },
      { alias: '@janelle', source: 'slack' },
      { alias: 'LP1078', source: 'bigquery' },
    ],
    certifications: [
      { certName: 'PCEP', result: 'Pass', score: 88, phase: '101', issuedDate: '2025-11-20' },
    ],
    competencies: [
      {
        competencyArea: 'Critical Thinking',
        skillName: 'Synthesize sources',
        score: 4.0,
        rubricLevel: 'Advanced',
        assessedDate: '2026-04-20',
        term: 'Spring 2026',
      },
    ],
    attendance: buildCohort1Percentages('2026-04', [88, 92, 75, 95]),
    phaseOutcomes: [
      {
        phase: 'Foundations',
        outcome: 'Completed',
        startDate: '2024-09-02',
        endDate: '2024-12-19',
      },
      {
        phase: '101',
        outcome: 'Completed',
        startDate: '2025-01-13',
        endDate: '2025-05-30',
      },
      {
        phase: 'LiftOff',
        outcome: 'In Progress',
        startDate: '2025-09-08',
        endDate: null,
      },
    ],
  },
];

function buildWeeklyAttendance(
  cohort: string,
  startYearMonth: string,
  present: number,
  absent: number,
  excused: number,
): SeedStudent['attendance'] {
  const events: SeedStudent['attendance'] = [];
  let day = 1;
  const push = (code: 'P' | 'A' | 'E', count: number): void => {
    for (let i = 0; i < count; i += 1) {
      const dd = String(day).padStart(2, '0');
      events.push({ cohort, code, attendanceDate: `${startYearMonth}-${dd}` });
      day += 1;
    }
  };
  push('P', present);
  push('A', absent);
  push('E', excused);
  return events;
}

function buildCohort1Percentages(
  startYearMonth: string,
  percentages: number[],
): SeedStudent['attendance'] {
  return percentages.map((pct, i) => ({
    cohort: '1',
    code: 'P' as const,
    attendanceDate: `${startYearMonth}-${String((i + 1) * 7).padStart(2, '0')}`,
    percentageOverride: pct,
  })) as SeedStudent['attendance'];
}

const DONORS = [
  {
    organizationName: 'William Penn Foundation',
    email: 'grants@williampennfoundation.org',
    gifts: [
      { amount: 250000, giftDate: '2026-01-15', fund: 'Launchpad General', campaignName: 'Annual Grant', isRecurring: false },
    ],
    pipeline: [{ stage: 'Cultivation', askAmount: 500000, likelihood: 'Medium', notes: 'Q4 ask' }],
  },
  {
    firstName: 'Christian',
    lastName: 'Anonymous',
    email: 'christian@example.org',
    gifts: [
      { amount: 5000, giftDate: '2026-03-01', fund: 'Launchpad General', campaignName: 'Spring Appeal', isRecurring: false },
      { amount: 100, giftDate: '2026-04-01', fund: 'Launchpad General', campaignName: 'Monthly Sustainer', isRecurring: true },
    ],
    pipeline: [],
  },
];

const FINANCE = [
  { tab: 'fund_balances', category: 'Launchpad General', amount: 1240000, period: '2026-Q1', fundOrPhase: 'Launchpad' },
  { tab: 'fund_balances', category: 'LiftOff', amount: 380000, period: '2026-Q1', fundOrPhase: 'LiftOff' },
  { tab: 'ytd', category: 'Salaries', amount: -540000, period: '2026 YTD', fundOrPhase: 'Launchpad' },
  { tab: 'ytd', category: 'Stipends', amount: -94000, period: '2026 YTD', fundOrPhase: 'Launchpad' },
];

export async function seed(): Promise<{ studentsInserted: number; donorsInserted: number }> {
  await prisma.attendanceRecord.deleteMany();
  await prisma.studentCertification.deleteMany();
  await prisma.studentCompetency.deleteMany();
  await prisma.studentPhaseOutcome.deleteMany();
  await prisma.studentInfo.deleteMany();
  await prisma.entityAlias.deleteMany();
  await prisma.student.deleteMany();
  await prisma.donorGift.deleteMany();
  await prisma.donorPipeline.deleteMany();
  await prisma.donorContact.deleteMany();
  await prisma.financeSnapshot.deleteMany();

  for (const s of STUDENTS) {
    const student = await prisma.student.create({
      data: {
        studentNumber: s.studentNumber,
        canonicalName: s.canonicalName,
        email: s.email,
        currentPhase: s.currentPhase,
        enrollmentStatus: s.enrollmentStatus,
        cohort: s.cohort,
        neighborhood: s.neighborhood,
      },
    });
    for (const a of s.aliases) {
      await linkAlias({
        alias: a.alias,
        entityType: 'student',
        entityId: student.id,
        source: a.source,
      });
    }
    for (const c of s.certifications) {
      await prisma.studentCertification.create({
        data: { ...c, studentId: student.id, status: c.result },
      });
    }
    for (const c of s.competencies) {
      await prisma.studentCompetency.create({
        data: { ...c, studentId: student.id },
      });
    }
    for (const a of s.attendance) {
      const override = (a as unknown as { percentageOverride?: number }).percentageOverride;
      await prisma.attendanceRecord.create({
        data: {
          studentId: student.id,
          cohort: a.cohort,
          code: a.code,
          attendanceDate: a.attendanceDate,
          percentage: override ?? null,
        },
      });
    }
    for (const p of s.phaseOutcomes) {
      await prisma.studentPhaseOutcome.create({
        data: { ...p, studentId: student.id },
      });
    }
  }

  for (const d of DONORS) {
    const donor = await prisma.donorContact.create({
      data: {
        firstName: d.firstName ?? null,
        lastName: d.lastName ?? null,
        organizationName: d.organizationName ?? null,
        email: d.email,
      },
    });
    for (const g of d.gifts) {
      await prisma.donorGift.create({
        data: { ...g, donorContactId: donor.id },
      });
    }
    for (const p of d.pipeline) {
      await prisma.donorPipeline.create({
        data: { ...p, donorContactId: donor.id },
      });
    }
  }

  for (const f of FINANCE) {
    await prisma.financeSnapshot.create({ data: f });
  }

  return { studentsInserted: STUDENTS.length, donorsInserted: DONORS.length };
}

