-- Wave 5a-i: Relational Person foundation
-- Adds full Person model with name decomposition, biography, photo, relationship_type,
-- cadence fields, external_data, and nine multi-value child tables + TagOnPerson.
-- Data migration: moves existing email column values to PersonEmail rows.

-- 1. Expand Person table with new flat columns
ALTER TABLE "Person"
  ADD COLUMN IF NOT EXISTS "honorific_prefix"  TEXT,
  ADD COLUMN IF NOT EXISTS "given_name"         TEXT,
  ADD COLUMN IF NOT EXISTS "middle_name"        TEXT,
  ADD COLUMN IF NOT EXISTS "family_name"        TEXT,
  ADD COLUMN IF NOT EXISTS "honorific_suffix"   TEXT,
  ADD COLUMN IF NOT EXISTS "nickname"           TEXT,
  ADD COLUMN IF NOT EXISTS "biography"          TEXT,
  ADD COLUMN IF NOT EXISTS "photo_url"          TEXT,
  ADD COLUMN IF NOT EXISTS "relationship_type"  TEXT,
  ADD COLUMN IF NOT EXISTS "cadence_days"       INT,
  ADD COLUMN IF NOT EXISTS "next_follow_up_at"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "last_contacted_at"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "external_data"      JSONB;

-- 2. PersonEmail
CREATE TABLE IF NOT EXISTS "PersonEmail" (
  "id"              UUID        NOT NULL,
  "person_id"       UUID        NOT NULL,
  "email"           TEXT        NOT NULL,
  "type"            TEXT        NOT NULL DEFAULT 'other',
  "is_primary"      BOOLEAN     NOT NULL DEFAULT false,
  "source"          TEXT,
  "source_id"       TEXT,
  "source_metadata" JSONB,
  "last_synced_at"  TIMESTAMPTZ,
  "deleted_at"      TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PersonEmail_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonEmail_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "PersonEmail_person_id_idx" ON "PersonEmail"("person_id");
CREATE INDEX IF NOT EXISTS "PersonEmail_person_id_is_primary_idx" ON "PersonEmail"("person_id", "is_primary");
CREATE INDEX IF NOT EXISTS "PersonEmail_deleted_at_idx" ON "PersonEmail"("deleted_at");

-- 3. PersonPhone
CREATE TABLE IF NOT EXISTS "PersonPhone" (
  "id"              UUID        NOT NULL,
  "person_id"       UUID        NOT NULL,
  "number"          TEXT        NOT NULL,
  "e164_normalized" TEXT,
  "type"            TEXT        NOT NULL DEFAULT 'other',
  "is_primary"      BOOLEAN     NOT NULL DEFAULT false,
  "source"          TEXT,
  "source_id"       TEXT,
  "source_metadata" JSONB,
  "last_synced_at"  TIMESTAMPTZ,
  "deleted_at"      TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PersonPhone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonPhone_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "PersonPhone_person_id_idx" ON "PersonPhone"("person_id");
CREATE INDEX IF NOT EXISTS "PersonPhone_person_id_is_primary_idx" ON "PersonPhone"("person_id", "is_primary");
CREATE INDEX IF NOT EXISTS "PersonPhone_deleted_at_idx" ON "PersonPhone"("deleted_at");

-- 4. PersonAddress
CREATE TABLE IF NOT EXISTS "PersonAddress" (
  "id"              UUID        NOT NULL,
  "person_id"       UUID        NOT NULL,
  "type"            TEXT        NOT NULL DEFAULT 'other',
  "street"          TEXT,
  "city"            TEXT,
  "region"          TEXT,
  "postal_code"     TEXT,
  "country_code"    TEXT,
  "country_name"    TEXT,
  "formatted"       TEXT,
  "is_primary"      BOOLEAN     NOT NULL DEFAULT false,
  "source"          TEXT,
  "source_id"       TEXT,
  "source_metadata" JSONB,
  "last_synced_at"  TIMESTAMPTZ,
  "deleted_at"      TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PersonAddress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonAddress_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "PersonAddress_person_id_idx" ON "PersonAddress"("person_id");
CREATE INDEX IF NOT EXISTS "PersonAddress_person_id_is_primary_idx" ON "PersonAddress"("person_id", "is_primary");
CREATE INDEX IF NOT EXISTS "PersonAddress_deleted_at_idx" ON "PersonAddress"("deleted_at");

-- 5. PersonOrganization
CREATE TABLE IF NOT EXISTS "PersonOrganization" (
  "id"              UUID        NOT NULL,
  "person_id"       UUID        NOT NULL,
  "name"            TEXT        NOT NULL,
  "title"           TEXT,
  "department"      TEXT,
  "is_current"      BOOLEAN     NOT NULL DEFAULT true,
  "is_primary"      BOOLEAN     NOT NULL DEFAULT false,
  "start_date"      TIMESTAMPTZ,
  "end_date"        TIMESTAMPTZ,
  "source"          TEXT,
  "source_id"       TEXT,
  "source_metadata" JSONB,
  "last_synced_at"  TIMESTAMPTZ,
  "deleted_at"      TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PersonOrganization_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonOrganization_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "PersonOrganization_person_id_idx" ON "PersonOrganization"("person_id");
CREATE INDEX IF NOT EXISTS "PersonOrganization_person_id_is_primary_idx" ON "PersonOrganization"("person_id", "is_primary");
CREATE INDEX IF NOT EXISTS "PersonOrganization_person_id_is_current_idx" ON "PersonOrganization"("person_id", "is_current");
CREATE INDEX IF NOT EXISTS "PersonOrganization_deleted_at_idx" ON "PersonOrganization"("deleted_at");

-- 6. PersonUrl
CREATE TABLE IF NOT EXISTS "PersonUrl" (
  "id"              UUID        NOT NULL,
  "person_id"       UUID        NOT NULL,
  "url"             TEXT        NOT NULL,
  "type"            TEXT        NOT NULL DEFAULT 'other',
  "label"           TEXT,
  "source"          TEXT,
  "source_id"       TEXT,
  "source_metadata" JSONB,
  "last_synced_at"  TIMESTAMPTZ,
  "deleted_at"      TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PersonUrl_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonUrl_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "PersonUrl_person_id_idx" ON "PersonUrl"("person_id");
CREATE INDEX IF NOT EXISTS "PersonUrl_deleted_at_idx" ON "PersonUrl"("deleted_at");

-- 7. PersonEvent
CREATE TABLE IF NOT EXISTS "PersonEvent" (
  "id"              UUID        NOT NULL,
  "person_id"       UUID        NOT NULL,
  "type"            TEXT        NOT NULL DEFAULT 'other',
  "date"            TIMESTAMPTZ NOT NULL,
  "label"           TEXT,
  "source"          TEXT,
  "source_id"       TEXT,
  "source_metadata" JSONB,
  "last_synced_at"  TIMESTAMPTZ,
  "deleted_at"      TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PersonEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonEvent_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "PersonEvent_person_id_idx" ON "PersonEvent"("person_id");
CREATE INDEX IF NOT EXISTS "PersonEvent_deleted_at_idx" ON "PersonEvent"("deleted_at");

-- 8. PersonRelation
CREATE TABLE IF NOT EXISTS "PersonRelation" (
  "id"                UUID        NOT NULL,
  "person_id"         UUID        NOT NULL,
  "related_person_id" UUID,
  "related_text"      TEXT,
  "type"              TEXT        NOT NULL DEFAULT 'other',
  "source"            TEXT,
  "source_id"         TEXT,
  "source_metadata"   JSONB,
  "last_synced_at"    TIMESTAMPTZ,
  "deleted_at"        TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PersonRelation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonRelation_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE,
  CONSTRAINT "PersonRelation_related_person_id_fkey" FOREIGN KEY ("related_person_id") REFERENCES "Person"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "PersonRelation_person_id_idx" ON "PersonRelation"("person_id");
CREATE INDEX IF NOT EXISTS "PersonRelation_related_person_id_idx" ON "PersonRelation"("related_person_id");
CREATE INDEX IF NOT EXISTS "PersonRelation_deleted_at_idx" ON "PersonRelation"("deleted_at");

-- 9. PersonSkill
CREATE TABLE IF NOT EXISTS "PersonSkill" (
  "id"          UUID        NOT NULL,
  "person_id"   UUID        NOT NULL,
  "name"        TEXT        NOT NULL,
  "deleted_at"  TIMESTAMPTZ,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PersonSkill_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonSkill_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "PersonSkill_person_id_idx" ON "PersonSkill"("person_id");
CREATE INDEX IF NOT EXISTS "PersonSkill_deleted_at_idx" ON "PersonSkill"("deleted_at");

-- 10. PersonInterest
CREATE TABLE IF NOT EXISTS "PersonInterest" (
  "id"          UUID        NOT NULL,
  "person_id"   UUID        NOT NULL,
  "name"        TEXT        NOT NULL,
  "deleted_at"  TIMESTAMPTZ,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PersonInterest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonInterest_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "PersonInterest_person_id_idx" ON "PersonInterest"("person_id");
CREATE INDEX IF NOT EXISTS "PersonInterest_deleted_at_idx" ON "PersonInterest"("deleted_at");

-- 11. TagOnPerson (join table)
CREATE TABLE IF NOT EXISTS "TagOnPerson" (
  "person_id"  UUID        NOT NULL,
  "tag_id"     UUID        NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TagOnPerson_pkey" PRIMARY KEY ("person_id", "tag_id"),
  CONSTRAINT "TagOnPerson_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE,
  CONSTRAINT "TagOnPerson_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "TagOnPerson_tag_id_idx" ON "TagOnPerson"("tag_id");

-- 12. Data migration: move existing Person.email into PersonEmail rows
INSERT INTO "PersonEmail" ("id", "person_id", "email", "type", "is_primary", "source", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  p."id",
  p."email",
  'other',
  true,
  'migration_v5a',
  NOW(),
  NOW()
FROM "Person" p
WHERE p."email" IS NOT NULL AND p."email" != '';

-- 13. Audit log: write one entry per migrated person
INSERT INTO "AuditLog" ("id", "user_id", "entity_type", "entity_id", "action", "meta", "created_at")
SELECT
  gen_random_uuid(),
  p."user_id",
  'Person',
  p."id",
  'person_migrated_to_relational_v5a',
  jsonb_build_object('email_migrated', p."email" IS NOT NULL),
  NOW()
FROM "Person" p;

-- 14. Drop legacy flat columns from Person
ALTER TABLE "Person"
  DROP COLUMN IF EXISTS "email";
