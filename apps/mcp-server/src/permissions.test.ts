import { describe, it, expect, beforeEach } from 'vitest';
import {
  canCallTool,
  isRole,
  __setPermissionsForTesting,
  __clearPermissionsCacheForTesting,
} from './permissions.js';

const STUB = {
  query_finances: ['finance', 'leadership', 'admin'],
  search_documents: ['finance', 'software_dev', 'leadership', 'admin'],
  future_tool: ['sales', 'leadership', 'admin'],
};

describe('permissions registry (DB-backed with test stubs)', () => {
  beforeEach(() => {
    __clearPermissionsCacheForTesting();
    __setPermissionsForTesting(STUB);
  });

  it('admin can call every stubbed tool', async () => {
    for (const tool of Object.keys(STUB)) {
      expect(await canCallTool(tool, ['admin'])).toBe(true);
    }
  });

  it('leadership can call every stubbed tool', async () => {
    for (const tool of Object.keys(STUB)) {
      expect(await canCallTool(tool, ['leadership'])).toBe(true);
    }
  });

  it('pending users cannot call anything', async () => {
    expect(await canCallTool('query_finances', ['pending'])).toBe(false);
    expect(await canCallTool('search_documents', ['pending'])).toBe(false);
  });

  it('empty roles cannot call anything', async () => {
    expect(await canCallTool('query_finances', [])).toBe(false);
  });

  it('finance role has finance access but no unrelated access', async () => {
    expect(await canCallTool('query_finances', ['finance'])).toBe(true);
    expect(await canCallTool('future_tool', ['finance'])).toBe(false);
  });

  it('sales has future_tool access but no finance access', async () => {
    expect(await canCallTool('future_tool', ['sales'])).toBe(true);
    expect(await canCallTool('query_finances', ['sales'])).toBe(false);
  });

  it('multi-role user gets union of allowed tools', async () => {
    expect(await canCallTool('query_finances', ['finance', 'sales'])).toBe(true);
    expect(await canCallTool('future_tool', ['finance', 'sales'])).toBe(true);
  });

  it('unknown tools deny by default', async () => {
    expect(await canCallTool('not_a_real_tool', ['admin'])).toBe(false);
  });

  it('isRole gates correctly', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('program_staff')).toBe(true);
    expect(isRole('superuser')).toBe(false);
    expect(isRole('')).toBe(false);
  });
});
