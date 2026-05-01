# Runbook: Deploying CONCURRENTLY Migrations Without Downtime

**Applies to:** `20260430181042_add_raw_perf_indexes` and any future migration that uses `CREATE INDEX CONCURRENTLY`

---

## Background

PostgreSQL's `CREATE INDEX CONCURRENTLY` builds an index without holding an exclusive table lock, so reads and writes continue uninterrupted during the build. The trade-off is that PostgreSQL **forbids** `CREATE INDEX CONCURRENTLY` inside a transaction block (it raises `ERROR 25001: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`).

Prisma's `migrate deploy` command wraps every migration file in an implicit `BEGIN … COMMIT`. That works fine for normal DDL but breaks CONCURRENTLY index builds.

### How this project solves it — the transaction-escape pattern

The migration file `20260430181042_add_raw_perf_indexes/migration.sql` contains a deliberate `COMMIT` at the very top and a matching `BEGIN` at the very bottom:

```sql
COMMIT;          -- closes Prisma's implicit transaction

-- all CREATE INDEX CONCURRENTLY statements go here …

BEGIN;           -- opens a clean empty transaction
                 -- Prisma's own COMMIT closes it harmlessly
```

This pattern lets `prisma migrate deploy` run the file normally — Prisma never knows it stepped outside its transaction. **Do not remove or reorder these sentinel statements.**

---

## Deploying the migration in production

### Prerequisites

- You have `DIRECT_DATABASE_URL` (the non-pooled Neon connection string) available as an environment variable. This is already configured in Replit Secrets.
- The app can remain running throughout — no maintenance window is needed.

### Step-by-step procedure

1. **Verify pending migrations**

   ```bash
   npx prisma migrate status
   ```

   Confirm that `20260430181042_add_raw_perf_indexes` (or whichever CONCURRENTLY migration) is listed as **not yet applied**.

2. **Apply the migration**

   ```bash
   npx prisma migrate deploy
   ```

   Prisma will apply all pending migrations in order, including any CONCURRENTLY ones. Because of the transaction-escape pattern embedded in the SQL file, no table locks are taken during index builds. The command may take longer than usual (minutes vs. seconds) while indexes are built on live data — this is expected and safe.

3. **Verify the indexes exist**

   Connect to the database and run:

   ```sql
   SELECT indexname, tablename, indexdef
   FROM pg_indexes
   WHERE indexname IN (
     'Task_search_vector_gin_idx',
     'Task_user_id_status_partial_idx',
     'Task_user_id_due_date_partial_idx',
     'Task_user_id_defer_date_partial_idx',
     'Attachment_user_id_partial_idx',
     'Attachment_task_id_partial_idx',
     'Capture_user_id_partial_idx',
     'Tag_user_id_partial_idx',
     'Context_user_id_partial_idx',
     'ProjectFolder_user_id_partial_idx',
     'Project_user_id_status_partial_idx',
     'ChecklistItem_task_id_position_partial_idx',
     'TaskWorkLog_task_id_created_at_partial_idx'
   )
   ORDER BY tablename, indexname;
   ```

   All 13 rows should be returned. If any are missing, see **Troubleshooting** below.

4. **Confirm migration history**

   ```bash
   npx prisma migrate status
   ```

   All migrations should show as **applied**. If Prisma shows the migration as applied but an index is missing (rare), run the relevant `CREATE INDEX CONCURRENTLY IF NOT EXISTS` statement manually — `IF NOT EXISTS` makes it safe to re-run.

---

## Troubleshooting

### "Migration already applied but index missing"

Prisma marks a migration applied when the SQL file executes without error. If the process was interrupted mid-build, some indexes may be missing. Because all statements use `IF NOT EXISTS`, you can safely run the migration SQL again manually:

```bash
psql "$DIRECT_DATABASE_URL" -f prisma/migrations/20260430181042_add_raw_perf_indexes/migration.sql
```

Note: When running manually outside Prisma, the `COMMIT` / `BEGIN` sentinels at the top and bottom are harmless no-ops (the session is already in autocommit mode in psql).

### "Invalid index" state

PostgreSQL marks an index `INVALID` if a concurrent build is interrupted. Detect this with:

```sql
SELECT indexname, indisvalid
FROM pg_indexes
JOIN pg_class ON pg_class.relname = indexname
JOIN pg_index ON pg_index.indexrelid = pg_class.oid
WHERE NOT indisvalid;
```

Drop any invalid index and rebuild it:

```sql
DROP INDEX CONCURRENTLY IF EXISTS "<index_name>";
CREATE INDEX CONCURRENTLY IF NOT EXISTS "<index_name>" ON "<table>" …;
```

---

## Pattern for future CONCURRENTLY migrations

When you need to add a new index using `CREATE INDEX CONCURRENTLY` (or `DROP INDEX CONCURRENTLY`):

1. **Create a new Prisma migration file** (do not add CONCURRENTLY statements to an existing migration):

   ```bash
   npx prisma migrate dev --name <descriptive_name> --create-only
   ```

2. **Edit the generated SQL file** and apply the transaction-escape pattern:

   ```sql
   -- ╔══════════════════════════════════════════════════════╗
   -- ║  CONCURRENTLY MIGRATION — see docs/migrations/       ║
   -- ║  concurrently-index-runbook.md for full details.     ║
   -- ╚══════════════════════════════════════════════════════╝

   COMMIT;

   SET statement_timeout = 0;

   CREATE INDEX CONCURRENTLY IF NOT EXISTS "YourIndex_name"
     ON "YourTable"("your_column") WHERE your_condition;

   BEGIN;
   ```

3. **Do not use `SET LOCAL`** for any session settings inside the file — `SET LOCAL` requires an active transaction. Use bare `SET` instead (e.g., `SET statement_timeout = 0;`).

4. **All statements must use `IF NOT EXISTS` / `IF EXISTS`** so the migration is safe to re-run.

5. **Test locally** with `prisma migrate dev` before deploying. The transaction-escape pattern is safe in both dev and production.

6. **Document the new migration** with a comment block at the top of the SQL file similar to the one in `20260430181042_add_raw_perf_indexes/migration.sql`.

---

## CI/CD — no changes required

The GitHub Actions workflow at `.github/workflows/ci.yml` already runs `npx prisma migrate deploy` in both the `integration` and `e2e` jobs. No changes to those jobs are needed because:

- **CI databases are throwaway.** Both jobs spin up a fresh local Postgres 16 container. There is no live user traffic, so the "no exclusive lock" concern does not apply in CI — the migration completes quickly on an empty schema.
- **The transaction-escape pattern is self-contained.** The `COMMIT` / `BEGIN` sentinels in the SQL file work correctly regardless of whether Postgres is local or remote. CI has been validating this migration on every push since the migration was added.

There is no automated **production** deploy pipeline at this time. When a production pipeline is added, the only requirement is that the deploy step runs `npx prisma migrate deploy` with `DIRECT_DATABASE_URL` pointing to the non-pooled Neon connection. The transaction-escape pattern in the SQL file handles the rest — no extra flags or custom scripts are needed.

---

## Related documents

- `prisma/migrations/20260430181042_add_raw_perf_indexes/migration.sql` — reference implementation of the transaction-escape pattern
- `docs/migrations/2026-04-28-database-to-neon.md` — database connection setup and environment variables
