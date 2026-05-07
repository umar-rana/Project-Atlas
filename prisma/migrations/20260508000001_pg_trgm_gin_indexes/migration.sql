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
-- ║  APPLY IN DEV / PRODUCTION via psql (not prisma migrate deploy):        ║
-- ║    psql $DATABASE_URL -f prisma/migrations/                              ║
-- ║         20260508000001_pg_trgm_gin_indexes/migration.sql                ║
-- ║    npx prisma migrate resolve --applied                                  ║
-- ║         20260508000001_pg_trgm_gin_indexes                              ║
-- ║                                                                          ║
-- ║  DO NOT remove the COMMIT or BEGIN at the top/bottom of this file.       ║
-- ║  DO NOT move these statements into an explicit transaction block.         ║
-- ║  All statements use IF NOT EXISTS — safe to re-run on a fresh database.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

COMMIT;

SET statement_timeout = 0;

-- FTS index on Note.search_vector (persisted tsvector column).
-- Used by the Note FTS path in src/server/routers/search.ts.
CREATE INDEX CONCURRENTLY IF NOT EXISTS note_search_vector_idx
  ON "Note" USING gin(search_vector)
  WHERE deleted_at IS NULL;

-- Trigram indexes for ILIKE fallback on Note title and body_text.
CREATE INDEX CONCURRENTLY IF NOT EXISTS note_title_trgm_idx
  ON "Note" USING gin(title gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS note_body_text_trgm_idx
  ON "Note" USING gin(body_text gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Trigram indexes for ILIKE fallback on Task title and notes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS task_title_trgm_idx
  ON "Task" USING gin(title gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS task_notes_trgm_idx
  ON "Task" USING gin(notes gin_trgm_ops)
  WHERE deleted_at IS NULL;

BEGIN;
