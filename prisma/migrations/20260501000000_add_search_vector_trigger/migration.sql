-- Create a trigger function that keeps search_vector in sync with title + notes.
-- search_vector stores the raw concatenated text; the GIN index expression
-- (to_tsvector('english', COALESCE(search_vector,''))) wraps it so queries
-- that use the same expression hit the index rather than doing a full scan.

CREATE OR REPLACE FUNCTION task_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := coalesce(NEW.title, '') || ' ' || coalesce(NEW.notes, '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fire BEFORE INSERT OR UPDATE so the column is always current.
-- Only watches the columns that feed into the vector (avoids unnecessary work
-- when other columns like updated_at change).
DROP TRIGGER IF EXISTS task_search_vector_trigger ON "Task";
CREATE TRIGGER task_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, notes
  ON "Task"
  FOR EACH ROW EXECUTE FUNCTION task_search_vector_update();

-- Backfill existing rows so the column is populated for every task created
-- before this migration ran.
UPDATE "Task"
SET search_vector = coalesce(title, '') || ' ' || coalesce(notes, '');
