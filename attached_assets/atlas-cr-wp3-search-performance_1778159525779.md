# Replit Agent Prompt — Atlas CR: Search Performance (Audit WP3)

## Read this entire document before taking any action.

---

## 1. Overview

Tier-2 audit remediation. Closes four Medium-severity findings clustered around search performance. Effort M, Risk Low.

**Source:** `audit-reports/atlas-audit-2026-05-07.md` Work Package 3.

**Findings addressed:**
- **SO-1 / SH-1 / QP-2** — Note FTS computed inline at query time with no GIN index → full sequential scan as note count grows
- **SO-2 / QP-1** — ILIKE fallback for both notes and tasks runs without trigram indexes → full sequential scan when FTS returns no results

**The fix has three parts:**
1. Enable `pg_trgm` Postgres extension
2. Add GIN trigram indexes on the four ILIKE-target columns
3. Add a `search_vector` column to the `Note` model with trigger maintenance, mirroring the `task_search_vector_trigger` pattern; update Note FTS path to use it

**Estimated scope:** 3-5 days.

---

## 2. Stack constraints (do not deviate)

- Neon Postgres (supports `pg_trgm` extension)
- Prisma migrations are the source of schema truth
- Existing `task_search_vector_trigger` pattern is the reference for Note FTS
- TypeScript strict
- No major version dependency upgrades
- No CI changes
- The user-facing search behavior must not regress — what works today continues to work, just faster

---

## 3. Detailed deliverables

### 3.1 Enable `pg_trgm` extension

In a new Prisma migration:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

Neon supports `pg_trgm`; this is a no-op if already enabled, but include it for environment portability.

### 3.2 GIN trigram indexes for ILIKE fallbacks

