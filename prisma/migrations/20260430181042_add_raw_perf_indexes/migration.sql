-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION RUNBOOK — READ BEFORE MODIFYING                             ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║                                                                          ║
-- ║  WHY this migration does not use a standard Prisma transaction:          ║
-- ║  PostgreSQL requires CREATE INDEX CONCURRENTLY to run outside any        ║
-- ║  transaction block (error 25001 otherwise). Prisma wraps every           ║
-- ║  migration in BEGIN … COMMIT automatically.                              ║
-- ║                                                                          ║
-- ║  HOW the transaction-escape pattern works:                               ║
-- ║    1. Prisma issues:           BEGIN;                                    ║
-- ║    2. This file issues:        COMMIT;   ← closes Prisma's transaction   ║
-- ║    3. CONCURRENTLY indexes are built outside any transaction.            ║
-- ║    4. This file issues:        BEGIN;    ← opens a new (empty) txn       ║
-- ║    5. Prisma issues:           COMMIT;   ← closes it cleanly             ║
-- ║                                                                          ║
-- ║  DO NOT remove the COMMIT or BEGIN at the top/bottom of this file.       ║
-- ║  DO NOT move these statements into an explicit transaction block.         ║
-- ║  DO NOT set statement_timeout with SET LOCAL (requires a transaction).   ║
-- ║                                                                          ║
-- ║  All statements use IF NOT EXISTS — safe to re-run on a fresh database.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

COMMIT;

SET statement_timeout = 0;

-- GIN index for full-text search on Task.search_vector
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_search_vector_gin_idx"
  ON "Task" USING gin(to_tsvector('english', COALESCE(search_vector, '')));

-- Partial indexes on the highest-traffic soft-deleted tables (WHERE deleted_at IS NULL)

-- Task
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_user_id_status_partial_idx"
  ON "Task"("user_id", "status") WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_user_id_due_date_partial_idx"
  ON "Task"("user_id", "due_date") WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_user_id_defer_date_partial_idx"
  ON "Task"("user_id", "defer_date") WHERE deleted_at IS NULL;

-- Attachment
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Attachment_user_id_partial_idx"
  ON "Attachment"("user_id") WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Attachment_task_id_partial_idx"
  ON "Attachment"("task_id") WHERE deleted_at IS NULL;

-- Capture
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Capture_user_id_partial_idx"
  ON "Capture"("user_id") WHERE deleted_at IS NULL;

-- Tag
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Tag_user_id_partial_idx"
  ON "Tag"("user_id") WHERE deleted_at IS NULL;

-- Context
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Context_user_id_partial_idx"
  ON "Context"("user_id") WHERE deleted_at IS NULL;

-- ProjectFolder
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ProjectFolder_user_id_partial_idx"
  ON "ProjectFolder"("user_id") WHERE deleted_at IS NULL;

-- Project
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Project_user_id_status_partial_idx"
  ON "Project"("user_id", "status") WHERE deleted_at IS NULL;

-- ChecklistItem
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChecklistItem_task_id_position_partial_idx"
  ON "ChecklistItem"("task_id", "position") WHERE deleted_at IS NULL;

-- TaskWorkLog
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TaskWorkLog_task_id_created_at_partial_idx"
  ON "TaskWorkLog"("task_id", "created_at") WHERE deleted_at IS NULL;

BEGIN;
