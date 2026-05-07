# Atlas CR — Maintenance Jobs

## Read this entire CR before taking any action.

---

## 1. Overview

The scheduled job runner (built in Wave 4a) currently has one or more jobs registered as stubs with unimplemented handlers. Most visibly: the `session-cleanup` job appears in Settings → System → Jobs and on the Admin Panel dashboard as if it's running successfully, but the handler does nothing. This is silent debt — by the time storage costs spike or stale data causes problems, cleanup is much harder than incremental retention.

This CR replaces the stub with multiple independent maintenance jobs, each focused on a single retention/cleanup concern. Following the existing pattern (`drive-sync-notes`, `drive-sync-tables` are independent, named jobs), each cleanup gets its own registration, its own handler, and its own visible status in Settings.

**The work:**

1. **`trash-retention`** — hard-delete soft-deleted entities older than 30 days
2. **`orphaned-uploads-cleanup`** — clean up R2 files under `imports/` and `exports/` that aren't linked to any entity or are past TTL
3. **`processed-captures-cleanup`** — hard-delete processed Captures older than 90 days (from GTD Inbox model)
4. **`generated-exports-cleanup`** — defensive cleanup of PDF exports past 24-hour TTL (R2 lifecycle rules should handle this, but belt-and-suspenders)
5. **`job-records-cleanup`** — prune the job runner's own run history
6. **Remove the `session-cleanup` stub** — no replacement; the work it implied is covered by the specialized jobs
7. **Settings UI verification** — every job shows accurate last-run/next-run state, no stubs

**Out of scope:**

- Audit log retention — defer to a future CR. For personal/F&F scale, audit log accumulation is not yet a problem. Revisit if/when storage becomes a concern.
- Wave 5a Contacts-specific cleanup — Contacts hasn't shipped yet; whatever cleanup that module needs is part of 5a's scope, not this CR.
- Mobile interface (`/m`) updates — separate concern, separate CR.

**Pre-requisites:**

- Wave 4a's scheduled job runner exists and works
- Wave 4c shipped (so all entities that need cleanup exist)
- GTD Inbox CR shipped (so processed Captures exist as a concept)
- File Conversion CR shipped (so `imports/` and `exports/` R2 prefixes exist)
- R2 storage is configured and accessible from the job runner

**Estimated scope:** 2-3 days of focused work.

**Severity:** Medium. Not blocking but valuable to address before F&F production. Silent storage accumulation is the kind of debt that goes unnoticed until it doesn't.

---

## 2. Architectural foundation

### 2.1 One job per concern

Each cleanup job is its own registration, its own file, its own handler. Following the same pattern as drive-sync-notes and drive-sync-tables, each cleanup has:

- A unique job name
- A schedule (cron expression)
- A dedicated handler function
- Independent success/failure tracking
- Independent pause/resume control in Settings

This means if `trash-retention` fails, `orphaned-uploads-cleanup` still runs. Failures are isolated and easier to diagnose.

### 2.2 Each job is idempotent

Re-running a job (after a failure, or manually via "Run now") produces the same result as running it once successfully. Specifically:

- Already-cleaned items are skipped (their condition for cleanup no longer matches)
- Partial completions don't poison subsequent runs
- Concurrent runs are safe (though shouldn't happen with the existing runner's locking)

### 2.3 Each job logs its work

Every run produces an audit log entry summarizing what was cleaned:

```
action: 'maintenance_job_completed'
metadata: {
  job_name: 'trash-retention',
  duration_ms: 450,
  entities_processed: { tasks: 12, notes: 3, projects: 1 },
  errors: [],
}
```

This gives forensics: "what did the job do last week" is queryable.

### 2.4 Each job is conservative

When in doubt about whether to delete something, don't. Better to leave a stale record than to delete something the user wanted. Each job has explicit, narrow criteria.

---

## 3. Detailed deliverables

### 3.1 `trash-retention` job

#### 3.1.1 Purpose

Hard-delete entities that have been soft-deleted for more than 30 days. This is the actual implementation of the retention policy referenced since Wave 3a.

