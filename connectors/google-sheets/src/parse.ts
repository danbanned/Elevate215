export const EXPECTED_STUDENTS_HEADERS = [
  'StudentID',
  'firstName',
  'lastName',
  'studentName',
  'status',
  'gradeLevel',
  'dob',
  'gender',
  'raceEthnicity',
  'schoolName',
  'hsGraduationYear',
  'hasDisability',
  'iep504',
  'entryDate',
  'withdrawalDate',
  'programWithdrawalCode',
  'launchpadEmail',
  'personalEmail',
  'phone',
  'street',
  'city',
  'state',
  'zip',
  'interviewScore',
  'techInterestOnboarding',
  'interviewPassionScore',
  'interviewCollegeScore',
  'hsGpa',
  'algebra1Grade',
  'geometryGrade',
  'collegeEnroll',
  'university',
  'major',
  'workforceProgramReferral',
  'workforceReferralStatus',
  'internshipStatus',
  'householdIncome',
  'parentalEducation',
] as const;

function str(v: string | undefined): string | null {
  const s = v?.trim();
  return s === '' || s === undefined ? null : s;
}

function parseDate(v: string | undefined): string | null {
  const s = v?.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split('/');
  if (parts.length === 3) {
    const [m, d, y] = parts;
    return `${y}-${(m ?? '').padStart(2, '0')}-${(d ?? '').padStart(2, '0')}`;
  }
  return null;
}

function parseNum(v: string | undefined): string | null {
  const s = v?.trim().replace(/,/g, '').replace(/%$/, '');
  return s !== undefined && s !== '' && !isNaN(Number(s)) ? s : null;
}

function parseInt2(v: string | undefined): number | null {
  const n = parseInt(v?.trim() ?? '', 10);
  return isNaN(n) ? null : n;
}

export type StudentRow = {
  studentNumber: string;
  canonicalName: string;
  enrollmentStatus: string | null;
  currentPhase: string | null;
  launchpadEmail: string | null;
  gender: string | null;
  raceEthnicity: string | null;
  schoolName: string | null;
  hsGraduationYear: number | null;
  entryDate: string | null;
  withdrawalDate: string | null;
  withdrawalCode: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  interviewScore: string | null;
  techInterestOnboarding: number | null;
  interviewPassionScore: number | null;
  interviewCollegeScore: number | null;
  hsGpa: string | null;
  algebra1Grade: string | null;
  geometryGrade: string | null;
  collegeEnroll: string | null;
  university: string | null;
  major: string | null;
  workforceProgramReferral: string | null;
  workforceReferralStatus: string | null;
  internshipStatus: string | null;
  income: string | null;
  parentalEd: string | null;
};

export type CertificationRow = {
  sourceId: string;
  studentNumber: string;
  type: string;
  date: string | null;
  result: string;
  score: string | null;
  phase: string;
};

export function parseCertificationRow(raw: string[]): CertificationRow | null {
  const sourceId = raw[0]?.trim();
  const studentNumber = raw[1]?.trim();
  const type = raw[3]?.trim();
  const result = raw[5]?.trim();
  const phase = raw[7]?.trim();
  if (!sourceId || !studentNumber || !type || !result || !phase) return null;

  return {
    sourceId,
    studentNumber,
    type,
    date: str(raw[4]),
    result,
    score: parseNum(raw[6]),
    phase,
  };
}

export type OutcomesRow = {
  studentNumber: string;
  foundationsStatus: string | null;
  foundationsStartDate: string | null;
  foundationsEndDate: string | null;
  phase101Status: string | null;
  phase101StartDate: string | null;
  phase101EndDate: string | null;
  lightspeedStatus: string | null;
  lightspeedStartDate: string | null;
  lightspeedEndDate: string | null;
  liftoffStatus: string | null;
  liftoffStartDate: string | null;
  liftoffEndDate: string | null;
};

export function parseOutcomesRow(raw: string[]): OutcomesRow | null {
  const studentNumber = raw[0]?.trim();
  if (!studentNumber) return null;

  return {
    studentNumber,
    foundationsStatus: str(raw[3]),
    foundationsStartDate: parseDate(raw[4]),
    foundationsEndDate: parseDate(raw[5]),
    phase101Status: str(raw[6]),
    phase101StartDate: parseDate(raw[7]),
    phase101EndDate: parseDate(raw[8]),
    lightspeedStatus: str(raw[9]),
    lightspeedStartDate: parseDate(raw[10]),
    lightspeedEndDate: parseDate(raw[11]),
    liftoffStatus: str(raw[12]),
    liftoffStartDate: parseDate(raw[13]),
    liftoffEndDate: parseDate(raw[14]),
  };
}

export function parseStudentRow(raw: string[]): StudentRow | null {
  const get = (i: number) => raw[i]?.trim();
  const studentNumber = get(0);
  if (!studentNumber) return null;

  const firstName = get(1) ?? '';
  const lastName = get(2) ?? '';

  return {
    studentNumber,
    canonicalName: `${firstName} ${lastName}`.trim(),
    enrollmentStatus: str(get(4)),
    currentPhase: str(get(5)),
    gender: str(get(7)),
    raceEthnicity: str(get(8)),
    schoolName: str(get(9)),
    hsGraduationYear: parseInt2(get(10)),
    entryDate: parseDate(get(13)),
    withdrawalDate: parseDate(get(14)),
    withdrawalCode: str(get(15)),
    launchpadEmail: str(get(16)),
    city: str(get(20)),
    state: str(get(21)),
    zip: str(get(22)),
    interviewScore: parseNum(get(23)),
    techInterestOnboarding: parseInt2(get(24)),
    interviewPassionScore: parseInt2(get(25)),
    interviewCollegeScore: parseInt2(get(26)),
    hsGpa: parseNum(get(27)),
    algebra1Grade: str(get(28)),
    geometryGrade: str(get(29)),
    collegeEnroll: str(get(30)),
    university: str(get(31)),
    major: str(get(32)),
    workforceProgramReferral: str(get(33)),
    workforceReferralStatus: str(get(34)),
    internshipStatus: str(get(35)),
    income: str(get(36)),
    parentalEd: str(get(37)),
  };
}
