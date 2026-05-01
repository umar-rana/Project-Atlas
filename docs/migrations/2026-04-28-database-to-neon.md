# Database Migration: Replit Postgres → Neon

**Date:** 2026-04-28  
**Performed by:** Atlas agent (task #102)  
**Status:** Complete ✅

---

## What Changed

Atlas's PostgreSQL database was migrated from Replit's managed Postgres (Helium) to the user's own Neon project. This gives full data ownership and independence before opening Atlas to external users via Clerk.

Object Storage (Cloudflare R2) was explicitly out of scope and was not touched.

---

## Environment Variables in Use (Post-Migration)

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL_NEON` | Runtime connection (pooled) | Used by Prisma at app runtime via `resolveDbUrl()` |
| `DATABASE_URL` | Replit Postgres (original) | Unchanged; fallback if `DATABASE_URL_NEON` is removed |
| `REPLIT_DATABASE_URL_BACKUP` | Replit Postgres backup reference | Keep until 2026-05-05 at minimum |
| `NEON_DATABASE_URL_POOLED` | Original Neon pooled secret | Source of truth for `DATABASE_URL_NEON` |
| `NEON_DATABASE_URL_DIRECT` | Original Neon direct secret | Kept for reference (non-pooled connection) |

---

## Code Changes

### `src/core/db/index.ts`
- Added `resolveDbUrl()` helper that reads `DATABASE_URL_NEON ?? DATABASE_URL` and strips any surrounding single-quote characters. This was needed because Replit's Secrets UI preserved the surrounding quotes that were accidentally included when the secrets were first entered; the same issue was observed on both the pooled and direct URLs. The stripping is single-quote only — double quotes are untouched.
- Updated `createPrismaClient()` to pass `datasources.db.url` explicitly using `resolveDbUrl()`. Removing `DATABASE_URL_NEON` from Secrets instantly reverts the app to Replit Postgres.

### `prisma/schema.prisma`
- Added a `directUrl` to the datasource block to support Prisma migrations against Neon's direct (non-pooled) connection. This `directUrl` was subsequently removed (task #184) as migrations run cleanly through the pooled connection.

---

## Row Counts: Pre vs Post Migration

| Table | Pre-Migration | Post-Migration | Match |
|---|---|---|---|
| User | 1 | 1 | ✅ |
| AuditLog | 1 | 1 | ✅ |
| AICallLog | 0 | 0 | ✅ |
| Attachment | 0 | 0 | ✅ |
| Capture | 0 | 0 | ✅ |
| CaptureParseLog | 0 | 0 | ✅ |
| Context | 0 | 0 | ✅ |
| ContextOnTask | 0 | 0 | ✅ |
| DriveConfig | 0 | 0 | ✅ |
| EmailCapture | 0 | 0 | ✅ |
| IntegrationToken | 0 | 0 | ✅ |
| Person | 0 | 0 | ✅ |
| Project | 0 | 0 | ✅ |
| ProjectFolder | 0 | 0 | ✅ |
| RateLimitTracker | 0 | 0 | ✅ |
| SyncState | 0 | 0 | ✅ |
| Tag | 0 | 0 | ✅ |
| TagOnTask | 0 | 0 | ✅ |
| Task | 0 | 0 | ✅ |

**All 19 tables matched exactly.**

User identity verified: `umar@insightive.org` (id: `019dcebe-15bf-7cdc-a679-268afecd67fc`) — correct in Neon.

---

## Dump File

- **Path:** `/home/runner/atlas-migration-backups/atlas_pre_neon_migration_20260428_083012.dump`
- **Format:** pg_dump custom format (`--format=custom`)
- **Size:** 54 KB
- **Flags used:** `--no-owner --no-acl --clean --if-exists --schema=public`

> **Note on dump size:** The migration runbook specified >100 KB as a sanity threshold for a database with meaningful user data. At migration time, Atlas had only 1 User row and 1 AuditLog row — all other tables were empty. A 54 KB dump is the correct and expected size for a full schema with minimal data. The threshold is a guard against accidentally dumping an empty database; it does not apply here since the schema (tables, indexes, constraints, Prisma migration history) was fully captured and verified via the post-restore row-count comparison.

---

## Post-Switch Validation (User Checklist)

Completed by user on 2026-04-28 after the switch to Neon:

| # | Check | Result |
|---|---|---|
| 1 | Sign out and sign back in | ✅ |
| 2 | `/admin/health` all green | ✅ |
| 3 | Inbox view loads | ✅ |
| 4 | Capture a new task | ✅ |
| 5 | Mark task complete | ✅ |
| 6 | Settings page loads | ✅ |
| 7 | Search works | ✅ |
| 8 | Project view loads | ✅ |
| 9 | Forecast view loads | ✅ |
| 10 | Attachment UI | ⚠️ Out of scope — Attachments use Replit Object Storage, which was explicitly excluded from this migration. Separate future task. |

**9/9 database-dependent checks passed.**

---

## Rollback Procedure

If anything goes wrong, reverting to Replit Postgres is instant and requires no code change:

1. Go to Replit Secrets
2. Delete the secret `DATABASE_URL_NEON`
3. Restart the "Start application" workflow

The app will immediately fall back to `DATABASE_URL` (Replit Postgres) because `resolveDbUrl()` uses `DATABASE_URL_NEON ?? DATABASE_URL`.

The original Replit Postgres connection string is preserved in `REPLIT_DATABASE_URL_BACKUP`.

---

## Decommission Timeline

- **Keep Replit Postgres intact until:** 2026-05-05 (7 days minimum)
- **After that:** The `DATABASE_URL`, `REPLIT_DATABASE_URL_BACKUP` secrets can be deleted once confirmed no longer needed.
- Object Storage migration is a separate future task.

---

## Decommission Review — 2026-04-29

Reviewed by Atlas agent (task #127) on 2026-04-29. Safety window has **not yet passed** (expires 2026-05-05). No secrets were deleted.

### Findings

| Item | Status |
|---|---|
| `DATABASE_URL_NEON` secret present | ✅ — Neon is the active database |
| `REPLIT_DATABASE_URL_BACKUP` secret present | ✅ — Still intact as rollback target |
| `DATABASE_URL` | ⚠️ Runtime-managed by Replit Postgres service (cannot be manually deleted; it is removed automatically when the Replit Postgres integration is detached from the project) |
| `resolveDbUrl()` fallback (`?? process.env.DATABASE_URL`) | Still in place — safe to remove after decommission |

### What decommission requires (after 2026-05-05)

1. Delete the `REPLIT_DATABASE_URL_BACKUP` secret from Replit Secrets.
2. Remove the Replit Postgres (Helium) integration from the project — this automatically removes the runtime-managed `DATABASE_URL` variable.
3. Remove the `?? process.env.DATABASE_URL` fallback from `resolveDbUrl()` in `src/core/db/index.ts` and simplify the function.
4. Update this document to mark decommission complete.

**Decommission is pending. No action taken on 2026-04-29.**

---

## Neon Project Details

- **Provider:** Neon (neon.tech)
- **Pooled endpoint:** hostname contains `-pooler` (PgBouncer)
- **Direct endpoint:** hostname without `-pooler` (used for migrations)
- **Region:** us-east-1