Add four GIN indexes to support `ILIKE '%term%'` queries efficiently:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS note_title_trgm_idx
  ON "Note" USING GIN (title gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS note_body_text_trgm_idx
  ON "Note" USING GIN (body_text gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS task_title_trgm_idx
  ON "Task" USING GIN (title gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS task_notes_trgm_idx
  ON "Task" USING GIN (notes gin_trgm_ops)
  WHERE deleted_at IS NULL;
```

Notes:
- `CONCURRENTLY` to avoid locking the table during index creation
- Partial index (`WHERE deleted_at IS NULL`) — most queries filter out soft-deleted rows, so the index doesn't need to cover them, saving space
- These indexes are declared in raw SQL (Prisma's schema language doesn't directly support `gin_trgm_ops`); document them in the schema comment

#### 3.2.1 Schema-level documentation

Add a comment block at the top of `prisma/schema.prisma` documenting the manually-managed indexes:

```prisma
// MANUALLY MANAGED INDEXES (not declared in Prisma schema)
// — pg_trgm extension required (enabled via migration 20260507000000_pg_trgm)
// — GIN trigram indexes on:
//     - Note.title (note_title_trgm_idx)
//     - Note.body_text (note_body_text_trgm_idx)
//     - Task.title (task_title_trgm_idx)
//     - Task.notes (task_notes_trgm_idx)
//   All filtered to WHERE deleted_at IS NULL.
//   Used by ILIKE fallback paths in src/server/routers/search.ts
```

### 3.3 Note `search_vector` column and trigger

Mirror the existing `task_search_vector_trigger` pattern.

#### 3.3.1 Schema migration

```sql
-- Add search_vector column
ALTER TABLE "Note" ADD COLUMN search_vector tsvector;

-- Backfill existing rows
UPDATE "Note"
SET search_vector = to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(body_text, ''));

-- Create the trigger function
CREATE OR REPLACE FUNCTION note_search_vector_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.body_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Wire trigger on insert and update
CREATE TRIGGER note_search_vector_update
BEFORE INSERT OR UPDATE OF title, body_text ON "Note"
FOR EACH ROW EXECUTE FUNCTION note_search_vector_trigger();

-- GIN index on the new column
CREATE INDEX CONCURRENTLY IF NOT EXISTS note_search_vector_idx
  ON "Note" USING GIN (search_vector)
  WHERE deleted_at IS NULL;
```

#### 3.3.2 Prisma model update

```prisma
model Note {
  // ... existing fields
  search_vector  Unsupported("tsvector")?
  // ... rest
}
```

`Unsupported` because Prisma doesn't have a native `tsvector` type. The column is maintained by the trigger; client code reads it for FTS queries via raw SQL.

### 3.4 Update Note FTS query path

In `src/server/routers/search.ts:127` (or wherever Note FTS lives):

**Before:**
```ts
const notes = await db.$queryRaw`
  SELECT n.*, ts_rank(...) AS rank
  FROM "Note" n
  WHERE to_tsvector('english', COALESCE(n.body_text,'') || ' ' || COALESCE(n.title,''))
        @@ websearch_to_tsquery('english', ${query})
    AND n.user_id = ${userId}
    AND n.deleted_at IS NULL
  ORDER BY rank DESC
  LIMIT 50
`
```

**After:**
```ts
const notes = await db.$queryRaw`
  SELECT n.*, ts_rank(n.search_vector, websearch_to_tsquery('english', ${query})) AS rank
  FROM "Note" n
  WHERE n.search_vector @@ websearch_to_tsquery('english', ${query})
    AND n.user_id = ${userId}
    AND n.deleted_at IS NULL
  ORDER BY rank DESC
  LIMIT 50
`
```

The query planner now uses `note_search_vector_idx` instead of computing `to_tsvector` per row.

### 3.5 ILIKE fallback path remains, now indexed

The ILIKE fallback paths in `search.ts` for both notes and tasks do not change at the SQL level. The new GIN trigram indexes accelerate them automatically — the query planner picks them up because the WHERE clauses match the index expressions.

Verify with `EXPLAIN ANALYZE` on a representative ILIKE query:

```sql
EXPLAIN ANALYZE
SELECT * FROM "Note"
WHERE user_id = $1
  AND deleted_at IS NULL
  AND (title ILIKE '%foo%' OR body_text ILIKE '%foo%')
LIMIT 50;
```

Expected: index scan on `note_title_trgm_idx` or `note_body_text_trgm_idx`, not Seq Scan.

If the planner still chooses Seq Scan, run `ANALYZE "Note"` to update statistics.

### 3.6 Performance verification

Before / after measurements with at least 10,000 notes and 10,000 tasks (use the existing demo seed, `atlas-demo-seed.md`, scaled up if needed):

```sql
-- Note FTS
EXPLAIN ANALYZE
SELECT id, title FROM "Note"
WHERE user_id = $1 AND deleted_at IS NULL
  AND search_vector @@ websearch_to_tsquery('english', 'project')
ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', 'project')) DESC
LIMIT 50;

-- Note ILIKE
EXPLAIN ANALYZE
SELECT id, title FROM "Note"
WHERE user_id = $1 AND deleted_at IS NULL
  AND (title ILIKE '%proj%' OR body_text ILIKE '%proj%')
LIMIT 50;

-- Same for Task
```

Document the before/after timings in the PR description. Expected: order-of-magnitude improvement on both FTS and ILIKE paths.

---

## 4. Verification

1. Migration `20260XXX_pg_trgm_and_search_vector` exists and applies cleanly
2. `pg_trgm` extension enabled (`SELECT * FROM pg_extension WHERE extname = 'pg_trgm'` returns a row)
3. `note_title_trgm_idx`, `note_body_text_trgm_idx`, `task_title_trgm_idx`, `task_notes_trgm_idx` all exist
4. All four trigram indexes are partial: `WHERE deleted_at IS NULL`
5. `Note.search_vector` column exists with `tsvector` type
6. Trigger function `note_search_vector_trigger` exists
7. Trigger `note_search_vector_update` fires on INSERT and UPDATE OF title, body_text
8. Existing notes backfilled (`SELECT count(*) FROM "Note" WHERE search_vector IS NULL` returns 0)
9. `note_search_vector_idx` GIN index exists, partial on `deleted_at IS NULL`
10. Prisma schema includes `search_vector Unsupported("tsvector")?` on Note
11. Schema comment block documents manually-managed indexes
12. `src/server/routers/search.ts` Note FTS uses `n.search_vector` instead of inline `to_tsvector`
13. ILIKE fallback path unchanged at SQL level
14. `EXPLAIN ANALYZE` on Note FTS query shows index scan on `note_search_vector_idx`
15. `EXPLAIN ANALYZE` on Note ILIKE query shows index scan on a trigram index
16. `EXPLAIN ANALYZE` on Task FTS query shows index scan on existing `task_search_vector_idx` (unchanged)
17. `EXPLAIN ANALYZE` on Task ILIKE query shows index scan on a trigram index
18. Manual test: Note search returns expected results across both FTS and ILIKE paths
19. Manual test: Task search behavior unchanged (still works correctly)
20. Performance measurement documented in PR description (before/after)
21. `prisma generate` produces clean output
22. `npm run typecheck` passes
23. `npm test` passes (existing failures unchanged unless TC-1 has shipped first; in that case all tests pass)
24. `reattachOrphanData` test still passes — Note schema change doesn't affect orphan recovery

When all 24 verification steps pass, WP3 is complete.

---

## 5. Rules of engagement

### 5.1 `CONCURRENTLY` in production migrations

`CREATE INDEX CONCURRENTLY` doesn't lock the table but cannot run inside a transaction. Prisma migrations wrap statements in transactions by default. Use Prisma's `--create-only` workflow:

```bash
npx prisma migrate dev --create-only --name pg_trgm_and_search_vector
# Edit the generated SQL; remove BEGIN/COMMIT around CONCURRENTLY statements
npx prisma migrate dev
```

Or split into two migrations: one for schema changes (in transaction) and one for `CONCURRENTLY` index creates (outside transaction). Document the split in the migration files.

### 5.2 Backfill must complete before the trigger is wired

Order matters in the migration:
1. Add the column
2. Backfill existing rows
3. Create the trigger function
4. Wire the trigger on the table
5. Create the GIN index

If you wire the trigger before the backfill, the backfill UPDATE will fire the trigger on every row — wasteful but not incorrect. If you create the index before the backfill, the index sits empty until the backfill populates the column. Either is acceptable; the order above is preferred for clarity.

### 5.3 Don't touch the existing Task FTS pattern

The Task `search_vector` and trigger already exist and work. This CR mirrors that pattern for Note. Do not refactor Task to "improve consistency" — leave it.

### 5.4 ILIKE fallback stays as a fallback

The audit's SO-2 noted Option B: "Remove the ILIKE fallback entirely and rely on FTS only." Don't take Option B in this CR. ILIKE handles partial-word and typo-tolerant matches that FTS doesn't. The audit's recommendation was Option A (add indexes), and that's what this CR does.

### 5.5 Don't introduce a new ranking algorithm

Atlas's current FTS uses Postgres `ts_rank`. Don't switch to `ts_rank_cd` or a custom ranking function in this CR. Performance improvement is the goal; ranking is unchanged.

### 5.6 `gin_trgm_ops` is the right operator class

Some references mix `gin_trgm_ops` and `gist_trgm_ops`. GIN is faster for read-heavy workloads (Atlas's pattern) at the cost of slower writes. GiST is better for write-heavy workloads. Atlas reads search far more than it writes, so GIN is correct.

---

## 6. What is NOT in this CR

- **Trigram indexes on Person, Capture, Project, or other tables** — only the four columns in current ILIKE search paths
- **Search ranking algorithm changes** — `ts_rank` stays
- **Search UX changes** — same routes, same response shape, faster
- **Removing the ILIKE fallback** — it stays
- **Indexes on JSON columns** — flagged in audit SH-2, separate CR
- **Cross-table search** — out of scope
- **Vector embeddings / semantic search** — out of scope
- **Adjusting the existing Task `search_vector` setup** — leave it

---

## 7. Recommended sequence

1. Write the migration SQL in a `--create-only` migration
2. Inspect the SQL; confirm `CONCURRENTLY` statements are outside transaction blocks
3. Apply migration in dev; verify all indexes and trigger exist
4. Update Prisma schema with `search_vector Unsupported("tsvector")?` on Note
5. Run `prisma generate`
6. Update `src/server/routers/search.ts` Note FTS path
7. Capture baseline `EXPLAIN ANALYZE` output for the four target queries
8. Verify all four queries now use index scans
9. Performance measurement at scale (use scaled demo seed)
10. Document before/after in PR description

---

## 8. Final note

Search performance is the kind of work where the wrong shape (e.g., wrong operator class, missing partial filter, expression vs column index) silently underperforms while looking healthy in dev with small datasets. The verification step that runs `EXPLAIN ANALYZE` on the actual queries is the load-bearing check — confirm with output, not assumption.

Begin with section 3.1 (the migration).
