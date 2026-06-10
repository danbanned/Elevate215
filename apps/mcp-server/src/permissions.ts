/**
 * MCP role + tool-level ACL registry (Phase 23).
 *
 * Roles are stored per-user in `mcp_users.roles` (string[]) and are fetched
 * fresh from the DB on every tool call by `auth.ts`. Never bake roles into
 * the JWT — we want role changes to take effect immediately.
 *
 * See docs/setup/23-mcp-oauth.md for the full design.
 */

export const ROLES = [
  'pending',
  'program_staff',
  'development',
  'sales',
  'finance',
  'software_dev',
  'leadership',
  'admin',
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * Tool → roles allowed to call it. A user passes if they hold ANY listed role.
 *
 * `admin` and `leadership` are intentionally listed explicitly on every tool —
 * makes audits easier than relying on an implicit "admin gets everything" rule
 * scattered through the code.
 *
 * Future tools (HubSpot/GitHub/Notion) have entries reserved here so adding
 * the connector later doesn't require a permissions PR.
 */
export const TOOL_PERMISSIONS: Record<string, readonly Role[]> = {
  // ----- Student data (program_staff is the main reader) -----
  get_student_info: ['program_staff', 'leadership', 'admin'],
  query_students: ['program_staff', 'leadership', 'admin'],
  query_outcomes: ['program_staff', 'leadership', 'admin'],
  query_enrollment: ['program_staff', 'leadership', 'admin'],
  query_certifications: ['program_staff', 'leadership', 'admin'],
  query_competency: ['program_staff', 'leadership', 'admin'],
  query_attendance: ['program_staff', 'leadership', 'admin'],

  // ----- Donor / finance -----
  query_donors: ['development', 'sales', 'finance', 'leadership', 'admin'],
  query_finances: ['finance', 'leadership', 'admin'],
  get_finance_brief: ['finance', 'leadership', 'admin'],
  get_entity_brief: ['development', 'sales', 'leadership', 'admin'],

  // ----- Cross-cutting search -----
  search_by_person: ['program_staff', 'development', 'leadership', 'admin'],
  search_conversations: ['program_staff', 'software_dev', 'leadership', 'admin'],
  search_documents: [
    'program_staff',
    'development',
    'sales',
    'software_dev',
    'leadership',
    'admin',
  ],

  // ----- Future tools (registered now so the connectors can land without
  //       a permissions PR; the tool handlers don't exist yet) -----
  query_hubspot_contacts: ['sales', 'leadership', 'admin'],
  query_hubspot_deals: ['sales', 'leadership', 'admin'],
  query_github_issues: ['software_dev', 'leadership', 'admin'],
  query_github_prs: ['software_dev', 'leadership', 'admin'],
  query_policy: ['program_staff', 'software_dev', 'leadership', 'admin'],
  query_clients: ['software_dev', 'sales', 'leadership', 'admin'],
};

/**
 * True iff the user has at least one role permitted to call the tool.
 * Pending or disabled users (callers with no/empty roles array) always fail.
 */
export function canCallTool(toolName: string, userRoles: readonly string[]): boolean {
  const allowed = TOOL_PERMISSIONS[toolName];
  if (!allowed) return false; // unknown tool → deny by default
  if (userRoles.length === 0) return false;
  return userRoles.some((r) => (allowed as readonly string[]).includes(r));
}

/**
 * Structured deny response, mirrors toolError() shape.
 * Callers throw this from runTool() when canCallTool() returns false.
 */
export function permissionDeniedError(toolName: string): {
  code: 'permission_denied';
  message: string;
} {
  return {
    code: 'permission_denied',
    message: `Tool '${toolName}' is not permitted for your role. Contact an LP Internal AI admin.`,
  };
}
