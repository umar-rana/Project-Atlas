-- Wave 4a Phase 1: Schema corrections — Note fields, Link user/excerpt, NotesFolder FK

-- DropIndex (replace relation-inclusive unique with simpler source+target unique)
DROP INDEX "Link_source_type_source_id_target_type_target_id_relation_key";

-- AlterTable Link: add user_id and source_excerpt
ALTER TABLE "Link"
  ADD COLUMN "source_excerpt" TEXT,
  ADD COLUMN "user_id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- Remove the placeholder default now that column exists (no existing rows)
ALTER TABLE "Link" ALTER COLUMN "user_id" DROP DEFAULT;

-- AlterTable Note: rename body -> body_json, add body_text, body_markdown, purpose, drive_sync_error
ALTER TABLE "Note"
  RENAME COLUMN "body" TO "body_json";

ALTER TABLE "Note"
  ADD COLUMN "body_text" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "body_markdown" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'note',
  ADD COLUMN "drive_sync_error" TEXT;

-- CreateIndex
CREATE INDEX "Link_user_id_idx" ON "Link"("user_id");

-- CreateIndex (new unique without relation)
CREATE UNIQUE INDEX "Link_source_type_source_id_target_type_target_id_key"
  ON "Link"("source_type", "source_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "Note_user_id_purpose_idx" ON "Note"("user_id", "purpose");

-- AddForeignKey: NotesFolder → User (was missing before)
ALTER TABLE "NotesFolder" ADD CONSTRAINT "NotesFolder_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Link → User
ALTER TABLE "Link" ADD CONSTRAINT "Link_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill all locale fields to Pakistan preset for existing User rows.
-- date_format and time_format existed before with old defaults ('DD/MM/YYYY', '24h');
-- locale_preset, currency_code, currency_symbol, number_format were NEW columns added with
-- correct defaults in the first migration so they already have correct values.
-- Updating all rows ensures consistency regardless of prior state.
UPDATE "User"
SET
  locale_preset   = 'pakistan',
  currency_code   = 'PKR',
  currency_symbol = '₨',
  number_format   = '1,234.56',
  date_format     = 'dd-mm-yyyy',
  time_format     = '12h'
WHERE deleted_at IS NULL;
