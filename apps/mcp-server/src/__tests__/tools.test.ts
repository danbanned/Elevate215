import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma, seed } from '@lp-ai/db';

import { McpStdioClient } from './mcp-client.js';

const isLocalDb = (process.env['DATABASE_URL'] ?? '').includes('localhost');
const describeLocal = isLocalDb ? describe : describe.skip;

describeLocal('MCP tool handlers (integration)', () => {
  let client: McpStdioClient;

  beforeAll(async () => {
    await seed();
    client = new McpStdioClient();
  });

  afterAll(async () => {
    client.close();
    await prisma.$disconnect();
  });

  it('tools/list exposes all 14 tools', async () => {
    const tools = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'get_entity_brief',
        'get_finance_brief',
        'get_student_info',
        'query_attendance',
        'query_certifications',
        'query_competency',
        'query_donors',
        'query_enrollment',
        'query_finances',
        'query_outcomes',
        'query_students',
        'search_by_person',
        'search_conversations',
        'search_documents',
      ].sort(),
    );
  });

  it('get_student_info resolves a Slack handle to canonical record', async () => {
    const result = (await client.callTool('get_student_info', {
      student_name: '@maria.g',
    })) as {
      student: {
        canonical_name: string;
        student_number: string;
        current_phase: string;
        known_aliases: Array<{ source: string; alias: string }>;
      };
      entity_resolved: boolean;
      entity_confidence: number;
      match_type: string;
    };
    expect(result.entity_resolved).toBe(true);
    expect(result.match_type).toBe('exact');
    expect(result.entity_confidence).toBe(1);
    expect(result.student.canonical_name).toBe('Maria Garcia');
    expect(result.student.student_number).toBe('LP1042');
    expect(result.student.current_phase).toBe('101');
    const sources = result.student.known_aliases.map((a) => a.source).sort();
    expect(sources).toEqual(['bigquery', 'drive', 'drive', 'slack']);
  });

  it('get_student_info returns entity_not_found for unknown name', async () => {
    const result = (await client.callTool('get_student_info', {
      student_name: 'Nonexistent Person',
    })) as { error?: { code: string } };
    expect(result.error?.code).toBe('entity_not_found');
  });

  it('query_certifications summary reflects seeded data', async () => {
    const result = (await client.callTool('query_certifications', {
      query_type: 'summary',
    })) as {
      query_type: string;
      total: number;
      passed: number;
      failed: number;
      pass_rate_pct: number | null;
    };
    expect(result.total).toBe(3);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.pass_rate_pct).toBeCloseTo(66.7, 0);
  });

  it('query_certifications by_result groups Pass/Fail counts', async () => {
    const result = (await client.callTool('query_certifications', {
      query_type: 'by_result',
    })) as { breakdown: Array<{ result: string; count: number }> };
    const map = Object.fromEntries(result.breakdown.map((b) => [b.result, b.count]));
    expect(map['Pass']).toBe(2);
    expect(map['Fail']).toBe(1);
  });

  it('query_competency scores returns rows with student names', async () => {
    const result = (await client.callTool('query_competency', {
      query_type: 'scores',
    })) as {
      record_count: number;
      records: Array<{ student_name: string; competency: string; score: number }>;
    };
    expect(result.record_count).toBeGreaterThan(0);
    expect(result.records[0]?.student_name).toBeTruthy();
    expect(result.records[0]?.competency).toBeTruthy();
  });

  it('query_attendance aggregate returns overall rate', async () => {
    const result = (await client.callTool('query_attendance', {
      query_type: 'aggregate',
    })) as {
      overall: { student_count: number; attendance_rate_pct: number | null };
      breakdown: Array<{ group: string; student_count: number }>;
    };
    expect(result.overall.student_count).toBe(3);
    expect(result.overall.attendance_rate_pct).toBeGreaterThan(0);
    expect(result.breakdown.length).toBeGreaterThan(0);
  });

  it('query_students list returns seeded students', async () => {
    const result = (await client.callTool('query_students', {
      query_type: 'list',
    })) as {
      student_count: number;
      students: Array<{ canonical_name: string }>;
    };
    expect(result.student_count).toBe(3);
    const names = result.students.map((s) => s.canonical_name).sort();
    expect(names).toEqual(['Janelle Brooks', 'Maria Garcia', 'Tai Pham']);
  });

  it('query_donors summary reflects seeded donors', async () => {
    const result = (await client.callTool('query_donors', {
      query_type: 'summary',
    })) as { total_donors: number; lifetime_giving: { total: number } };
    expect(result.total_donors).toBe(2);
    expect(result.lifetime_giving.total).toBeGreaterThan(0);
  });

  it('get_entity_brief surfaces full student profile + certifications', async () => {
    const result = (await client.callTool('get_entity_brief', {
      person_name: 'Maria Garcia',
    })) as {
      entity: { canonical_name: string; entity_type: string };
      profile: { current_phase: string };
      certifications: Array<{ cert_name: string; result: string }>;
      phase_progression: Array<{ phase: string; outcome: string | null }>;
      sources_active: string[];
    };
    expect(result.entity.entity_type).toBe('student');
    expect(result.entity.canonical_name).toBe('Maria Garcia');
    expect(result.profile.current_phase).toBe('101');
    expect(result.certifications.length).toBeGreaterThan(0);
    expect(result.phase_progression.length).toBeGreaterThan(0);
    expect(result.sources_active).toContain('google_sheets');
  });
});
