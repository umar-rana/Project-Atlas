-- Wave 5a-ii: PersonInteraction table + Person follow-up fields

-- Add new columns to Person
ALTER TABLE "Person"
  ADD COLUMN IF NOT EXISTS "followup_snooze_until" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "cadence_suggestion_dismissed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "cadence_suggestion_dismissed_value" INTEGER;

-- Add index for snooze
CREATE INDEX IF NOT EXISTS "Person_user_id_followup_snooze_until_idx" ON "Person"("user_id", "followup_snooze_until");

-- Create PersonInteraction table
CREATE TABLE IF NOT EXISTS "PersonInteraction" (
  "id"               UUID NOT NULL,
  "person_id"        UUID NOT NULL,
  "kind"             TEXT NOT NULL,
  "occurred_at"      TIMESTAMPTZ NOT NULL,
  "duration_minutes" INTEGER,
  "location"         TEXT,
  "notes"            TEXT,
  "source_capture_id" UUID,
  "source_task_id"   UUID,
  "deleted_at"       TIMESTAMPTZ,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "PersonInteraction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonInteraction_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "PersonInteraction_person_id_idx"       ON "PersonInteraction"("person_id");
CREATE INDEX IF NOT EXISTS "PersonInteraction_person_id_occurred_idx" ON "PersonInteraction"("person_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "PersonInteraction_person_id_deleted_idx" ON "PersonInteraction"("person_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "PersonInteraction_deleted_at_idx"      ON "PersonInteraction"("deleted_at");
