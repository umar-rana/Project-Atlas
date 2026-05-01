-- Wave 4a Phase 1: Notes, Link, Project enhancements, Locale fields

-- AlterTable
ALTER TABLE "Attachment" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "target_date" TIMESTAMPTZ,
ADD COLUMN "type" TEXT NOT NULL DEFAULT 'project';

-- AlterTable
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "ai_budget_usd" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "currency_code" TEXT NOT NULL DEFAULT 'PKR',
ADD COLUMN IF NOT EXISTS "currency_symbol" TEXT NOT NULL DEFAULT '₨',
ADD COLUMN IF NOT EXISTS "locale_preset" TEXT NOT NULL DEFAULT 'pakistan',
ADD COLUMN IF NOT EXISTS "number_format" TEXT NOT NULL DEFAULT '1,234.56',
ALTER COLUMN "date_format" SET DEFAULT 'dd-mm-yyyy',
ALTER COLUMN "time_format" SET DEFAULT '12h';

-- CreateTable
CREATE TABLE "NotesFolder" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "position" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "NotesFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "folder_id" UUID,
    "project_id" UUID,
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "is_project_brief" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "position" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "drive_file_id" TEXT,
    "drive_synced_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Link" (
    "id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'reference',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotesFolder_user_id_idx" ON "NotesFolder"("user_id");

-- CreateIndex
CREATE INDEX "NotesFolder_user_id_parent_id_idx" ON "NotesFolder"("user_id", "parent_id");

-- CreateIndex
CREATE INDEX "NotesFolder_deleted_at_idx" ON "NotesFolder"("deleted_at");

-- CreateIndex
CREATE INDEX "Note_user_id_idx" ON "Note"("user_id");

-- CreateIndex
CREATE INDEX "Note_user_id_folder_id_idx" ON "Note"("user_id", "folder_id");

-- CreateIndex
CREATE INDEX "Note_user_id_project_id_idx" ON "Note"("user_id", "project_id");

-- CreateIndex
CREATE INDEX "Note_user_id_pinned_idx" ON "Note"("user_id", "pinned");

-- CreateIndex
CREATE INDEX "Note_deleted_at_idx" ON "Note"("deleted_at");

-- Partial unique index: only one project brief per project
CREATE UNIQUE INDEX "note_project_brief_unique"
    ON "Note" ("project_id")
    WHERE "is_project_brief" = true;

-- CreateIndex
CREATE INDEX "Link_source_type_source_id_idx" ON "Link"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "Link_target_type_target_id_idx" ON "Link"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "Link_source_type_source_id_target_type_target_id_relation_key"
    ON "Link"("source_type", "source_id", "target_type", "target_id", "relation");

-- CreateIndex
CREATE INDEX "Project_user_id_type_idx" ON "Project"("user_id", "type");

-- AddForeignKey (if not exists already)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Attachment_task_id_fkey'
  ) THEN
    ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_task_id_fkey"
      FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
ALTER TABLE "NotesFolder" ADD CONSTRAINT "NotesFolder_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "NotesFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_folder_id_fkey"
    FOREIGN KEY ("folder_id") REFERENCES "NotesFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
