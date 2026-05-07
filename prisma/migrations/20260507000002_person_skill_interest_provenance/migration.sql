-- Wave 5a-i patch: add provenance fields to PersonSkill and PersonInterest
-- Brings them to parity with all other multi-value child tables
-- (PersonEmail, PersonPhone, PersonAddress, PersonOrganization, PersonUrl, PersonEvent, PersonRelation).

ALTER TABLE "PersonSkill"
  ADD COLUMN IF NOT EXISTS "source"          TEXT,
  ADD COLUMN IF NOT EXISTS "source_id"       TEXT,
  ADD COLUMN IF NOT EXISTS "source_metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "last_synced_at"  TIMESTAMPTZ;

ALTER TABLE "PersonInterest"
  ADD COLUMN IF NOT EXISTS "source"          TEXT,
  ADD COLUMN IF NOT EXISTS "source_id"       TEXT,
  ADD COLUMN IF NOT EXISTS "source_metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "last_synced_at"  TIMESTAMPTZ;
