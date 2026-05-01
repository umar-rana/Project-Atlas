-- Fix Note.body_json column default to match schema.prisma definition
-- The column was renamed from 'body' (default '') to 'body_json' but default was not updated.
ALTER TABLE "Note" ALTER COLUMN "body_json" SET DEFAULT '{}';
