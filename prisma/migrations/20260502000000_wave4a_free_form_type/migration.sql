-- Wave 4a: Add free-form type column to Project; migrate habit -> goal

-- Add the type column with default 'project'
ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'project';

-- Create index used by Prisma schema
CREATE INDEX IF NOT EXISTS "Project_user_id_type_idx" ON "Project"("user_id", "type");

-- Write a project_type_migrated audit entry for each habit project BEFORE migrating
INSERT INTO "AuditLog" (id, user_id, entity_type, entity_id, action, meta, created_at)
SELECT
  gen_random_uuid(),
  user_id,
  'Project',
  id::text,
  'project_type_migrated',
  '{"from": "habit", "to": "goal"}'::jsonb,
  NOW()
FROM "Project"
WHERE "type" = 'habit'
  AND deleted_at IS NULL;

-- Migrate any existing habit projects to goal
UPDATE "Project"
SET "type" = 'goal'
WHERE "type" = 'habit'
  AND deleted_at IS NULL;
