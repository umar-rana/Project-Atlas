-- Auth hardening and orphan recovery migration.
--
-- PREFLIGHT REQUIREMENT: This migration will abort if ANY users (including
-- soft-deleted) have null or duplicate clerk_id values. Before running:
--
--   npx tsx scripts/migrate-clerk-id-nulls.ts --dry-run  (preview)
--   npx tsx scripts/migrate-clerk-id-nulls.ts            (apply)
--
-- The script assigns "orphaned_<id>" placeholders to null-clerk_id rows
-- (both live and soft-deleted) WITHOUT soft-deleting them, preserving
-- recoverability. Duplicate clerk_ids must be resolved manually.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS guards make Step 2 safe to re-run.

-- ─── Step 1a: Preflight — halt if ANY row (including soft-deleted) has null clerk_id ─
DO $$
DECLARE
  null_count INTEGER;
  null_ids   TEXT;
BEGIN
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(STRING_AGG(id::text, ', ' ORDER BY id), '')
  INTO null_count, null_ids
  FROM "User"
  WHERE clerk_id IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION
      E'Migration halted: % user(s) (including soft-deleted) have null clerk_id (ids: %).\n'
      'Run:  npx tsx scripts/migrate-clerk-id-nulls.ts\nthen retry.',
      null_count,
      null_ids;
  END IF;
END $$;

-- ─── Step 1b: Preflight — halt if duplicate clerk_id values exist (all rows) ─────────
DO $$
DECLARE
  dup_count INTEGER;
  dup_ids   TEXT;
BEGIN
  SELECT
    COUNT(DISTINCT clerk_id)::INTEGER,
    COALESCE(STRING_AGG(clerk_id, ', '), '')
  INTO dup_count, dup_ids
  FROM (
    SELECT clerk_id
    FROM "User"
    WHERE clerk_id IS NOT NULL
    GROUP BY clerk_id
    HAVING COUNT(*) > 1
  ) sub;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      E'Migration halted: % duplicate clerk_id value(s) among live users (clerk_ids: %).\n'
      'Resolve duplicates manually (e.g. via admin console) then retry.',
      dup_count,
      dup_ids;
  END IF;
END $$;

-- ─── Step 2: Add recovery notification columns (idempotent) ──────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "recovery_notification_pending" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "last_recovery_summary" JSONB,
  ADD COLUMN IF NOT EXISTS "last_recovery_dismissed_at" TIMESTAMPTZ;

-- ─── Step 3: Enforce NOT NULL on clerk_id (both preflights guarantee safety) ─
ALTER TABLE "User" ALTER COLUMN clerk_id SET NOT NULL;
