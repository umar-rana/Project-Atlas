# Replit Agent Prompt — Atlas Database Migration to Neon

## Read this entire prompt before taking any action.

---

## 1. Context

Atlas currently runs against Replit's managed Postgres (which uses Neon under the hood, but inside Replit's account boundary). The user is preparing to invite family and friends as external users via Clerk, and wants to migrate the database to their own Neon project before that happens. This ensures data ownership, independence from Replit's hosting choices, and proper backup story.

**This prompt covers database migration only.** Object Storage migration (to Cloudflare R2) is a separate future task and must NOT be attempted in this session.

---

## 2. Pre-requisites — user actions before agent starts

The user has completed these setup steps:

- [x] Neon account created with a new Neon project
- [x] Neon credentials rotated (the connection string previously shared in chat is no longer valid; new password is in use)
- [x] Both connection strings retrieved from Neon dashboard and added to Replit Secrets:
  - `NEON_DATABASE_URL_POOLED` — pooled connection (hostname contains `-pooler`), for application runtime
  - `NEON_DATABASE_URL_DIRECT` — direct connection (no `-pooler`), for migrations and admin operations

### Important: about the Replit Postgres connection string

The current Replit Postgres connection (`DATABASE_URL`) is auto-injected by Replit's infrastructure and does NOT appear in the Secrets UI. This means:

1. **The user cannot manually create `REPLIT_DATABASE_URL_BACKUP`** — there's nothing visible to copy from
2. **The agent must capture the connection string at runtime** as the first step of the migration (reading `process.env.DATABASE_URL`)
3. **The agent will display the captured value to the user**, who then manually adds it to Replit Secrets as `REPLIT_DATABASE_URL_BACKUP` via the Secrets UI
4. **Replit's auto-injection cannot be overridden** by user-created secrets with the same name. This means after migration, the application code must reference a different env var name (e.g., `DATABASE_URL_NEON`) for the Neon connection. Section 8 handles this code change.

This adjustment is necessary because Replit manages `DATABASE_URL` at the infrastructure level, not as a user-editable secret.

---

## 3. Migration plan overview

The migration follows a careful add-verify-switch-preserve pattern:

1. Inventory current database (row counts per table)
2. Dump current database to a file
3. Restore dump to Neon
4. Verify Neon matches original (row counts, sample data, schema)
5. Switch application to Neon
6. User verifies the live application works
7. Preserve Replit Postgres and dump file as rollback for 7+ days
8. Decommission Replit Postgres only after stable use confirmed

**Critical principle:** the old data is never deleted until the new data is verified working in production for at least one week.

---

## 4. Pre-migration verification

### 4.1 Confirm Atlas is healthy

Before any migration steps:

1. Check `/admin/health` shows all green
2. Confirm with the user: "Atlas is currently working correctly, no errors, all features functional?"
3. If anything is broken, fix it first. Migrating a broken application makes diagnosing post-migration issues impossible.

### 4.2 Capture inventory of current data

Run a comprehensive row-count query against the current database. Save the output to a file `migration-inventory-pre.txt`:

```sql
SELECT 'User' as table_name, COUNT(*) as row_count FROM "User"
UNION ALL SELECT 'Session', COUNT(*) FROM "Session"
UNION ALL SELECT 'AuditLog', COUNT(*) FROM "AuditLog"
UNION ALL SELECT 'IntegrationToken', COUNT(*) FROM "IntegrationToken"
UNION ALL SELECT 'SyncState', COUNT(*) FROM "SyncState"
UNION ALL SELECT 'RateLimitTracker', COUNT(*) FROM "RateLimitTracker"
UNION ALL SELECT 'AICallLog', COUNT(*) FROM "AICallLog"
UNION ALL SELECT 'Attachment', COUNT(*) FROM "Attachment"
UNION ALL SELECT 'DriveConfig', COUNT(*) FROM "DriveConfig"
UNION ALL SELECT 'Task', COUNT(*) FROM "Task"
UNION ALL SELECT 'Project', COUNT(*) FROM "Project"
UNION ALL SELECT 'Context', COUNT(*) FROM "Context"
UNION ALL SELECT 'ContextOnTask', COUNT(*) FROM "ContextOnTask"
UNION ALL SELECT 'Tag', COUNT(*) FROM "Tag"
UNION ALL SELECT 'TagOnTask', COUNT(*) FROM "TagOnTask"
ORDER BY table_name;
```

