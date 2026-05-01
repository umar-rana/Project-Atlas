-- Normalize date_format from legacy lowercase-dash format to canonical uppercase-slash format
-- so it matches the LOCALE_PRESETS constants used throughout the codebase.

-- Set column default to the canonical preset value
ALTER TABLE "User" ALTER COLUMN "date_format" SET DEFAULT 'DD/MM/YYYY';

-- Backfill existing rows that still carry the legacy default
UPDATE "User"
SET "date_format" = 'DD/MM/YYYY'
WHERE "date_format" = 'dd-mm-yyyy';
