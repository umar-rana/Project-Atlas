-- Recreate the GIN index without the COALESCE(search_vector, '') expression.
--
-- The old expression stored in pg_catalog as:
--   to_tsvector('english'::regconfig, COALESCE(search_vector, ''::text))
-- contains a literal ''::text cast that Replit's deployment SQL generator
-- incorrectly mangles into ''::t tsvector_ops — invalid SQL that blocks
-- every deployment.
--
-- The new expression:
--   to_tsvector('english', search_vector)
-- stores as:
--   to_tsvector('english'::regconfig, search_vector)
-- which has no empty-string literal and is reproduced correctly by all
-- SQL generators. This is safe because the task_search_vector_trigger
-- populates search_vector on every INSERT/UPDATE (and a backfill ran in
-- migration 20260501000000_add_search_vector_trigger), so search_vector
-- is never NULL in practice.

DROP INDEX IF EXISTS "Task_search_vector_gin_idx";

CREATE INDEX "Task_search_vector_gin_idx"
  ON "Task" USING gin(to_tsvector('english', search_vector));
