-- Register the new query_school_rollup tool in the editable ACL table.
-- New category: school_data — school data is public (not sensitive like
-- finance), so all three non-pending roles get access.
--
-- Starter role set — Elevate215 final roles TBD.
--
-- NOTE: using "program_staff" here, not "staff" — this repo's fixed ROLES
-- enum (apps/mcp-server/src/permissions.ts, mirrored in
-- apps/hq/app/admin/roles.ts) has no plain "staff" role. A literal "staff"
-- string would be silently unmanageable: the admin PermissionsMatrix only
-- renders a checkbox column per entry in ROLES, so "staff" would never show
-- up there, and no real mcp_users.roles value could ever match it through
-- the normal admin toggle flow. Flagging for confirmation before this runs.
INSERT INTO "tool_permissions" ("tool_name", "allowed_roles", "category", "description", "updated_at")
VALUES (
  'query_school_rollup',
  ARRAY['program_staff','leadership','admin'],
  'school_data',
  'School-level performance and enrollment data from the PHL School Performance Model School Rollup tab',
  NOW()
)
ON CONFLICT ("tool_name") DO NOTHING;
