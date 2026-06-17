import { prisma } from '@lp-ai/lib-db';
import { getSheetRows } from './sheets-client.js';
import { parsePostsecondaryRow } from './parse.js';

// ---------------------------------------------------------------------------
// PostSecondary tab (Student Information V2)
//
// One row per (student x institution x enrollment span). Tracks college /
// university enrollment + degree completion for alumni outcomes reporting.
// Data shape matches the National Student Clearinghouse export — see
// POSTSECONDARY_ENROLLMENT_STATUS_LABELS and POSTSECONDARY_CLASS_LEVEL_LABELS
// in parse.ts for the single-letter code -> display string mappings.
//
// source_id uses a stable composite natural key:
//   postsecondary:<studentNumber>:<institution>:<enrollmentBegin>
// so that row reordering in the sheet does not create orphans.
//
// Upsert + stale cleanup: rows are upserted, then any sourceIds NOT seen in
// this run are deleted. If the sync crashes midway, existing data survives.
// ---------------------------------------------------------------------------

const EXPECTED_HEADERS = [
  'Student Number',
  'First Name',
  'Last Name',
  'College/University',
  '2-year / 4-year',
  'Public / Private',
  'Enrollment Begin',
  'Enrollment End',
  'Enrollment Status',
  'Class Level',
  'Enrollment Major 1',
  'Enrollment Major 2',
  'Graduated?',
  'Graduation Date',
  'Degree Title',
  'Degree Major 1',
  'Degree Major 2',
  'Degree Major 3',
] as const;

export class PostsecondaryHeaderMismatchError extends Error {
  constructor(public detail: string) {
    super(`postsecondary_header_mismatch: ${detail}`);
  }
}

function checkHeaders(live: string[]): void {
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    const expected = EXPECTED_HEADERS[i]?.trim() ?? '';
    const actual = live[i]?.trim() ?? '';
    if (expected !== actual) {
      throw new PostsecondaryHeaderMismatchError(
        `col ${i + 1}: expected "${expected}", got "${actual}"`,
      );
    }
  }
}

function toDate(yyyymmdd: string | null): Date | null {
  return yyyymmdd ? new Date(`${yyyymmdd}T00:00:00Z`) : null;
}

function stableSourceId(studentNumber: string, institution: string | null, enrollmentBegin: string | null, enrollmentEnd: string | null): string {
  const inst = (institution ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  const begin = enrollmentBegin ?? 'nodate';
  const end = enrollmentEnd ?? 'nodate';
  return `postsecondary:${studentNumber}:${inst}:${begin}:${end}`;
}

export async function syncPostsecondary(): Promise<number> {
  const sheetId = process.env['GOOGLE_SHEETS_STUDENT_INFO_V2'];
  if (!sheetId) throw new Error('GOOGLE_SHEETS_STUDENT_INFO_V2 not set');

  let rows: string[][];
  try {
    console.log('\n  fetching postsecondary tab from student info v2...');
    rows = await getSheetRows(sheetId, 'PostSecondary!A1:R');
  } catch (err) {
    console.warn(`  skipping postsecondary: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }

  if (rows.length < 1) {
    console.warn('  skipping postsecondary: empty tab');
    return 0;
  }

  checkHeaders(rows[0] ?? []);

  let synced = 0;
  let skippedBlank = 0;
  let skippedNoStudent = 0;
  let skippedRowErrors = 0;
  const skippedInstitutions: string[] = [];
  const seenSourceIds = new Set<string>();
  // Track occurrence count per base key to disambiguate duplicate combos
  const keyOccurrences = new Map<string, number>();

  for (let i = 1; i < rows.length; i += 1) {
    const raw = rows[i];
    if (!raw || raw.every((c) => !c?.trim())) {
      skippedBlank += 1;
      continue;
    }

    const parsed = parsePostsecondaryRow(raw);
    if (!parsed) {
      skippedNoStudent += 1;
      const institution = raw[3]?.trim();
      if (institution && skippedInstitutions.length < 50) {
        skippedInstitutions.push(`row ${i + 1}: "${institution}"`);
      }
      continue;
    }

    const baseKey = stableSourceId(parsed.studentNumber, parsed.institution, parsed.enrollmentBegin, parsed.enrollmentEnd);
    const occ = (keyOccurrences.get(baseKey) ?? 0) + 1;
    keyOccurrences.set(baseKey, occ);
    const sourceId = occ === 1 ? baseKey : `${baseKey}:${occ}`;
    seenSourceIds.add(sourceId);

    const data = {
      studentNumber:     parsed.studentNumber,
      firstName:         parsed.firstName,
      lastName:          parsed.lastName,
      institution:       parsed.institution,
      institutionLength: parsed.institutionLength,
      institutionType:   parsed.institutionType,
      enrollmentBegin:   toDate(parsed.enrollmentBegin),
      enrollmentEnd:     toDate(parsed.enrollmentEnd),
      enrollmentStatus:  parsed.enrollmentStatus,
      classLevel:        parsed.classLevel,
      enrollmentMajor1:  parsed.enrollmentMajor1,
      enrollmentMajor2:  parsed.enrollmentMajor2,
      graduated:         parsed.graduated,
      graduationDate:    toDate(parsed.graduationDate),
      degreeTitle:       parsed.degreeTitle,
      degreeMajor1:      parsed.degreeMajor1,
      degreeMajor2:      parsed.degreeMajor2,
      degreeMajor3:      parsed.degreeMajor3,
    };

    try {
      await prisma.studentPostsecondary.upsert({
        where: { sourceId },
        create: { sourceId, ...data },
        update: data,
      });
      synced += 1;
    } catch (err) {
      const institution = parsed.institution ?? '(unknown)';
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `  student_postsecondary: row ${i + 1} (${parsed.studentNumber} @ "${institution}") FAILED — ${msg}`,
      );
      skippedRowErrors += 1;
    }
  }

  // Remove rows whose sourceId was not seen (genuinely removed from sheet)
  if (seenSourceIds.size > 0) {
    const deleted = await prisma.studentPostsecondary.deleteMany({
      where: { sourceId: { notIn: [...seenSourceIds] } },
    });
    if (deleted.count > 0) {
      console.log(`  student_postsecondary: removed ${deleted.count} stale rows`);
    }
  }

  console.log(`  student_postsecondary: ${synced} rows synced`);
  if (skippedBlank > 0) {
    console.log(`  student_postsecondary: ${skippedBlank} blank rows skipped`);
  }
  if (skippedNoStudent > 0) {
    console.log(`  student_postsecondary: ${skippedNoStudent} rows skipped (no student_number in col A)`);
    if (skippedInstitutions.length > 0) {
      console.log(`  student_postsecondary: examples — ${skippedInstitutions.join('; ')}`);
    }
  }
  if (skippedRowErrors > 0) {
    console.log(`  student_postsecondary: ${skippedRowErrors} rows skipped due to per-row insert errors (see warnings above)`);
  }
  return synced;
}
