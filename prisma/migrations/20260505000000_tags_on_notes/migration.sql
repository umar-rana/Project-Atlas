-- Tags on Notes — Wave 4c
-- Creates the TagOnNote join table linking Tag ↔ Note with cascade deletes.

CREATE TABLE IF NOT EXISTS "TagOnNote" (
  "tag_id"     UUID        NOT NULL,
  "note_id"    UUID        NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "TagOnNote_pkey" PRIMARY KEY ("tag_id", "note_id"),
  CONSTRAINT "TagOnNote_tag_id_fkey"  FOREIGN KEY ("tag_id")  REFERENCES "Tag"("id")  ON DELETE CASCADE,
  CONSTRAINT "TagOnNote_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "Note"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "TagOnNote_note_id_idx" ON "TagOnNote"("note_id");
CREATE INDEX IF NOT EXISTS "TagOnNote_tag_id_idx"  ON "TagOnNote"("tag_id");