If Wave 3b (folders) is in: also count `ProjectFolder`.
If Wave 3c (capture intelligence) is in: also count `EmailCapture`, `CaptureParseLog`.

These counts are the baseline for post-migration verification. Show them to the user before proceeding.

### 4.3 Capture sample identity data

Save the current user's identity record for spot-check verification:

```sql
SELECT id, email, name, clerk_user_id, timezone, created_at FROM "User";
```

Save the output. Post-migration, this exact record must exist with identical fields.

### 4.4 Announce maintenance window

Get explicit confirmation from the user: **"I'm ready to start the migration. No one is using Atlas right now and I won't capture or edit anything until you confirm we're switched over."**

This is critical because any writes to the old database during the migration window will be lost (they won't be in the dump). For a single-user phase this is straightforward, but with family/friends starting to join, coordinate with them too.

### 4.5 Capture and back up the current DATABASE_URL

Since Replit auto-injects `DATABASE_URL` and the user cannot see it in the Secrets UI, the agent must capture it at runtime and surface it to the user for backup.

1. Read the current value of `process.env.DATABASE_URL` from the running application context. This can be done via a simple Node script:

   ```bash
   node -e "console.log(process.env.DATABASE_URL)"
   ```

   Or via a temporary tRPC procedure / API endpoint that returns the value.

2. **Critical:** Do NOT log this value to the console output that gets persisted (e.g., into git, into a file that gets committed). Display it to the user *only* in the chat output, then immediately instruct the user to:

   a. Copy the displayed connection string
   b. Open Replit Secrets UI
   c. Create a new secret named `REPLIT_DATABASE_URL_BACKUP` with the copied value as its value
   d. Confirm to the agent: "REPLIT_DATABASE_URL_BACKUP is now in Replit Secrets"

3. After the user confirms, the agent should clear the connection string from any visible chat output if possible (note: this may not be technically possible to retract from chat history, but the agent should not echo it again).

4. The agent verifies the backup is in place by reading `process.env.REPLIT_DATABASE_URL_BACKUP` and confirming it matches the original `DATABASE_URL` (without echoing the actual value — just verify the values match):

   ```bash
   node -e "console.log(process.env.DATABASE_URL === process.env.REPLIT_DATABASE_URL_BACKUP ? 'backup matches' : 'MISMATCH')"
   ```

5. Only after the backup is verified in place, proceed to section 5.

**Why this matters:** if the migration fails partway and the original `DATABASE_URL` is lost or unrecoverable from Replit's interface, this backup is the only path to restoring the working state. The few minutes of friction here prevent a potentially unrecoverable data situation.

---

## 5. Database dump

### 5.1 Run pg_dump

Use the Replit Postgres connection (the existing `DATABASE_URL` env var) and dump to a file:

```bash
pg_dump --no-owner --no-acl --clean --if-exists \
  --schema=public \
  --format=custom \
  -f /tmp/atlas_pre_neon_migration.dump \
  "$DATABASE_URL"
```

Flag explanation:
- `--no-owner --no-acl`: don't include ownership/permission info that won't transfer cleanly between Postgres instances
- `--clean --if-exists`: dump includes DROP statements so restore is idempotent
- `--schema=public`: only dump the public schema (where Prisma puts everything)
- `--format=custom`: efficient binary format, supports `pg_restore` flexibility

### 5.2 Verify dump file

```bash
ls -lh /tmp/atlas_pre_neon_migration.dump
```

The file should be a few MB at minimum (more if attachments table has rows, though attachments themselves are in object storage, not the database). If the file is suspiciously small (under 100KB), something went wrong with the dump.

### 5.3 Save the dump permanently

The dump file in `/tmp/` may be wiped by Replit between sessions. Move it somewhere persistent:

```bash
mkdir -p /home/runner/atlas-migration-backups
mv /tmp/atlas_pre_neon_migration.dump /home/runner/atlas-migration-backups/atlas_pre_neon_migration_$(date +%Y%m%d_%H%M%S).dump
```

Document the path. This file is the rollback artifact and must be preserved through Phase A's stability window (at least 7 days post-migration).

---

## 6. Restore to Neon

### 6.1 Use the direct connection

For `pg_restore`, use `NEON_DATABASE_URL_DIRECT`, NOT the pooled one. The pooler doesn't support all operations needed for a full restore.

### 6.2 Run pg_restore

```bash
pg_restore --no-owner --no-acl --clean --if-exists \
  --dbname="$NEON_DATABASE_URL_DIRECT" \
  /home/runner/atlas-migration-backups/atlas_pre_neon_migration_*.dump
```

Watch for errors:
- Warnings about extension creation: usually fine; Neon may already have extensions enabled
- Warnings about role/permission grants: expected since we used `--no-owner --no-acl`
- Actual errors (ERROR or FATAL prefix): STOP and investigate

If the restore fails or shows actual errors, do not proceed. Diagnose, fix, retry. The application is still running on Replit Postgres at this point — there's no rush.

### 6.3 Handle pgvector extension if present

If Atlas's schema uses `pgvector` (the embedding column on Notes/Tasks for future semantic search):

1. Verify pgvector is enabled in the Neon project. In Neon dashboard → SQL Editor, run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
2. If the extension wasn't enabled before the restore, the restore may have warned about this. Re-run the restore after enabling it.

---

## 7. Post-restore verification (still on Replit Postgres for the app)

### 7.1 Row count comparison

Run the same inventory query against `NEON_DATABASE_URL_DIRECT`. Compare to `migration-inventory-pre.txt`.

**Every row count must match exactly.** No exceptions. If any table differs:

- STOP
- Investigate why
- Do not proceed to switching the application

Common causes of mismatch:
- Restore was interrupted
- Some tables were excluded
- Foreign key constraints prevented some rows from inserting

### 7.2 Sample data verification

Spot-check a few records to confirm data integrity:

```sql
-- User records (most critical, since Clerk depends on these)
SELECT id, email, clerk_user_id, timezone FROM "User";

-- Recent tasks
SELECT id, title, project_id, created_at FROM "Task" 
ORDER BY created_at DESC LIMIT 5;

-- Recent audit log entries
SELECT entity_type, action, created_at FROM "AuditLog" 
ORDER BY created_at DESC LIMIT 5;
```

The User records especially must match exactly — same `clerk_user_id`, same email. If User records didn't migrate correctly, Clerk authentication will create orphan accounts and everything breaks.

### 7.3 Schema verification

Confirm the schema is intact:

```sql
-- All tables present
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;

-- All indexes present
SELECT tablename, indexname FROM pg_indexes 
WHERE schemaname = 'public' ORDER BY tablename;

-- tsvector columns populated (search depends on this)
SELECT id, title, search_vector IS NOT NULL as has_search_vector 
FROM "Task" LIMIT 5;
```

If any indexes are missing or tsvector columns are null where they shouldn't be, search and queries will be slow or broken after migration.

### 7.4 Show the user verification results

Before proceeding, present to the user:
- Row count comparison (pre vs post): all matched ✓
- Sample User record (Clerk ID intact): ✓
- Index count: matches expected ✓
- tsvector populated: ✓

Get explicit confirmation: **"Verification looks good, proceed with switching the application."**

---

## 8. Switch the application to Neon

### 8.1 Determine the env var strategy

Replit auto-injects `DATABASE_URL` pointing to its managed Postgres. The user cannot override this directly via Secrets UI — Replit's injection takes precedence over user-defined secrets with the same name.

The clean solution is a small code change: the application reads `DATABASE_URL_NEON` if set, otherwise falls back to `DATABASE_URL`. This way:

- `DATABASE_URL` continues to point to Replit Postgres (auto-injected, untouchable)
- `DATABASE_URL_NEON` is set by the user and takes precedence in the application
- Rollback is trivial: delete `DATABASE_URL_NEON` and the app falls back to Replit Postgres

**Required code changes:**

In `prisma/schema.prisma`, update the datasource:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL_NEON")  // Will be set by user in Secrets
  directUrl = env("DIRECT_DATABASE_URL_NEON")  // Will be set by user in Secrets
}
```

Wait — Prisma can't conditionally fall back at the datasource level. The datasource block is static. We need a different approach.

**Revised approach:** use a runtime helper that selects the correct URL.

Create or update `lib/db/connection.ts`:

```typescript
// Returns the database URL the app should use:
// - DATABASE_URL_NEON if set (post-migration)
// - DATABASE_URL otherwise (pre-migration, Replit-injected)
export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL_NEON ?? process.env.DATABASE_URL ?? ''
}

