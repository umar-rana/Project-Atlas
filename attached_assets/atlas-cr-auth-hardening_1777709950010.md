# Atlas CR — Auth Hardening and Automatic Orphan Recovery

## Read this entire CR before taking any action.

---

## 1. Overview

The Replit-recommended fix for #297 (silent data loss from auth re-association) has already shipped. That fix changed `getOrCreateUserFromClerk` to check all verified Clerk emails (not just `emailAddresses[0]`), added a structured warning when new user records are created, and added an Empty Trash confirmation. This stopped the immediate bleeding.

This CR goes beyond that fix. The Replit work addressed the specific failure mode but left several architectural risks in place. This CR makes the auth resolution bulletproof, adds automatic recovery for already-orphaned data, and lays the foundation that CR 2 (admin panel) will build on for ongoing oversight.

**The work:**

1. **Make Clerk user ID the primary lookup, email a fallback** — invert the current priority so the stable identifier is checked first
2. **Add unique constraint on User.clerk_user_id** — prevents race-condition duplicates at the database level
3. **Comprehensive auth event logging** — every authentication produces an audit log entry, regardless of outcome, for forensic capability
4. **Automatic orphan recovery on auth** — when a returning user's session resolves but their Clerk identity has changed, scan for orphaned data under prior identifiers and re-link automatically
5. **One-time backfill scan** — on first deployment of this CR, scan existing data for orphans and recover all that can be confidently relinked
6. **User-facing recovery notification** — when data is recovered, surface it to the user so they understand what happened
7. **Auth resolution is idempotent and atomic** — handles parallel auth requests safely

**Pre-requisites:**

- The Replit fix for #297 is already shipped (all-emails check, structured warnings, Empty Trash confirmation)
- Existing User table has `clerk_user_id` field
- Existing audit log infrastructure works
- All other Atlas waves (3a through 4a) are stable

**Estimated scope:** 4-5 days of focused work. Critical priority — ship before any other in-flight work.

---

## 2. Detailed deliverables

### 2.1 Auth resolution architecture — Clerk ID as primary lookup

The current shipped fix improved the email fallback path, but email is still being treated as a primary identifier through the all-emails-check. The architecturally correct approach inverts the priority: Clerk's user ID is the stable identifier and should be checked first; email becomes a fallback for the rare case where Clerk ID lookup fails.

#### 2.1.1 Resolution algorithm

