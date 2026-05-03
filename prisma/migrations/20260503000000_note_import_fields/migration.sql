-- Add import tracking fields to the Note model.
-- Applied via `prisma db push` earlier; this migration records the change
-- for deploy-time consistency and schema history.

ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "imported_from" TEXT;
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "imported_at" TIMESTAMPTZ;
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "source_metadata" JSONB;