export function getDirectDatabaseUrl(): string {
  return process.env.DIRECT_DATABASE_URL_NEON ?? process.env.DATABASE_URL ?? ''
}
```

Update wherever Prisma is instantiated (typically `lib/db/prisma.ts` or `server/db.ts`):

```typescript
import { PrismaClient } from '@prisma/client'
import { getDatabaseUrl } from './connection'

export const prisma = new PrismaClient({
  datasources: {
    db: { url: getDatabaseUrl() }
  }
})
```

For Prisma's `directUrl` (used by migrations only), the schema file's `directUrl` field reads from a specific env var. Since we can't conditionally pick env vars in the schema, set `DIRECT_DATABASE_URL` env var in Replit Secrets to the Neon direct URL when migration happens, and revert it for rollback.

In `prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")  // Overridden at runtime by getDatabaseUrl() when DATABASE_URL_NEON is set
  directUrl = env("DIRECT_DATABASE_URL")  // For Prisma migrations
}
```

### 8.2 Set the new environment variables

In Replit Secrets, the user creates these new secrets:

- `DATABASE_URL_NEON` = value of `NEON_DATABASE_URL_POOLED`
- `DIRECT_DATABASE_URL_NEON` = value of `NEON_DATABASE_URL_DIRECT`
- `DIRECT_DATABASE_URL` = value of `NEON_DATABASE_URL_DIRECT` (for Prisma migrations)

The auto-injected `DATABASE_URL` remains pointing to Replit Postgres — that's fine; the runtime helper now ignores it because `DATABASE_URL_NEON` is set.

`REPLIT_DATABASE_URL_BACKUP` (created in step 4.5) is preserved untouched.

### 8.3 Restart the application

Restart Atlas. The next startup will:
- Read `DATABASE_URL_NEON` via `getDatabaseUrl()` → connect to Neon
- Replit Postgres remains unused but available

### 8.4 Immediate health check

The agent should immediately verify:

1. Application started without database connection errors
2. `/admin/health` endpoint responds with 200
3. Database health check shows green (connecting to Neon)
4. Spot-check a query that returns data: e.g., `SELECT COUNT(*) FROM "User"` should return the expected count

If any of these fail, ROLLBACK immediately:
- Delete the `DATABASE_URL_NEON` secret in Replit Secrets
- Application restart will fall back to `DATABASE_URL` (Replit Postgres)
- Confirm app is healthy on Replit Postgres again
- Investigate what went wrong before re-attempting

This rollback path is much cleaner than swapping connection strings, which is one benefit of the env var precedence approach.

---

## 9. User verification (the live application)

The user — not the agent — must verify the live application works correctly. The agent presents this verification checklist:

1. **Sign out and sign back in** — tests Clerk → User table lookup against Neon. If the same User record is resolved (same name, same preferences), Clerk integration is intact.

2. **Open `/admin/health`** — all green checks. Database, Auth, Storage, Drive, AI all show operational.

3. **Open Tasks → Inbox** — existing tasks visible. Counts match what you remember.

4. **Capture a new task**: "Test capture after Neon migration #migration"
   - Toast appears within 500ms ("Captured to Inbox")
   - Task appears in Inbox with `#migration` tag
   - Open the task → inspector shows it correctly with metadata

