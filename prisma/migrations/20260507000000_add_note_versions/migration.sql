-- CreateTable
CREATE TABLE "NoteVersion" (
    "id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "body_json" TEXT NOT NULL DEFAULT '{}',
    "body_text" TEXT NOT NULL DEFAULT '',
    "body_markdown" TEXT NOT NULL DEFAULT '',
    "change_summary" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NoteVersion_note_id_version_number_key" ON "NoteVersion"("note_id", "version_number");

-- CreateIndex
CREATE INDEX "NoteVersion_note_id_version_number_idx" ON "NoteVersion"("note_id", "version_number");

-- AddForeignKey
ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
