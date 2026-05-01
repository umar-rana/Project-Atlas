-- Add language field to User for locale-aware weekday and month name translation.
-- Default is 'ur' (Urdu) to match the Pakistan locale_preset default.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'ur';

-- Non-Pakistan-preset users default to English names.
UPDATE "User"
SET    "language" = 'en'
WHERE  "locale_preset" IN ('us', 'uk', 'custom')
  AND  "language" = 'ur';