#### 3.1.2 Schedule

Daily at 3:00 AM (user's local time, but for simplicity use server UTC at 3 AM since this is a personal-use scale tool).

#### 3.1.3 Entities covered

Every soft-deletable entity gets retention enforcement. Audit the schema for tables with `deleted_at` columns:

- Task
- Project
- Folder (project folders)
- Note
- NotesFolder
- Table (when shipped)
- TablesFolder (when shipped)
- TableColumn (cascades from Table; also has own deleted_at)
- TableRow (cascades from Table; also has own deleted_at)
- Capture (separate cleanup logic, see 3.3 — covers different aging than this job)
- Attachment
- TaskWorkLog
- ChecklistItem
- Tag
- Context
- Link

If 5a ships Contact and other entities with soft delete, those need to be included when 5a ships (note in code comments).

#### 3.1.4 Handler logic

```typescript
async function trashRetentionHandler(): Promise<JobResult> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  
  const counts = {
    tasks: 0, projects: 0, folders: 0, notes: 0, notesFolders: 0,
    tables: 0, tablesFolders: 0, attachments: 0, taskWorkLogs: 0,
    checklistItems: 0, tags: 0, contexts: 0, links: 0,
  }
  
  const errors: Array<{ entity: string, error: string }> = []
  
  // For each entity table, delete soft-deleted rows older than cutoff
  // Use batch deletion to avoid lock contention
  
  try {
    counts.tasks = (await prisma.task.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } }
    })).count
  } catch (e) { errors.push({ entity: 'task', error: e.message }) }
  
  try {
    counts.notes = (await prisma.note.deleteMany({
      where: { deleted_at: { lt: cutoff, not: null } }
    })).count
  } catch (e) { errors.push({ entity: 'note', error: e.message }) }
  
  // ... repeat for all entities
  
  return { counts, errors }
}
```

#### 3.1.5 Cascade considerations

Some entities cascade-delete via Prisma relations (TableColumn cascades when Table is deleted, etc.). This is fine — when we hard-delete a Table, its columns and rows go with it.

But other entities are referenced via foreign keys without cascade (e.g., a Note's reference to a Project via project_id). When we hard-delete the Project, what happens to the Note's project_id? It depends on the schema:

- If `ON DELETE SET NULL`: the Note loses its project association but persists (correct behavior for retention)
- If `ON DELETE CASCADE`: the Note gets deleted too (probably wrong — Notes shouldn't disappear because their project was hard-deleted long ago)
- If `ON DELETE RESTRICT`: the deletion fails if any Note still references the project

Audit the schema's foreign key constraints. The right behavior for retention cleanup is generally `SET NULL` or equivalent — the entity persists but loses the broken reference.

If schema constraints don't allow this naturally, the handler may need to clean up references first:

```typescript
// Before deleting projects, null out references in non-deleted entities
await prisma.note.updateMany({
  where: {
    project_id: { in: projectIdsAboutToDelete },
    deleted_at: null,  // only update notes that aren't themselves deleted
  },
  data: { project_id: null }
})
```

#### 3.1.6 Capture exclusion

Captures have their own retention rule (90 days from processed_at, not 30 days from deleted_at). Don't include them in this job. The processed-captures-cleanup job handles them.

### 3.2 `orphaned-uploads-cleanup` job

#### 3.2.1 Purpose

Remove R2 files in `imports/` and `exports/` prefixes that are either:
- Past their TTL (24-48 hours)
- Not linked to any entity (orphaned because the upload failed, the import was canceled, or the entity referencing them was deleted)

#### 3.2.2 Schedule

Daily at 4:00 AM (after trash-retention runs).

#### 3.2.3 Handler logic

```typescript
async function orphanedUploadsCleanupHandler(): Promise<JobResult> {
  const counts = { imports: 0, exports: 0, sizeBytes: 0 }
  const errors: Array<{ key: string, error: string }> = []
  
  // 1. List all files under imports/ prefix
  const importFiles = await r2.listObjects({ prefix: 'users/' })  // iterate user prefixes
  
  for (const file of importFiles) {
    if (!file.key.includes('/imports/')) continue
    
    const ageMs = Date.now() - file.lastModified.getTime()
    const ageHours = ageMs / (1000 * 60 * 60)
    
    // imports/ files older than 48 hours and not linked to any Attachment
    if (ageHours > 48) {
      const linkedAttachment = await prisma.attachment.findFirst({
        where: { storage_key: file.key, deleted_at: null }
      })
      
      if (!linkedAttachment) {
        try {
          await r2.deleteObject({ key: file.key })
          counts.imports++
          counts.sizeBytes += file.size
        } catch (e) {
          errors.push({ key: file.key, error: e.message })
        }
      }
    }
  }
  
  // 2. List all files under exports/ prefix
  // Generated PDFs have 24-hour TTL; anything older is cleanup
  const exportFiles = await r2.listObjects({ prefix: 'users/' })
  
  for (const file of exportFiles) {
    if (!file.key.includes('/exports/')) continue
    
    const ageMs = Date.now() - file.lastModified.getTime()
    const ageHours = ageMs / (1000 * 60 * 60)
    
    if (ageHours > 24) {
      try {
        await r2.deleteObject({ key: file.key })
        counts.exports++
        counts.sizeBytes += file.size
      } catch (e) {
        errors.push({ key: file.key, error: e.message })
      }
    }
  }
  
  return { counts, errors }
}
```

#### 3.2.4 R2 lifecycle rules vs. job

R2 supports lifecycle rules that auto-delete files past a TTL. If those are configured on the `exports/` prefix, this job's exports cleanup is redundant defense-in-depth.

For `imports/`, lifecycle rules are trickier because the rule needs to know if the file is still referenced. R2 alone can't check Atlas's database. So the imports cleanup is genuinely needed.

If R2 lifecycle rules aren't configured, this job is the primary cleanup. If they are configured, this job is a safety net. Either way, the job has work to do.

#### 3.2.5 Pagination

R2 list operations return pages. The handler must paginate correctly to handle accounts with many files. Use the existing R2 client's pagination helpers.

#### 3.2.6 Rate limiting

Don't hammer R2 with parallel deletes. Batch deletes if R2 supports it (it does — DeleteObjects API), or limit concurrency to ~10 simultaneous deletes.

### 3.3 `processed-captures-cleanup` job

#### 3.3.1 Purpose

Hard-delete Captures that have been processed for more than 90 days. Captures are preserved post-processing for audit traceability (per GTD Inbox CR section 2.4) but eventually should be cleaned up — the resulting entity (Task, Note, etc.) is the canonical record.

#### 3.3.2 Schedule

Weekly, Sunday at 3:30 AM. Captures aren't time-sensitive cleanup; weekly is enough.

#### 3.3.3 Handler logic

```typescript
async function processedCapturesCleanupHandler(): Promise<JobResult> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)
  
  const result = await prisma.capture.deleteMany({
    where: {
      state: 'processed',
      processed_at: { lt: cutoff, not: null },
    }
  })
  
  return { counts: { captures: result.count }, errors: [] }
}
```

Simple — just a deleteMany with the right where clause. Captures don't have cascading concerns since their relationships are tracked via processed_to_id which is just a reference, not a constraint.

#### 3.3.4 Migration captures preserved differently

Captures created by the Inbox migration (with `migration_source` set) might warrant longer retention because they're the only record of the original Task that was retroactively converted. But the original Task is also still in the database (soft-deleted with `migration_note`).

For simplicity: treat migration-source Captures the same as regular processed Captures. If the user needs the migration history beyond 90 days, the audit log still records `task_migrated_to_capture` and `capture_created_from_migration` events.

### 3.4 `generated-exports-cleanup` job

#### 3.4.1 Purpose

Defensive cleanup of generated PDF exports older than 24 hours. R2 lifecycle rules may handle this; if they don't, this job ensures exports don't accumulate.

This overlaps with `orphaned-uploads-cleanup`'s exports handling. Could be merged. I'm keeping them separate for clarity:

- `orphaned-uploads-cleanup`: handles both imports/ and exports/ orphans
- `generated-exports-cleanup`: specifically about export TTL enforcement

In practice, the latter is redundant if the former runs reliably. If you want to consolidate, drop this job and let orphaned-uploads-cleanup do both. Keep them separate if you want explicit visibility for export cleanup specifically.

**My recommendation: drop this as a separate job.** Merge into orphaned-uploads-cleanup. Less code, no functional loss. I'm specifying this section so the agent knows to NOT create a separate job for this concern.

### 3.5 `job-records-cleanup` job

#### 3.5.1 Purpose

The scheduled job runner itself records each run (for the Settings UI's "last ran" display, for diagnostics). These accumulate. For personal scale, ~5-10 jobs running daily means ~3000 records per year. Not catastrophic, but worth pruning.

#### 3.5.2 Schedule

Weekly, Sunday at 4:00 AM (after processed-captures-cleanup).

#### 3.5.3 Retention policy

- Keep last 100 runs per job (so Settings UI's history view stays useful)
- Hard-delete older runs

#### 3.5.4 Handler logic

```typescript
async function jobRecordsCleanupHandler(): Promise<JobResult> {
  // For each job name, keep most recent 100 runs, delete rest
  const jobNames = await prisma.jobRun.findMany({
    distinct: ['job_name'],
    select: { job_name: true },
  })
  
  let totalDeleted = 0
  const errors: Array<{ job_name: string, error: string }> = []
  
  for (const { job_name } of jobNames) {
    try {
      // Find the cutoff: 100th most recent run for this job
      const runs = await prisma.jobRun.findMany({
        where: { job_name },
        orderBy: { ran_at: 'desc' },
        skip: 100,
        take: 1,
      })
      
      if (runs.length === 0) continue  // fewer than 100 runs; skip
      
      const cutoff = runs[0].ran_at
      
      const result = await prisma.jobRun.deleteMany({
        where: {
          job_name,
          ran_at: { lt: cutoff },
        }
      })
      
      totalDeleted += result.count
    } catch (e) {
      errors.push({ job_name, error: e.message })
    }
  }
  
  return { counts: { runs: totalDeleted }, errors }
}
```

#### 3.5.5 Adapt to actual schema

The schema for tracking job runs may differ from `JobRun` as I've written it. Look at how the existing job runner records runs and adapt this handler to the actual table structure.

### 3.6 Remove `session-cleanup` stub

#### 3.6.1 Find the stub

There's an existing job registered as `session-cleanup` (or similar) with an unimplemented or no-op handler. Find its registration and handler file.

#### 3.6.2 Remove cleanly

- Unregister the job from the runner
- Delete the handler file
- Remove any references to it from Settings UI lists or Admin Panel dashboard
- Don't leave references that would suggest the job exists but isn't running

If the job has any historical run records in the database, leave those alone (they're audit history). Just stop registering and running the job.

#### 3.6.3 Why not replace it?

Because the work `session-cleanup` was supposed to do is now covered by the specific jobs:

- Trash retention → `trash-retention`
- Orphaned uploads → `orphaned-uploads-cleanup`
- Processed captures → `processed-captures-cleanup`
- Job record pruning → `job-records-cleanup`

There's no remaining work specific to "sessions" that needs a job. Clerk handles session lifecycle on their side. Atlas doesn't store session state in a separate table that needs cleanup.

If the stub was intended to clean up something I haven't covered, surface the specific concern when you find the original code. Don't silently delete if it implied work that this CR's jobs don't cover.

### 3.7 Settings UI updates

#### 3.7.1 Jobs list accuracy

The Settings → System → Jobs page (and the equivalent view in Admin Panel) should:

- Show all 4 maintenance jobs (trash-retention, orphaned-uploads-cleanup, processed-captures-cleanup, job-records-cleanup)
- Show drive-sync-notes and drive-sync-tables (existing)
- NOT show session-cleanup (removed)
- Each job's last-run timestamp reflects actual execution
- Each job's status (Active / Paused / Failed) is accurate

#### 3.7.2 Run-now action

Each job has a "Run now" button. Clicking enqueues an immediate execution. UI shows progress, then result (success with counts, or failure with error).

This is critical for testing: after this CR ships, you'll want to manually trigger each job and verify the counts make sense before relying on the schedule.

#### 3.7.3 Pause / Resume

Each job can be paused (skips scheduled runs) or resumed. Pause state persists across server restarts.

For maintenance jobs, pausing is sometimes useful (e.g., "I'm doing recovery work, don't auto-clean for a few days"). Make sure pause is genuinely respected by the runner.

#### 3.7.4 Per-job audit log access

Each job's row in the Settings UI has a "View history" link that shows recent runs (last 20) with their results. The Admin Panel's audit log explorer can also filter by `action: maintenance_job_completed` and the metadata.job_name field.

### 3.8 Audit log entries

Every job run produces an audit log entry:

```typescript
{
  user_id: null,  // System-level, not user-scoped
  actor_type: 'system',
  action: 'maintenance_job_completed',
  target_type: 'system',
  target_id: null,
  metadata: {
    job_name: 'trash-retention',
    duration_ms: 450,
    counts: { tasks: 12, notes: 3, ... },
    errors: [],
  },
  created_at: ...,
}
```

If a job fails entirely (handler throws), record:

```typescript
{
  ...
  action: 'maintenance_job_failed',
  metadata: {
    job_name: 'trash-retention',
    error: e.message,
    stack: e.stack,
  }
}
```

These entries are queryable from the audit log explorer for diagnostic purposes.

---

## 4. tRPC procedures

No new external procedures. All existing job-runner procedures (run-now, pause, resume, list) work with the new jobs once they're registered.

If the existing settings UI needs a "view history" for a specific job, that may already exist or need a small addition:

```typescript
jobs.history({ job_name, limit }) → JobRun[]
```

If not present, add it. Otherwise, use what exists.

---

## 5. Schema notes

No schema changes are required for this CR. All cleanup operates against existing tables.

Verify the audit log table can handle the new actions (`maintenance_job_completed`, `maintenance_job_failed`). It probably can (action is a string field), but double-check there's no enum constraint.

---

## 6. File changes

```
/atlas
  /src
    /core
      /jobs
        /handlers
          trash-retention.ts             (NEW)
          orphaned-uploads-cleanup.ts    (NEW)
          processed-captures-cleanup.ts  (NEW)
          job-records-cleanup.ts         (NEW)
          session-cleanup.ts             (DELETE)
        registry.ts                      (UPDATED: register new jobs, unregister session-cleanup)
    /server
      /routers
        jobs.ts                          (verify; add history procedure if missing)
    /components
      /settings
        jobs-list.tsx                    (verify shows new jobs accurately)
        job-history-view.tsx             (NEW or verify exists)
```

The exact file paths may differ from what I've written. Match the actual project structure.

---

## 7. Verification

### Job registration
1. Settings → System → Jobs shows: drive-sync-notes, drive-sync-tables, trash-retention, orphaned-uploads-cleanup, processed-captures-cleanup, job-records-cleanup
2. Settings does NOT show session-cleanup (or any stub jobs)
3. Each maintenance job shows status Active by default
4. Each maintenance job's schedule is documented (Daily 3 AM / 4 AM / Weekly Sunday 3:30 AM / Weekly Sunday 4 AM)

### Trash retention
5. Click "Run now" on trash-retention → executes immediately
6. Verify: items soft-deleted >30 days ago are hard-deleted from database
7. Verify: items soft-deleted <30 days ago remain (still in trash, recoverable)
8. Audit log entry created with counts per entity type
9. Foreign key references handled correctly (notes referencing deleted projects don't cascade-delete; project_id set to null instead)
10. Empty trash retention run (no items eligible) completes cleanly with zero counts

### Orphaned uploads cleanup
11. Click "Run now" on orphaned-uploads-cleanup → executes immediately
12. Test setup: place a fake file in R2 under `users/{user_id}/imports/test-orphan.docx` with mtime 49 hours ago, no Attachment record
13. After job runs: file is deleted from R2
14. Test setup: place a file under imports/ with active Attachment record → not deleted (linked, not orphan)
15. Test setup: place a file under exports/ with mtime 25 hours ago → deleted
16. Test setup: place a file under exports/ with mtime 23 hours ago → not deleted (within TTL)
17. Audit log entry shows counts and total bytes cleaned

### Processed captures cleanup
18. Click "Run now" on processed-captures-cleanup → executes immediately
19. Test setup: a Capture with state='processed' and processed_at >91 days ago → hard-deleted
20. Test setup: a Capture with state='processed' and processed_at <89 days ago → preserved
21. Test setup: a Capture with state='proposed' (unprocessed) → preserved regardless of age
22. Audit log entry created

### Job records cleanup
23. Click "Run now" on job-records-cleanup → executes immediately
24. After run: each job has at most 100 historical run records
25. Most recent 100 preserved; older deleted
26. Settings UI's history view continues to work (shows preserved 100)

### Session cleanup removal
27. session-cleanup job no longer appears in Settings UI
28. Admin Panel dashboard does not show session-cleanup as a system job
29. Searching the codebase finds no references to session-cleanup handler
30. No errors at startup about unregistered handler

### Schedule execution
31. Wait for next scheduled run (or simulate by setting clock forward) → jobs execute on schedule
32. Last run timestamp updates accurately for each job
33. Next run timestamp shows the upcoming scheduled time

### Pause and resume
34. Pause trash-retention → schedule shows paused
35. Wait for scheduled time → no execution
36. Resume → schedule active again
37. Next scheduled time → executes

### Failure handling
38. Force a job failure (e.g., temporarily revoke R2 credentials) → job fails gracefully
39. Audit log shows maintenance_job_failed with error
40. UI shows job status as Failed
41. Manual "Run now" can re-attempt
42. Other jobs continue running (failure isolated)

### No regressions
43. Existing drive-sync-notes continues to work
44. Existing drive-sync-tables continues to work
45. All Wave 4a, 4b, 4c, GTD Inbox, File Conversion functionality unchanged
46. No data unintentionally deleted (verify by spot-checking trash-retention against known recent items)

When all 46 verification steps pass, this CR is complete.

---

## 8. Rules of engagement

### 8.1 Conservative when in doubt

If criteria for cleanup are ambiguous, leave the data alone. Better to accumulate slightly than to delete something the user wanted. Each job's where-clause should be narrow and explicit.

### 8.2 Each job is independent

Don't share state between jobs. Don't have one job's success/failure affect another's execution. Each job's handler is self-contained.

If the agent feels tempted to refactor multiple jobs into a shared utility, resist. The duplication is intentional — each job stands alone.

### 8.3 Test with real data before relying on schedule

After this CR ships, manually trigger each job via "Run now" and verify the counts. Don't rely on the schedule alone for the first execution. The schedule is for ongoing automation; the manual trigger is for verification.

If "Run now" produces unexpected results (e.g., trash-retention deletes 500 items when you expected 5), pause the job and investigate before letting it run again.

### 8.4 Audit log is the diagnostic interface

When something goes wrong with a job, the audit log is where you look. Every run creates an entry. Failures create error entries. The audit log explorer (Admin Panel) filters by maintenance_job_completed action.

This means every job run, success or failure, MUST write to audit log. No silent successes.

### 8.5 Don't expand scope to audit log retention

Audit logs accumulate. At some point they need their own retention story. But not in this CR. For personal scale, audit log size is not yet a problem. When it becomes one (or when F&F users multiply data volume), revisit.

### 8.6 Don't expand to user data export or anonymization

Some "cleanup" CRs creep into "data lifecycle management" — GDPR-style deletion, export-then-delete flows, anonymization. Not this CR. This is purely retention enforcement on the existing soft-delete model.

### 8.7 Wave 5a Contacts cleanup goes in 5a

If 5a's Contact entity has its own retention concerns (e.g., archived contacts, last-contact-time-based pruning), that's part of 5a's scope, not this CR.

When 5a ships, the trash-retention job's entity list should be updated to include Contact (just adding `prisma.contact.deleteMany(...)` to the handler). That's a small follow-up commit, not a separate CR.

### 8.8 R2 lifecycle rules are complementary, not replacement

If R2 lifecycle rules are configured to auto-delete `exports/` after 24 hours, the orphaned-uploads-cleanup job's exports handling is redundant defense. That's fine — keep both. Lifecycle rules are best-effort; the job is explicit and audit-logged.

For `imports/`, lifecycle rules can't determine if a file is still referenced. The job is the primary cleanup mechanism here.

---

## 9. Recommended Build Sequence

**Phase 1: Audit existing state (0.5 day)**

1. Find the session-cleanup stub registration and handler
2. Document what it claims to do (read its current implementation, even if no-op)
3. Verify nothing critical depends on it that this CR's jobs don't cover
4. Note any other stubs in the job registry

**Phase 2: Trash retention (0.5 day)**

5. Implement handler with all entities covered
6. Audit foreign key constraints; add reference-nulling logic if needed
7. Register job with daily 3 AM schedule
8. Test with manual "Run now"; verify counts

**Phase 3: Orphaned uploads cleanup (0.5-1 day)**

9. Implement R2 listing for users/* prefix
10. Implement age-based and reference-based filtering for imports/
11. Implement age-based filtering for exports/
12. Batch deletion with rate limiting
13. Register job with daily 4 AM schedule
14. Test with deliberately placed orphan files

**Phase 4: Processed captures cleanup (0.25 day)**

15. Implement simple deleteMany handler
16. Register job with weekly Sunday 3:30 AM schedule
17. Test with aged Capture records

**Phase 5: Job records cleanup (0.25 day)**

18. Implement per-job-name retention handler
19. Adapt to actual JobRun schema
20. Register job with weekly Sunday 4 AM schedule
21. Test with deliberately seeded run records

**Phase 6: Session-cleanup removal (0.25 day)**

22. Unregister session-cleanup from runner
23. Delete handler file
24. Remove from Settings UI display logic if hardcoded
25. Verify no runtime errors

**Phase 7: Settings UI verification (0.25 day)**

26. Confirm all jobs show accurate state
27. Confirm "Run now", Pause, Resume work for new jobs
28. Confirm history view (if exists) shows recent runs

**Phase 8: Verification (0.5 day)**

29. All 46 verification steps
30. Spot-check that no real data was unintentionally deleted

---

## 10. What is NOT in this CR

**Audit log retention:**
- Deferred. Personal scale doesn't yet need it.
- When needed: separate small CR with its own retention policy

**Wave 5a Contact-specific cleanup:**
- Part of 5a's scope, not this CR
- This CR's trash-retention will be extended in 5a to include Contact entity

**Mobile interface (`/m`) updates:**
- Separate concern, separate CR
- Settings UI on mobile may need updates to show new jobs, but that's part of broader mobile parity work

**User-initiated data deletion:**
- "Delete my account" flow, GDPR-style purge — different concern
- Not in scope here

**Backup verification:**
- Verifying Drive backups are restorable — different concern
- Could be a separate small CR

If you find yourself building any of these, stop.

---

## 11. Final note

This CR closes a small but real gap. The scheduled job runner has been showing stub jobs as if they're working — that's the kind of UI lie that erodes trust quietly. After this ships, every job in Settings is doing actual work, and the cleanup that was deferred from earlier waves finally gets implemented.

The discipline of "one job per concern" matches Atlas's existing pattern and keeps the maintenance code easy to reason about. If `processed-captures-cleanup` ever has a bug, it doesn't risk breaking `trash-retention`. Each job is small enough to debug standalone.

Begin with section 9, Phase 1.