```typescript
async function getOrCreateUserFromClerk(clerkUser: ClerkUser): Promise<User> {
  // PRIMARY PATH: lookup by Clerk user ID
  // This is the stable identifier and should match in 99.9% of cases.
  const existing = await prisma.user.findUnique({
    where: { clerk_user_id: clerkUser.id }
  })
  
  if (existing) {
    await syncProfileFromClerk(existing, clerkUser)
    await logAuthEvent('resolved_by_clerk_id', existing.id, clerkUser.id)
    
    // Check if there are orphaned User records that should be merged with this one
    await attemptOrphanRecovery(existing, clerkUser)
    
    return existing
  }
  
  // FALLBACK PATH: lookup by ANY verified email
  // This handles the rare case where Clerk reissued an ID, or a User record
  // exists from before clerk_user_id was being stored.
  const verifiedEmails = clerkUser.emailAddresses
    .filter(e => e.verification?.status === 'verified')
    .map(e => e.emailAddress.toLowerCase())
  
  if (verifiedEmails.length > 0) {
    const byEmail = await prisma.user.findFirst({
      where: {
        email: { in: verifiedEmails },
        deleted_at: null,
      }
    })
    
    if (byEmail) {
      // Found by email but Clerk ID didn't match.
      // Update the User to point at the current Clerk ID.
      const previousClerkId = byEmail.clerk_user_id
      
      await prisma.user.update({
        where: { id: byEmail.id },
        data: { clerk_user_id: clerkUser.id }
      })
      
      await logAuthEvent('resolved_by_email_fallback', byEmail.id, clerkUser.id, {
        previous_clerk_id: previousClerkId,
        emails_checked: verifiedEmails,
        recovery: previousClerkId !== clerkUser.id,
      })
      
      // Mark for user-facing recovery notification on next page load
      await flagForRecoveryNotification(byEmail.id)
      
      await syncProfileFromClerk(byEmail, clerkUser)
      await attemptOrphanRecovery(byEmail, clerkUser)
      
      return byEmail
    }
  }
  
  // CREATE PATH: genuinely new user
  // Before creating, scan one more time for any orphaned User records that
  // match this Clerk identity. The Replit fix's structured warnings should
  // catch this, but we also actively check.
  const possibleOrphan = await scanForOrphanByClerkIdentity(clerkUser)
  if (possibleOrphan) {
    // Found an orphan — re-attach it instead of creating new
    await prisma.user.update({
      where: { id: possibleOrphan.id },
      data: { clerk_user_id: clerkUser.id }
    })
    
    await logAuthEvent('resolved_by_orphan_recovery', possibleOrphan.id, clerkUser.id, {
      previous_clerk_id: possibleOrphan.clerk_user_id,
      recovered_via: 'identity_match',
      emails_checked: verifiedEmails,
    })
    
    await flagForRecoveryNotification(possibleOrphan.id)
    await syncProfileFromClerk(possibleOrphan, clerkUser)
    
    return possibleOrphan
  }
  
  // Truly new user
  console.warn('[AUTH] Creating new user record', {
    clerk_user_id: clerkUser.id,
    emails_checked: verifiedEmails,
    primary_email: clerkUser.primaryEmailAddress?.emailAddress,
    flag: 'GENUINELY_NEW_USER_OR_UNRECOVERABLE_ORPHAN',
  })
  
  const newUser = await createNewUserFromClerk(clerkUser)
  
  await logAuthEvent('created_new_user', newUser.id, clerkUser.id, {
    emails_checked: verifiedEmails,
    audit_warning: true,
  })
  
  return newUser
}
```

#### 2.1.2 Race condition prevention via unique constraint

Add a unique constraint on `User.clerk_user_id`:

```prisma
model User {
  // existing fields
  
  clerk_user_id   String    @unique
  
  // existing fields continued
}
```

This makes parallel auth requests for a new user safe. If two requests both reach the create path simultaneously, the database rejects the second insert; the handler catches the unique violation and re-queries to find the User created by the first request.

```typescript
async function createNewUserFromClerk(clerkUser: ClerkUser): Promise<User> {
  try {
    return await prisma.user.create({
      data: {
        clerk_user_id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress?.toLowerCase() ?? '',
        name: clerkUser.fullName ?? clerkUser.firstName ?? 'New User',
        // ... other defaults
      }
    })
  } catch (error) {
    if (isPrismaUniqueViolation(error, 'clerk_user_id')) {
      const existing = await prisma.user.findUnique({
        where: { clerk_user_id: clerkUser.id }
      })
      if (existing) return existing
    }
    throw error
  }
}
```

#### 2.1.3 Pre-migration safety check

Before adding the unique constraint, the migration must verify no duplicates exist. If any User rows share a `clerk_user_id`, the migration should halt and report them so they can be resolved before continuing.

```sql
-- Run this BEFORE adding the unique constraint:
SELECT clerk_user_id, COUNT(*) as duplicate_count, array_agg(id ORDER BY created_at) as user_ids
FROM users
WHERE deleted_at IS NULL AND clerk_user_id IS NOT NULL
GROUP BY clerk_user_id
HAVING COUNT(*) > 1;
```

If this returns any rows, the migration should fail loudly with output like:

```
ERROR: Cannot add unique constraint on clerk_user_id.
Found 3 Clerk IDs with duplicate User rows:
  - clerk_xxx: users [user_a, user_b]
  - clerk_yyy: users [user_c, user_d, user_e]
  - clerk_zzz: users [user_f, user_g]

Resolve duplicates before re-running this migration.
```

For each duplicate set, the resolution process is:
1. Identify which User row has the most recent activity (audit log entries, task updates, etc.)
2. That User becomes the canonical one
3. Other duplicate User rows have their data re-attached to the canonical User (using the same logic as orphan recovery in 2.2)
4. Duplicate User rows are then soft-deleted

