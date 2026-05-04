-- GTD Inbox Wave 1 — Schema changes
-- Adds new fields to Capture and Task models for GTD Inbox processing.

-- AlterTable Capture: add state machine + processing fields
ALTER TABLE "Capture" ADD COLUMN IF NOT EXISTS "state" TEXT NOT NULL DEFAULT 'raw';
ALTER TABLE "Capture" ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMPTZ;
ALTER TABLE "Capture" ADD COLUMN IF NOT EXISTS "processed_to_type" TEXT;
ALTER TABLE "Capture" ADD COLUMN IF NOT EXISTS "processed_to_id" UUID;
ALTER TABLE "Capture" ADD COLUMN IF NOT EXISTS "migration_source" TEXT;
ALTER TABLE "Capture" ADD COLUMN IF NOT EXISTS "parser_proposal" JSONB;

-- AlterTable Task: add GTD disposition fields
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "is_someday" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "someday_review_date" TIMESTAMPTZ;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "delegated_to_text" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "delegated_to_person_id" UUID;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "follow_up_date" TIMESTAMPTZ;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "migration_note" TEXT;

-- CreateIndex for inbox query patterns
CREATE INDEX IF NOT EXISTS "Capture_user_id_state_idx" ON "Capture"("user_id", "state");
CREATE INDEX IF NOT EXISTS "Capture_user_id_state_processed_at_idx" ON "Capture"("user_id", "state", "processed_at");

-- CreateIndex for GTD perspectives
CREATE INDEX IF NOT EXISTS "Task_user_id_is_someday_idx" ON "Task"("user_id", "is_someday");
CREATE INDEX IF NOT EXISTS "Task_user_id_follow_up_date_idx" ON "Task"("user_id", "follow_up_date");
