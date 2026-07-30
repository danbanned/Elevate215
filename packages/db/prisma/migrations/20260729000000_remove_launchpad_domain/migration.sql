-- Elevate215 restructure: remove every Launchpad-specific domain model and the
-- AWS resource-automation model (its only consumer, apps/aws-mcp-server, is
-- being removed alongside it). FinanceSnapshot, DocumentChunk, and all shared
-- infra tables (auth, sync_runs, usage_logs, connector_credentials, MCP OAuth,
-- tool_permissions) are untouched.

-- Clean up stale tool_permissions rows for tools deleted in this restructure.
DELETE FROM "tool_permissions" WHERE "tool_name" IN (
  'get_student_info',
  'query_students',
  'query_outcomes',
  'query_enrollment',
  'query_certifications',
  'query_competency',
  'query_attendance',
  'query_employment',
  'query_postsecondary',
  'query_donors',
  'get_entity_brief',
  'search_by_person',
  'search_conversations',
  'skill_grant_writing',
  'skill_grant_prospecting',
  'skill_board_reporting'
);

-- DropForeignKey (children before parents)
-- ALTER TABLE IF EXISTS guards against student_postsecondary / aws_resource_jobs,
-- which turned out to have never been created in this database (pre-existing
-- drift between schema.prisma and the applied migration history, unrelated to
-- this restructure — discovered when the first apply attempt failed here).
ALTER TABLE IF EXISTS "entity_aliases" DROP CONSTRAINT IF EXISTS "entity_aliases_student_id_fkey";
ALTER TABLE IF EXISTS "entity_aliases" DROP CONSTRAINT IF EXISTS "entity_aliases_staff_id_fkey";
ALTER TABLE IF EXISTS "student_info" DROP CONSTRAINT IF EXISTS "student_info_student_id_fkey";
ALTER TABLE IF EXISTS "student_certifications" DROP CONSTRAINT IF EXISTS "student_certifications_student_id_fkey";
ALTER TABLE IF EXISTS "student_phase_outcomes" DROP CONSTRAINT IF EXISTS "student_phase_outcomes_student_id_fkey";
ALTER TABLE IF EXISTS "student_employment" DROP CONSTRAINT IF EXISTS "student_employment_studentNumber_fkey";
ALTER TABLE IF EXISTS "student_postsecondary" DROP CONSTRAINT IF EXISTS "student_postsecondary_studentNumber_fkey";
ALTER TABLE IF EXISTS "donor_gifts" DROP CONSTRAINT IF EXISTS "donor_gifts_donor_contact_id_fkey";
ALTER TABLE IF EXISTS "donor_pipeline" DROP CONSTRAINT IF EXISTS "donor_pipeline_donor_contact_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "entity_aliases";
DROP TABLE IF EXISTS "student_info";
DROP TABLE IF EXISTS "student_certifications";
DROP TABLE IF EXISTS "student_phase_outcomes";
DROP TABLE IF EXISTS "student_employment";
DROP TABLE IF EXISTS "student_postsecondary";
DROP TABLE IF EXISTS "donor_gifts";
DROP TABLE IF EXISTS "donor_pipeline";
DROP TABLE IF EXISTS "students";
DROP TABLE IF EXISTS "staff";
DROP TABLE IF EXISTS "pending_aliases";
DROP TABLE IF EXISTS "student_competencies";
DROP TABLE IF EXISTS "enrollment_snapshots";
DROP TABLE IF EXISTS "attendance_records";
DROP TABLE IF EXISTS "donor_contacts";
DROP TABLE IF EXISTS "donor_grants";
DROP TABLE IF EXISTS "aws_resource_jobs";