This resolution can be done via the admin panel (CR 2) once it ships. For the initial deployment of THIS CR, if duplicates exist, surface them and require manual resolution before the unique constraint is added. Don't auto-merge during migration — the operations are too consequential to do without admin oversight.

### 2.2 Automatic orphan recovery

When a user's session resolves to a User record, the system scans for any orphaned User records that may belong to the same person and re-attaches their data automatically.

#### 2.2.1 Orphan definition

A User row is "orphaned" if:
- It has not had any auth events in the past 30 days
- It has any of the following content: tasks, projects, notes, tables, captures, attachments, audit log entries
- Its email matches one of the current session's verified Clerk emails (case-insensitive)
- OR its previous `clerk_user_id` matches one Clerk has documented as reissued (not common; we'd only know this from Clerk metadata if exposed, otherwise rely on email matching)

#### 2.2.2 Recovery algorithm

```typescript
async function attemptOrphanRecovery(currentUser: User, clerkUser: ClerkUser): Promise<RecoveryResult> {
  const verifiedEmails = clerkUser.emailAddresses
    .filter(e => e.verification?.status === 'verified')
    .map(e => e.emailAddress.toLowerCase())
  
  // Find any User rows whose email matches one of the current Clerk emails
  // but is NOT the current User
  const candidates = await prisma.user.findMany({
    where: {
      id: { not: currentUser.id },
      email: { in: verifiedEmails },
      deleted_at: null,
    }
  })
  
  if (candidates.length === 0) {
    return { recovered: false, reason: 'no_candidates' }
  }
  
  // For each candidate, verify they are a true orphan
  const orphans: User[] = []
  for (const candidate of candidates) {
    const isOrphan = await verifyIsOrphan(candidate)
    if (isOrphan) orphans.push(candidate)
  }
  
  if (orphans.length === 0) {
    return { recovered: false, reason: 'no_verified_orphans' }
  }
  
  // Re-attach orphan data to current user
  const result = await reattachOrphanData(currentUser, orphans, clerkUser.id)
  
  await logAuthEvent('orphan_data_recovered', currentUser.id, clerkUser.id, {
    orphan_user_ids: orphans.map(o => o.id),
    counts: result.counts,
    audit_warning: true,
  })
  
  return { recovered: true, ...result }
}

async function verifyIsOrphan(user: User): Promise<boolean> {
  // Has not had auth events in 30+ days
  const recentAuth = await prisma.auditLog.findFirst({
    where: {
      user_id: user.id,
      action: { startsWith: 'auth_' },
      created_at: { gte: thirtyDaysAgo() }
    }
  })
  
  if (recentAuth) return false  // Active user, not an orphan
  
  // Has actual content (not just a stub User row)
  const taskCount = await prisma.task.count({ where: { user_id: user.id, deleted_at: null } })
  const noteCount = await prisma.note.count({ where: { user_id: user.id, deleted_at: null } })
  const projectCount = await prisma.project.count({ where: { user_id: user.id, deleted_at: null } })
  
  return (taskCount + noteCount + projectCount) > 0
}
```

#### 2.2.3 Re-attachment

Re-attaching orphan data means updating `user_id` on every entity owned by the orphan to point at the canonical User:

```typescript
async function reattachOrphanData(
  canonicalUser: User,
  orphans: User[],
  clerkUserId: string
): Promise<ReattachmentResult> {
  const counts = {
    tasks: 0,
    projects: 0,
    notes: 0,
    tables: 0,
    captures: 0,
    attachments: 0,
    audit_log_entries: 0,
    folders: 0,
    tags: 0,
    contexts: 0,
    links: 0,
  }
  
  for (const orphan of orphans) {
    // Run reattachment in a transaction so it's all-or-nothing per orphan
    await prisma.$transaction(async (tx) => {
      // Update user_id on all entities
      counts.tasks += (await tx.task.updateMany({
        where: { user_id: orphan.id },
        data: { user_id: canonicalUser.id }
      })).count
      
      counts.projects += (await tx.project.updateMany({
        where: { user_id: orphan.id },
        data: { user_id: canonicalUser.id }
      })).count
      
      counts.notes += (await tx.note.updateMany({
        where: { user_id: orphan.id },
        data: { user_id: canonicalUser.id }
      })).count
      
      // ... repeat for tables, captures, attachments, audit_log, folders, tags, contexts, links
      // Every table that has user_id needs to be included
      
      // Soft-delete the orphan User row so it doesn't show up again
      await tx.user.update({
        where: { id: orphan.id },
        data: {
          deleted_at: new Date(),
          email: `orphaned-${orphan.id}@deleted.local`,  // Free up the email if needed later
        }
      })
      
      // Audit log the reattachment with full counts
      await tx.auditLog.create({
        data: {
          user_id: canonicalUser.id,
          actor_type: 'system',
          action: 'orphan_data_reattached',
          target_type: 'user',
          target_id: orphan.id,
          metadata: {
            canonical_user_id: canonicalUser.id,
            orphan_user_id: orphan.id,
            orphan_email: orphan.email,
            clerk_user_id: clerkUserId,
            counts: { /* per-entity counts for this orphan */ },
            timestamp: new Date().toISOString(),
          }
        }
      })
    })
  }
  
  return { counts, orphan_count: orphans.length }
}
```

**Critical: this is wrapped in a transaction per orphan.** If any update in the chain fails, the entire orphan's reattachment rolls back. We never want partial reattachment leaving data in inconsistent states.

#### 2.2.4 Tables that need user_id updates

The reattachment must touch every table that has a `user_id` foreign key. Audit the schema for completeness. The expected list:

- Task
- TaskWorkLog
- ChecklistItem
- Project
- Folder
- Note
- NotesFolder
- Table (when 4b ships)
- TablesFolder (when 4b ships)
- TableColumn (cascades from Table; verify)
- TableRow (cascades from Table; verify)
- Capture
- CaptureParseLog
- Attachment
- AuditLog
- Tag
- Context
- Link

If any future tables are added with `user_id`, the reattachment function must be updated to include them. Add a comment in the User schema referencing this.

### 2.3 One-time backfill scan

When this CR is deployed, run a one-time job that scans for ALL existing orphans and recovers them automatically.

#### 2.3.1 Backfill algorithm

```typescript
async function runBackfillOrphanRecovery(): Promise<BackfillReport> {
  // Find all User rows that look like orphans:
  // - No auth events in the past 30 days
  // - Have content (not stub users)
  // - Their email matches another active user's email (case-insensitive)
  
  const allUsers = await prisma.user.findMany({
    where: { deleted_at: null }
  })
  
  const usersByEmail = new Map<string, User[]>()
  for (const user of allUsers) {
    const email = user.email.toLowerCase()
    if (!usersByEmail.has(email)) usersByEmail.set(email, [])
    usersByEmail.get(email)!.push(user)
  }
  
  const recoveryReport: BackfillReport = {
    scanned: allUsers.length,
    duplicate_email_groups: 0,
    orphans_recovered: 0,
    orphans_skipped: 0,
    errors: [],
  }
  
  for (const [email, users] of usersByEmail) {
    if (users.length < 2) continue
    
    recoveryReport.duplicate_email_groups++
    
    // Determine canonical user: most recent auth event wins
    // If no auth events, most recently updated wins
    const canonical = await pickCanonicalUser(users)
    const orphans = users.filter(u => u.id !== canonical.id)
    
    // Verify each orphan has content
    for (const orphan of orphans) {
      try {
        const isOrphan = await verifyIsOrphan(orphan)
        if (isOrphan) {
          await reattachOrphanData(canonical, [orphan], canonical.clerk_user_id)
          recoveryReport.orphans_recovered++
          await flagForRecoveryNotification(canonical.id)
        } else {
          recoveryReport.orphans_skipped++
        }
      } catch (error) {
        recoveryReport.errors.push({
          orphan_id: orphan.id,
          canonical_id: canonical.id,
          error: error.message,
        })
      }
    }
  }
  
  // Log the backfill report for admin review
  await prisma.auditLog.create({
    data: {
      user_id: null,
      actor_type: 'system',
      action: 'backfill_orphan_recovery_completed',
      target_type: 'system',
      target_id: null,
      metadata: recoveryReport,
    }
  })
  
  return recoveryReport
}
```

#### 2.3.2 When to run backfill

The backfill runs once, on first deployment of this CR. Trigger via:
- A migration script that runs after schema migrations complete
- OR a one-time job registered with the scheduled job runner that runs once and unregisters itself
- OR manually triggered from the CLI

For your scale (small user count), running it during deployment (after migrations) is fine. Log the report comprehensively so you can review what was recovered.

#### 2.3.3 Backfill safety

The backfill is conservative:
- Only matches by exact email (case-insensitive)
- Requires zero recent auth on the orphan
- Requires the orphan to actually have content
- Wraps each orphan recovery in its own transaction so partial failures don't poison the whole run

If the backfill report shows unexpected results (lots of recoveries, or errors), review before any users log in. The admin panel (CR 2) provides the visibility for this review.

### 2.4 Profile sync (non-destructive)

When a user authenticates, sync their Clerk profile changes to the User record without disrupting the User identity:

```typescript
async function syncProfileFromClerk(user: User, clerkUser: ClerkUser): Promise<void> {
  const updates: Partial<User> = {}
  
  const clerkPrimary = clerkUser.primaryEmailAddress?.emailAddress?.toLowerCase()
  if (clerkPrimary && clerkPrimary !== user.email.toLowerCase()) {
    updates.email = clerkPrimary
  }
  
  const clerkName = clerkUser.fullName ?? clerkUser.firstName
  if (clerkName && clerkName !== user.name) {
    updates.name = clerkName
  }
  
  if (Object.keys(updates).length > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: updates,
    })
  }
}
```

Critical: this NEVER changes `user.id` or `user.clerk_user_id` — only profile display fields.

### 2.5 Auth event audit logging

Every authentication produces an audit log entry. New audit actions:

- `auth_resolved_by_clerk_id` — Normal case
- `auth_resolved_by_email_fallback` — Email matched, Clerk ID didn't
- `auth_resolved_by_orphan_recovery` — Found via active orphan scan
- `auth_created_new_user` — Brand-new user (with audit_warning flag)
- `auth_failed` — Authentication failed

Each entry includes the resolved User ID (if any), the Clerk user ID from the session, emails checked, and a warning flag where applicable. These are queryable from CR 2's admin panel.

### 2.6 User-facing recovery notification

When data has been recovered for a user (either via email fallback or active orphan recovery), surface a notification on next page load.

#### 2.6.1 Schema addition

```prisma
model User {
  // existing fields
  
  recovery_notification_pending Boolean   @default(false)  // NEW
  last_recovery_summary         Json?                       // NEW: counts of what was recovered
  last_recovery_dismissed_at    DateTime? @db.Timestamptz   // NEW
  
  // existing fields continued
}
```

When recovery happens, set `recovery_notification_pending = true` and store a summary:

```json
{
  "recovered_at": "2026-05-02T14:30:00Z",
  "counts": {
    "tasks": 47,
    "projects": 3,
    "notes": 12,
    "captures": 5
  }
}
```

#### 2.6.2 Notification UI

On next page load when `recovery_notification_pending = true`, display a banner:

```
+------------------------------------------------------------+
|  ℹ  We recovered your data                                |
|                                                            |
|     Your account was reconnected, and we restored:        |
|     • 47 tasks                                             |
|     • 3 projects                                           |
|     • 12 notes                                             |
|     • 5 captures                                           |
|                                                            |
|     If anything looks wrong, please reach out.            |
|                                                            |
|     [View summary]              [Got it]                   |
+------------------------------------------------------------+
```

Click "Got it" → sets `last_recovery_dismissed_at = now()` and `recovery_notification_pending = false`.

Click "View summary" → opens a detail page showing exactly what was recovered with timestamps and source orphan ID (for troubleshooting).

#### 2.6.3 When to suppress

Don't show the banner if:
- This is the user's first-ever auth (no prior data could exist)
- The recovery counts are all zero (recovery happened but found nothing meaningful)

### 2.7 Empty Trash confirmation enhancement

The Replit fix added a basic confirmation. Enhance it to require typing "DELETE" and to count all entity types (not just tasks):

```
+------------------------------------------------------------+
|  ⚠ Permanently delete trash?                              |
+------------------------------------------------------------+
|                                                            |
|  This will permanently delete:                             |
|                                                            |
|    • 47 tasks                                              |
|    • 3 projects                                            |
|    • 12 notes                                              |
|    • 8 attachments                                         |
|                                                            |
|  This action cannot be undone.                             |
|                                                            |
|  Type DELETE to confirm:                                   |
|  [_____________]                                           |
|                                                            |
|              [Cancel]      [Delete forever]                |
|                            (disabled until DELETE typed)   |
+------------------------------------------------------------+
```

If the Replit fix already added typed-confirmation, leave that alone. Just verify the entity counts include all types in trash, not only tasks.

---

## 3. tRPC procedures

```typescript
// User
user.dismissRecoveryNotification()  
  // Sets recovery_notification_pending = false, last_recovery_dismissed_at = now()

user.recoveryDetails()  
  // Returns the last_recovery_summary for the View summary page

// Trash (verify Replit fix has these; add if missing)
trash.preview() → { 
  tasks: number, 
  projects: number, 
  notes: number, 
  attachments: number,
  // ... all types
}

trash.empty({ confirmation_token: string })  
  // confirmation_token must equal "DELETE"; rejects otherwise
```

Internal-only (called from auth resolution):

```typescript
attemptOrphanRecovery(currentUser, clerkUser)
verifyIsOrphan(user)
reattachOrphanData(canonical, orphans, clerkUserId)
flagForRecoveryNotification(userId)
syncProfileFromClerk(user, clerkUser)
logAuthEvent(action, userId, clerkUserId, metadata)
```

---

## 4. Schema changes

```prisma
model User {
  // existing fields
  
  clerk_user_id   String    @unique  // CHANGED: enforce uniqueness
  
  recovery_notification_pending Boolean   @default(false)  // NEW
  last_recovery_summary         Json?                       // NEW
  last_recovery_dismissed_at    DateTime? @db.Timestamptz   // NEW
  
  // existing fields continued
}
```

Migration order:

1. Add the three new columns (nullable / with default, no breakage)
2. Run pre-migration duplicate check (section 2.1.3 SQL)
3. If duplicates exist, halt and surface them
4. Add unique constraint on clerk_user_id
5. Run backfill orphan recovery scan

If step 3 finds duplicates, the deployment must pause. Resolve duplicates manually (or via admin panel from CR 2 once it ships), then continue.

**Contingency: if duplicate resolution requires admin panel:**

If the pre-migration duplicate check finds duplicates and they can't be resolved via SQL (because the right resolution requires content review that the admin panel facilitates), use this fallback sequence:

1. Ship Phase 2 of THIS CR (auth resolution rework with Clerk ID primary lookup) WITHOUT the unique constraint
2. The new resolution logic will resolve correctly even with duplicates present (it picks one User by Clerk ID; the duplicate just sits unused)
3. Ship Phase 3 (orphan recovery during auth) — this handles ongoing cases
4. SKIP the backfill scan for now (it could mass-merge based on incomplete info)
5. Ship CR 2 (admin panel)
6. Use the admin panel to manually resolve the existing duplicates, one Clerk ID at a time
7. Once all duplicates resolved, return to this CR and add the unique constraint
8. Then run the backfill scan to catch anything that auto-recovery missed

This preserves all the user-facing fixes while sequencing carefully around the duplicate resolution work. The trade-off is more deployment steps, but no data risk.

---

## 5. File changes

```
/atlas
  /src
    /lib
      auth.ts                    (UPDATED: new resolution algorithm with Clerk ID primary)
    /core
      /auth
        orphan-recovery.ts       (NEW: scan and reattach logic)
        auth-events.ts           (NEW: structured logging helper)
        profile-sync.ts          (NEW: non-destructive profile updates)
        backfill.ts              (NEW: one-time backfill scan)
    /server
      /routers
        user.ts                  (UPDATED: recovery notification procedures)
        trash.ts                 (verify confirmation flow; enhance counts)
    /components
      /notifications
        recovery-banner.tsx      (NEW: surfaces recovery to user)
        recovery-summary.tsx     (NEW: detail page)
      /trash
        empty-trash-dialog.tsx   (UPDATED: enhanced counts)
    /migrations
      [timestamp]_add_clerk_id_unique.sql   (NEW)
      [timestamp]_add_recovery_fields.sql   (NEW)
      [timestamp]_run_backfill_recovery.ts  (NEW)
```

---

## 6. Verification

### Schema and migration
1. New columns added to User table without breaking existing rows
2. Pre-migration duplicate check runs; if zero duplicates, migration proceeds
3. Unique constraint added to clerk_user_id; subsequent attempts to create duplicates fail at DB level
4. Backfill scan runs after migrations; report logged to audit log

### Auth resolution
5. User logs in normally → `auth_resolved_by_clerk_id` audit entry
6. Force a Clerk ID change scenario (e.g., delete clerk_user_id from existing User row, log in) → resolves via email fallback, updates clerk_user_id, fires `auth_resolved_by_email_fallback`
7. Existing user with content but stale Clerk ID logs in → `auth_resolved_by_orphan_recovery` triggers, data reattaches
8. New user with no prior data logs in → `auth_created_new_user` audit entry, no recovery notification
9. Parallel auth requests for same new Clerk identity → only one User row created (race condition prevented by unique constraint)

### Orphan recovery
10. User with orphaned data logs in → `attemptOrphanRecovery` finds candidates via email match
11. Verified orphans are reattached: tasks, projects, notes, captures all moved to canonical User
12. Reattachment is transactional: if any update fails, entire reattachment for that orphan rolls back
13. Orphan User row is soft-deleted with `deleted_at` set and email rewritten to free it up
14. Audit log entry `orphan_data_reattached` includes full counts per entity type
15. User receives recovery notification banner on next page load

### Backfill scan
16. Backfill runs after migration; identifies all duplicate-email user groups
17. For each group, picks canonical (most recent auth or most recent update)
18. Verifies each non-canonical is a true orphan (no recent auth, has content)
19. Reattaches verified orphans; logs report to audit log
20. Backfill report queryable via audit log (will be surfaced in admin panel CR 2)

### User-facing recovery notification
21. After recovery, user sees banner on next page load
22. Banner lists actual entity counts that were recovered
23. "Got it" dismisses banner; doesn't show again
24. "View summary" shows detail page with timestamps
25. New users (no prior data) don't see banner even if recovery technically ran with zero counts

### Empty Trash
26. Click Empty Trash → confirmation dialog shows counts for ALL entity types in trash, not just tasks
27. Dialog requires typing "DELETE" before button enables
28. Cancel button dismisses without deletion
29. Confirmed deletion logs `trash_emptied` with full per-entity counts
30. Counts include attachments, notes, projects, tables (when applicable), tags

### Edge cases
31. User changes primary email in Clerk → next login still resolves to same User (Clerk ID is primary lookup)
32. User adds a second verified email in Clerk → existing User found by Clerk ID match; new email synced to profile
33. Two Atlas Users have the same email but different Clerk IDs (legacy duplicates) → backfill scan identifies and resolves
34. Orphan with zero content (stub User) → not recovered; left alone (no data to lose)
35. Active User with no recent auth (e.g., user inactive for 60 days) → re-attaches if Clerk identity matches; doesn't get marked orphan during their absence

When all 35 verification steps pass, this CR is complete.

---

## 7. Rules of engagement

### 7.1 Clerk ID is the primary identifier

After this CR, email is a verification fallback only. The auth resolution logic should always try Clerk ID first. If you find code paths that look up Users by email as the primary path, fix them.

### 7.2 Reattachment is transactional

Every orphan reattachment is wrapped in a Prisma transaction. If any step fails, the entire reattachment for that orphan rolls back. Never leave data in a half-attached state.

### 7.3 Don't auto-merge content

Reattachment moves data from orphan to canonical user. It does NOT merge or deduplicate. If both orphan and canonical have a project called "Atlas," they remain two projects after reattachment. The user reviews and consolidates manually if needed. Auto-merging is too risky.

### 7.4 Backfill is idempotent

Running the backfill scan twice produces the same result as running it once. Already-recovered orphans are soft-deleted and won't match again. If the backfill is interrupted partway, re-running it picks up where it left off.

### 7.5 Verify the schema audit completeness

The reattachment logic must update `user_id` on every table that has it. Before shipping, grep the schema for `user_id` and verify every table is included in the reattachment function. If a future table adds `user_id`, the function must be updated. Add a comment in the User schema noting this.

### 7.6 Don't ship if the duplicate check fails

If the pre-migration check finds existing duplicates and they cannot be resolved cleanly, do NOT proceed with adding the unique constraint. Instead:
1. Log the duplicates with full diagnostic info
2. Surface them to admin (you, via the audit log or temporary CLI output)
3. Wait for manual review before continuing

Adding a unique constraint when duplicates exist would fail and could leave the database in a half-migrated state.

### 7.7 Recovery notification is informational, not promotional

The banner exists to inform the user that data was recovered. It's not a "welcome back!" message or a celebration. Keep the tone matter-of-fact: "We reconnected your account. Here's what was restored."

### 7.8 No retroactive notifications

If a user's data was orphaned and recovered before this CR shipped (via the Replit fix or manual intervention), don't try to surface a recovery notification retroactively. The notification only fires for recoveries that happen after this CR is live.

---

## 8. Recommended Build Sequence

**Phase 1: Schema and migration (1 day)**

1. Add three new User fields (recovery_notification_pending, last_recovery_summary, last_recovery_dismissed_at)
2. Write pre-migration duplicate check
3. Run pre-migration check; resolve any duplicates manually if found
4. Add unique constraint on clerk_user_id

**Phase 2: Auth resolution rework (1-2 days)**

5. Implement `getOrCreateUserFromClerk` with Clerk ID primary lookup
6. Implement `syncProfileFromClerk`
7. Implement `logAuthEvent` helper
8. Implement race-condition handling on user creation

**Phase 3: Orphan recovery (1-2 days)**

9. Implement `verifyIsOrphan`
10. Implement `reattachOrphanData` (transactional, all entity types)
11. Implement `attemptOrphanRecovery` (called from auth resolution)
12. Implement `scanForOrphanByClerkIdentity` (active scan during create path)

**Phase 4: Backfill scan (1 day)**

13. Implement one-time backfill scan
14. Wire to deployment / migration trigger
15. Test against representative data; review report carefully

**Phase 5: User-facing notification (0.5 day)**

16. Recovery banner component
17. Recovery summary detail page
18. Wire to user state on auth resolution

**Phase 6: Empty Trash enhancement (0.5 day)**

19. Verify Replit fix's confirmation; enhance entity counts if needed
20. Ensure all entity types counted

**Phase 7: Verification**

21. All 35 verification steps

---

## 9. What is NOT in this CR

**CR 2 (admin panel) territory:**
- Admin UI for viewing users, audit logs, orphan reports
- Manual orphan resolution UI (the automatic recovery covers most cases; admin UI is for the rare cases that need oversight)
- System metrics dashboard
- Duplicate User merge UI

**Not in scope:**
- Notifying users about historical recoveries (pre-CR)
- Cross-Clerk-instance migration tooling
- User data export
- Account deletion flow

If you find yourself building any of these, stop.

---

## 10. Final note

This CR converts the auth resolution from "mostly works, fails silently in edge cases" to "architecturally sound, recovers automatically when it can." Combined with the Replit fix already in production, the data loss issue should be permanently resolved.

The automatic recovery is conservative by design — it only acts when confidence is high (verified email match, no recent auth on orphan, content exists). Edge cases that don't meet the bar surface in audit logs for admin review (CR 2 builds the UI for that review).

After this CR ships and the backfill runs, all known orphaned data should be back in the right hands. CR 2 then provides ongoing visibility to catch anything new.

Begin with section 8, Phase 1.
