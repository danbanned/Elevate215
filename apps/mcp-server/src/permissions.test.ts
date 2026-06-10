import { describe, it, expect } from 'vitest';
import { canCallTool, isRole, TOOL_PERMISSIONS } from './permissions.js';

describe('permissions registry', () => {
  it('admin can call every registered tool', () => {
    for (const tool of Object.keys(TOOL_PERMISSIONS)) {
      expect(canCallTool(tool, ['admin'])).toBe(true);
    }
  });

  it('leadership can call every registered tool', () => {
    for (const tool of Object.keys(TOOL_PERMISSIONS)) {
      expect(canCallTool(tool, ['leadership'])).toBe(true);
    }
  });

  it('pending users cannot call anything', () => {
    expect(canCallTool('query_students', ['pending'])).toBe(false);
    expect(canCallTool('query_donors', ['pending'])).toBe(false);
  });

  it('empty roles cannot call anything', () => {
    expect(canCallTool('query_students', [])).toBe(false);
  });

  it('program_staff has student access but not donor access', () => {
    expect(canCallTool('query_students', ['program_staff'])).toBe(true);
    expect(canCallTool('query_donors', ['program_staff'])).toBe(false);
  });

  it('sales has donor + entity access but no student access', () => {
    expect(canCallTool('query_donors', ['sales'])).toBe(true);
    expect(canCallTool('get_entity_brief', ['sales'])).toBe(true);
    expect(canCallTool('query_students', ['sales'])).toBe(false);
  });

  it('finance has finance + donor access but no student access', () => {
    expect(canCallTool('query_finances', ['finance'])).toBe(true);
    expect(canCallTool('query_donors', ['finance'])).toBe(true);
    expect(canCallTool('query_students', ['finance'])).toBe(false);
  });

  it('multi-role user gets union of allowed tools', () => {
    expect(canCallTool('query_students', ['program_staff', 'sales'])).toBe(true);
    expect(canCallTool('query_donors', ['program_staff', 'sales'])).toBe(true);
  });

  it('unknown tools deny by default', () => {
    expect(canCallTool('not_a_real_tool', ['admin'])).toBe(false);
  });

  it('future tools (HubSpot/GitHub/Notion) have entries reserved', () => {
    expect(TOOL_PERMISSIONS['query_hubspot_contacts']).toBeDefined();
    expect(TOOL_PERMISSIONS['query_github_prs']).toBeDefined();
    expect(TOOL_PERMISSIONS['query_policy']).toBeDefined();
    expect(TOOL_PERMISSIONS['query_clients']).toBeDefined();
  });

  it('isRole gates correctly', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('program_staff')).toBe(true);
    expect(isRole('superuser')).toBe(false);
    expect(isRole('')).toBe(false);
  });
});