5. **Complete the new task** → completion persists. Refresh page → still completed.

6. **Open Settings**:
   - Profile shows correct name, email, timezone
   - Theme preference intact
   - Drive linking still active (path correct)
   - AI confidence threshold (if Wave 3c shipped) intact

7. **Search via Cmd+K** — type something that should return a task. Results appear (verifies tsvector search works on Neon).

8. **Open a project with tasks** — tasks visible, can drag-reorder, can edit inline.

9. **Forecast view** (if Wave 3b shipped) — shows tasks distributed by date.

10. **Capture an attachment**: drag a small image into a task or note. Upload should still work — note that this still hits Replit Object Storage (which we're keeping). Verify image displays correctly.

The user runs through all 10 steps. Wait for explicit confirmation: **"All 10 steps verified. Atlas is working correctly on Neon."**

---

## 10. Document the migration

Create `/docs/migrations/2026-XX-XX-database-to-neon.md` (or appropriate path):

```markdown
# Database Migration: Replit Postgres → Neon

**Date:** [actual date]
**Reason:** Data ownership and independence before inviting external users via Clerk.

## What changed
- Database moved from Replit's managed Postgres to user-owned Neon project
- Application connects via pooled connection string at runtime
- Migrations use direct connection string

## Connection strings
- Runtime: `DATABASE_URL` env var → Neon pooled connection
- Migrations: `DIRECT_DATABASE_URL` env var → Neon direct connection
- Old Replit Postgres connection: preserved as `REPLIT_DATABASE_URL_BACKUP` until [date + 7 days]

## Rollback procedure (if needed within first 7 days)

The env var precedence approach makes rollback cleaner than the original plan:

1. In Replit Secrets, **delete** the `DATABASE_URL_NEON` secret (or rename it temporarily to disable it)
2. The runtime helper `getDatabaseUrl()` will now fall back to `DATABASE_URL` (Replit Postgres, still auto-injected and intact)
3. Set `DIRECT_DATABASE_URL` back to whatever value Replit Postgres uses (it's the same as `DATABASE_URL` for Replit's managed instance — refer to `REPLIT_DATABASE_URL_BACKUP` if needed)
4. Restart application
5. Verify /admin/health shows database connected to Replit Postgres
6. Investigate the issue that caused rollback before re-attempting Neon migration

`REPLIT_DATABASE_URL_BACKUP` is preserved as the source of truth for the original connection string in case Replit's auto-injection ever needs to be manually reconstructed.

The dump file at `/home/runner/atlas-migration-backups/atlas_pre_neon_migration_[timestamp].dump` is the original data state and can be restored if needed (e.g., if data was lost in some scenario).

## Decommission plan
- Replit Postgres remains active for 7 days minimum after migration
- Dump file preserved indefinitely
- After 7 days of stable Neon use: Replit Postgres can be stopped/deleted via Replit dashboard
- Dump file retained as historical artifact

## Verification at migration time
- Pre-migration row counts: [paste from migration-inventory-pre.txt]
- Post-migration row counts: [paste — must match exactly]
- All 10 user verification steps: PASSED [date]
```

---

## 11. Post-migration monitoring (next 7 days)

For one week after migration:

1. The user should use Atlas normally and watch for any database-related issues
2. Specifically watch for:
   - Slow queries (Neon's free tier has compute limits; if performance degrades, may need to upgrade plan)
   - Connection pool exhaustion (rare but possible if many concurrent operations)
   - Search not returning results (tsvector issues)
   - Any sign-in problems (Clerk → User lookup)
3. The agent (in future sessions) should ask: "How has the database performed since migration?" before doing major work

If issues surface, the rollback path is open. Don't decommission Replit Postgres until 7 days have passed without issues.

---

## 12. Rules of engagement

### 12.1 Old data is never deleted prematurely

- Replit Postgres stays active for 7+ days after migration
- Dump file preserved indefinitely
- `REPLIT_DATABASE_URL_BACKUP` secret retained until decommission
- Rollback path remains open the entire window

### 12.2 Connection string discipline

- **Pooled** connection (`-pooler` in hostname) → application runtime via `DATABASE_URL`
- **Direct** connection (no `-pooler`) → migrations and pg_restore via `DIRECT_DATABASE_URL`
- Confusing these causes intermittent failures that are hard to diagnose

### 12.3 Don't break Clerk integration

The `clerk_user_id` field on User records MUST survive the migration intact. Verification specifically checks this. If User records didn't migrate correctly, sign-in will create orphan records and break everything.

### 12.4 No Object Storage work in this session

This session is database only. Cloudflare R2 migration is a future, separate task. Even if the user asks "while we're at it, can we do storage too?", politely decline and explain that bundling them increases risk and makes diagnosing issues harder.

### 12.5 Stop and ask if anything is unclear

If at any step something doesn't match expectations:
- Row counts don't match
- Schema looks different
- An error occurs during restore
- The application doesn't start cleanly

Stop. Show the user what's happening. Get input before continuing. The migration window is not a place to improvise.

### 12.6 Credential hygiene

Never echo connection strings (which contain passwords) in logs, comments, or chat output. Reference them by environment variable name only. If you need to confirm a connection string is set, check that the env var is non-empty, don't print its value.

---

## 13. Definition of Done

The migration is complete when:

- [ ] Pre-migration inventory captured and shown to user
- [ ] Maintenance window confirmed by user
- [ ] Database dump created and saved to persistent location
- [ ] Restore to Neon completed without errors
- [ ] Post-restore row counts match pre-migration exactly
- [ ] Sample User records verified (Clerk ID intact)
- [ ] Schema and indexes verified
- [ ] Application switched to Neon (pooled URL)
- [ ] Prisma config updated with directUrl if needed
- [ ] Application starts without errors
- [ ] /admin/health shows green
- [ ] All 10 user verification steps pass
- [ ] Migration documented in /docs/migrations/
- [ ] Rollback procedure documented and tested mentally
- [ ] Replit Postgres preserved for 7+ days
- [ ] Dump file preserved permanently

After 7 days of stable use:
- [ ] User confirms no issues encountered
- [ ] Replit Postgres can be decommissioned
- [ ] `REPLIT_DATABASE_URL_BACKUP` secret can be removed

---

## 14. What's NOT in this session

Do not do any of the following:

- Migrate Object Storage to Cloudflare R2 (future, separate task)
- Modify any application code beyond connection string updates
- Add new schema migrations during this window
- Build new features
- Address unrelated bugs
- Decommission Replit Postgres immediately (must wait 7 days)
- Delete the dump file
- Optimize or modify Neon's database settings beyond what's needed for migration

If asked to do any of these, decline and explain that this session is database migration only.

---

## 15. Final note

This migration moves Atlas's most valuable data — every user's tasks, projects, journals, audit history — from Replit's account boundary to the user's own Neon project. After this, Atlas's data lives where the user has direct ownership and control.

The discipline of keeping both copies for a week is what makes this safe. Take the time. Verify thoroughly. Don't rush.

Begin with section 4.1.
