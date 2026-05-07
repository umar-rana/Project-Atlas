-- Enable pg_trgm extension for trigram-based ILIKE indexes on Note and Task.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add persisted search_vector column to Note.
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Backfill existing rows so no row has search_vector IS NULL.
UPDATE "Note"
SET search_vector = to_tsvector('english',
  COALESCE(title, '') || ' ' || COALESCE(body_text, ''))
WHERE search_vector IS NULL;

-- Trigger function: keeps search_vector in sync on INSERT or UPDATE of title/body_text.
CREATE OR REPLACE FUNCTION note_search_vector_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.body_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Wire the trigger.
DROP TRIGGER IF EXISTS note_search_vector_trigger ON "Note";
CREATE TRIGGER note_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, body_text
  ON "Note"
  FOR EACH ROW EXECUTE FUNCTION note_search_vector_trigger();
