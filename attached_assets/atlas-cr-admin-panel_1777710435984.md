# Atlas CR — Admin Panel

## Read this entire CR before taking any action.

---

## 1. Overview

This CR builds a basic admin panel for system-level oversight. It's deliberately minimal: visibility into users, system metrics, recent auth events, and orphan recovery activity — plus tools for the rare cases when automatic recovery (CR 1) can't act and manual intervention is needed.

The admin panel is accessible only to a single user identified by email. For now, that's `umar@rana.pk` — hardcoded as the admin identifier. No admin-management UI exists; adding admins requires a code change. This is appropriate for the current scale.

**The work:**

1. **Admin access gating** — only `umar@rana.pk` can access; everyone else gets 404
2. **Admin home dashboard** — system metrics at a glance
3. **User list** — all users with key info
4. **User detail view** — per-user data summary, identity, recent auth events
5. **Orphan inspector** — view recoveries the system has performed automatically; flag any that look wrong; rarely-needed manual relink for cases the system couldn't auto-resolve
6. **Audit log explorer** — filterable view of all audit log entries
7. **System job status** — read-only view of scheduled job runner state

**Pre-requisites:**

- CR 1 (Auth Hardening) shipped and stable
- Audit log infrastructure works
- Existing User table with comprehensive fields

**Estimated scope:** 4-5 days of focused work. Lower priority than CR 1; ship after CR 1 is verified.

---

## 2. Architecture

### 2.1 Admin access gating

Admin status is determined by the User's email matching a hardcoded value:

```typescript
// In a constants file
export const ADMIN_EMAILS = ['umar@rana.pk'] as const

export function isAdmin(user: User): boolean {
  return ADMIN_EMAILS.includes(user.email.toLowerCase() as any)
}
```

Every admin route and tRPC procedure checks this. Non-admins get 404 (not 403 — we don't want to advertise that the route exists).

**Why hardcoded vs. database flag**: at this scale, hardcoding is simpler and more secure (a database flag could be set incorrectly via an unrelated bug). When admin needs change (rare), it's a code change. Acceptable.

**Why email vs. Clerk ID**: emails are stable and human-readable. Clerk IDs change in edge cases (the very issue CR 1 fixed). Using email keeps the admin definition stable across Clerk identity events.

### 2.2 Admin routes are isolated

All admin routes live under `/admin`. They share no layout or navigation with the regular app. The admin panel is its own surface — opening it feels like entering a different application.

This separation prevents admin functionality from leaking into non-admin contexts and makes it visually obvious when you're operating with elevated privileges.

### 2.3 Admin actions are logged

Every action taken in the admin panel writes an audit log entry with `actor_type = 'admin'`. This creates a paper trail for any administrative changes made to user data.

---

## 3. Detailed deliverables

### 3.1 Admin gate

#### 3.1.1 Route-level

`/admin/*` routes use a layout that checks admin status. Non-admins get a 404 page (the standard one used elsewhere in the app, no special admin-related messaging).

```typescript
// app/admin/layout.tsx
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  
  if (!user || !isAdmin(user)) {
    notFound()  // Returns 404
  }
  
  return <AdminShell>{children}</AdminShell>
}
```

#### 3.1.2 tRPC procedures

Admin procedures live in a separate router:

```typescript
// server/routers/admin.ts
export const adminRouter = router({
  // All procedures use adminProcedure middleware
  systemMetrics: adminProcedure.query(...),
  listUsers: adminProcedure.query(...),
  // etc.
})

const adminProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !isAdmin(ctx.user)) {
    throw new TRPCError({ code: 'NOT_FOUND' })  // 404, not 401/403
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})
```

#### 3.1.3 Visual indicator

When viewing the admin panel, a subtle banner at the top makes clear you're in admin mode:

```
+------------------------------------------------------------+
|  ADMIN PANEL                                          [X]  |
+------------------------------------------------------------+
```

Click X → returns to the regular app. Banner color is muted (not alarming) but distinct from regular app chrome.

### 3.2 Admin home (dashboard)

Landing page of `/admin`. Shows system metrics at a glance.

```
+------------------------------------------------------------+
|  Atlas Admin                                               |
+------------------------------------------------------------+
|                                                            |
|  USERS                                                     |
|  ┌────────────────────────────────────────────────────┐  |
|  │ Total active users: 7                               │  |
|  │ Created this week: 1                                │  |
|  │ Active in past 7 days: 5                            │  |
|  │ Active in past 30 days: 7                           │  |
|  └────────────────────────────────────────────────────┘  |
|                                                            |
|  CONTENT                                                   |
|  ┌────────────────────────────────────────────────────┐  |
|  │ Total tasks: 1,247                                  │  |
|  │ Total projects: 23                                  │  |
|  │ Total notes: 89                                     │  |
|  │ Total tables: 4 (when 4b ships)                     │  |
|  │ Total attachments: 156 (1.2 GB)                     │  |
|  └────────────────────────────────────────────────────┘  |
|                                                            |
|  RECOVERY ACTIVITY (past 30 days)                         |
|  ┌────────────────────────────────────────────────────┐  |
|  │ Auto-recoveries: 3                                  │  |
|  │ Users affected: 2                                   │  |
|  │ Entities reattached: 234                            │  |
|  │ [View detail →]                                      │  |
|  └────────────────────────────────────────────────────┘  |
|                                                            |
|  AUTH EVENTS (past 24 hours)                              |
|  ┌────────────────────────────────────────────────────┐  |
|  │ Resolutions by Clerk ID: 47                         │  |
|  │ Resolutions by email fallback: 1                    │  |
|  │ Orphan recoveries: 0                                │  |
|  │ New user creations: 0                               │  |
|  │ Failed authentications: 0                           │  |
|  │ [View audit log →]                                   │  |
|  └────────────────────────────────────────────────────┘  |
|                                                            |
|  SYSTEM JOBS                                               |
|  ┌────────────────────────────────────────────────────┐  |
|  │ Drive sync — Notes: ✓ Last run 3:00 PM (success)   │  |
|  │ Drive sync — Tables: ✓ Last run 3:00 PM (success)  │  |
|  │ Session cleanup: ✓ Ran 3:00 AM today               │  |
|  │ Trash retention: ✓ Ran 4:00 AM today               │  |
|  │ [View jobs →]                                        │  |
|  └────────────────────────────────────────────────────┘  |
|                                                            |
+------------------------------------------------------------+
```

All numbers computed from existing tables — no new aggregation tables needed. Cache aggressively (TanStack Query with 30s staleTime) since admin doesn't need real-time precision.

### 3.3 User list

Page at `/admin/users`. Lists all users (active and soft-deleted).

```
+------------------------------------------------------------+
|  Users                                                     |
+------------------------------------------------------------+
|                                                            |
|  [Search by email or name...]                              |
|                                                            |
|  Filter: [Active ▼]  Sort: [Last activity ▼]              |
|                                                            |
|  ┌──────────────────────────────────────────────────────┐ |
|  │ Umar (umar@rana.pk)                                   │ |
|  │ 234 tasks · 8 projects · 47 notes                     │ |
|  │ Last active: 2 minutes ago                            │ |
|  │ Created: Jan 15, 2026                                 │ |
|  │ [View →]                                                │ |
|  └──────────────────────────────────────────────────────┘ |
|                                                            |
|  ┌──────────────────────────────────────────────────────┐ |
|  │ Fatima (fatima@example.com)                           │ |
|  │ 47 tasks · 2 projects · 12 notes                      │ |
|  │ Last active: 3 hours ago                              │ |
|  │ Created: Mar 22, 2026                                 │ |
|  │ [View →]                                                │ |
|  └──────────────────────────────────────────────────────┘ |
|                                                            |
|  ...                                                        |
|                                                            |
|  Showing 7 of 7 users                                      |
|                                                            |
+------------------------------------------------------------+
```

Filter options:
- All (active + soft-deleted)
- Active (default; deleted_at IS NULL)
- Deleted (deleted_at IS NOT NULL — includes orphans soft-deleted by recovery)

Sort options:
- Last activity (default; recent first)
- Created (newest or oldest first)
- Name (A-Z)
- Email (A-Z)
- Total content (most or least)

Each card shows email, name, content summary, last activity timestamp, creation date.

Click a user card → user detail page.

### 3.4 User detail view

Page at `/admin/users/[user_id]`. Comprehensive view of a single user.

```
+------------------------------------------------------------+
|  ← Back to users                                           |
|                                                            |
|  Umar                                                      |
|  umar@rana.pk · Created Jan 15, 2026                       |
|  Clerk ID: clerk_abcdef...                                 |
|  Last active: 2 minutes ago                                |
|                                                            |
|  ── CONTENT SUMMARY ──                                     |
|                                                            |
|  Tasks:        234 active · 89 completed · 12 in trash    |
|  Projects:     8 (5 projects, 2 goals, 1 travel)           |
|  Notes:        47 (12 meeting notes, 8 briefs, 27 notes)  |
|  Tables:       4 (when 4b ships)                           |
|  Attachments:  23 (45 MB)                                  |
|  Captures:     156 processed                                |
|  Tags:         34 distinct                                 |
|  Contexts:     6 distinct                                  |
|                                                            |
|  ── IDENTITY ──                                            |
|                                                            |
|  Internal User ID: 019dd9d4-...                            |
|  Clerk User ID: clerk_abcdef...                            |
|  Verified emails:                                          |
|    • umar@rana.pk (primary)                                |
|    • [other emails if any]                                 |
|                                                            |
|  Locale: Pakistan (PKR, dd-mm-yyyy, 12h)                  |
|                                                            |
|  ── RECENT AUTH EVENTS (last 30 days) ──                  |
|                                                            |
|  May 2, 2:14 PM  resolved_by_clerk_id                     |
|  May 2, 9:03 AM  resolved_by_clerk_id                     |
|  May 1, 6:22 PM  resolved_by_clerk_id                     |
|  Apr 30, 11:00 AM resolved_by_email_fallback ⚠           |
|                    previous Clerk ID: clerk_xyz...        |
|                    [View detail →]                          |
|                                                            |
|  [View full audit log →]                                  |
|                                                            |
|  ── RECOVERY HISTORY ──                                    |
|                                                            |
|  No recoveries.                                            |
|                                                            |
|  (Or, if recoveries occurred:)                             |
|                                                            |
|  Apr 30, 11:00 AM  Recovered 47 tasks, 3 projects from   |
|                    orphan user 018xxxx-...                |
|                    [View detail →]                          |
|                                                            |
+------------------------------------------------------------+
```

The page surfaces key info without overwhelming. Detail expansions exist for power-user inspection.

### 3.5 Audit log explorer

Page at `/admin/audit`. Filterable view of all audit log entries.

```
+------------------------------------------------------------+
|  Audit Log                                                 |
+------------------------------------------------------------+
|                                                            |
|  [Filters: Action ▼ User ▼ Date range ▼]                  |
|  [Reset]                                                   |
|                                                            |
|  Showing entries from May 1 - May 2 (47 results)          |
|                                                            |
|  ┌──────────────────────────────────────────────────────┐ |
|  │ May 2, 2:14 PM                                         │ |
|  │ User: Umar (umar@rana.pk)                              │ |
|  │ Action: auth_resolved_by_clerk_id                      │ |
|  │ Target: User Umar                                      │ |
|  │ [Expand metadata]                                       │ |
|  └──────────────────────────────────────────────────────┘ |
|                                                            |
|  ┌──────────────────────────────────────────────────────┐ |
|  │ May 2, 1:30 PM                                         │ |
|  │ User: Umar                                             │ |
|  │ Action: task_created                                   │ |
|  │ Target: Task "Review Q2 numbers"                       │ |
|  │ [Expand metadata]                                       │ |
|  └──────────────────────────────────────────────────────┘ |
|                                                            |
|  ...                                                        |
|                                                            |
|  [Load 50 more]                                            |
|                                                            |
+------------------------------------------------------------+
```

Filters:
- Action: all actions, or specific (auth_*, task_*, note_*, orphan_*, etc.). Pre-grouped by category.
- User: all users, or specific user
- Date range: today, past 7 days, past 30 days, custom range
- Warning flag: show only entries with `audit_warning = true` (highlights anomalies)

Each entry expandable to show full metadata JSON (formatted, not raw).

The audit log can be very large. Default load is 50 entries; "Load more" appends another 50. No virtualized scrolling — keep it simple.

### 3.6 Orphan inspector

Page at `/admin/recoveries`. Surfaces orphan recovery activity from CR 1's automatic recovery.

```
+------------------------------------------------------------+
|  Recovery Activity                                         |
+------------------------------------------------------------+
|                                                            |
|  Total recoveries (all time): 3                            |
|  Past 30 days: 3                                           |
|  Past 7 days: 0                                            |
|                                                            |
|  ── RECENT AUTOMATIC RECOVERIES ──                         |
|                                                            |
|  ┌──────────────────────────────────────────────────────┐ |
|  │ Apr 30, 11:00 AM                                       │ |
|  │ Canonical: Umar (umar@rana.pk)                         │ |
|  │ Orphan: 018xxxx-... (umar@rana.pk - duplicate row)    │ |
|  │ Recovered: 47 tasks, 3 projects, 12 notes             │ |
|  │ Trigger: backfill_scan                                  │ |
|  │ [View full details]   [Flag as wrong]                   │ |
|  └──────────────────────────────────────────────────────┘ |
|                                                            |
|  ┌──────────────────────────────────────────────────────┐ |
|  │ Apr 30, 11:01 AM                                       │ |
|  │ Canonical: Fatima (fatima@example.com)                │ |
|  │ Orphan: 018yyyy-...                                    │ |
|  │ Recovered: 23 tasks, 1 project                         │ |
|  │ Trigger: auth_login                                     │ |
|  │ [View full details]                                     │ |
|  └──────────────────────────────────────────────────────┘ |
|                                                            |
|  ── POSSIBLE ORPHANS NOT YET RECOVERED ──                 |
|                                                            |
|  These users have content but no recent auth.              |
|  CR 1's auto-recovery couldn't match them confidently.    |
|                                                            |
|  ┌──────────────────────────────────────────────────────┐ |
|  │ User 018zzzz-... (no email, possibly stale)           │ |
|  │ 5 tasks, 1 project · Last activity 90 days ago        │ |
|  │ [Investigate]                                            │ |
|  └──────────────────────────────────────────────────────┘ |
|                                                            |
+------------------------------------------------------------+
```

#### 3.6.1 Recovery detail

Click "View full details" on a recovery → detail page showing:

- Full counts per entity type
- Timestamp and trigger (login event ID, backfill run ID, etc.)
- Source orphan User row (full record before deletion)
- Audit log entries from the reattachment transaction

#### 3.6.2 Flag as wrong

If a recovery looks incorrect (rare; the auto-recovery is conservative), admin can flag it. This:
1. Marks the audit log entry with `flagged_for_review = true`
2. Does NOT automatically reverse the recovery
3. Surfaces the flag in the admin home dashboard

Reversing a flagged recovery is manual and requires care — out of scope for this CR. The flag exists to make problems visible.

#### 3.6.3 Possible orphans not yet recovered

The bottom section shows User rows that look orphan-like but didn't auto-recover. These are typically:
- Users with no verified email (rare but possible)
- Users whose email doesn't match any active user
- Users where the auto-recovery's confidence threshold wasn't met

#### 3.6.4 Investigate (manual recovery)

For unrecovered orphans, admin can click "Investigate" to see the orphan's content and decide what to do:

```
+------------------------------------------------------------+
|  Investigate orphan: 018zzzz-...                          |
+------------------------------------------------------------+
|                                                            |
|  EMAIL: (none recorded)                                    |
|  CREATED: Feb 3, 2026                                      |
|  LAST ACTIVITY: Feb 5, 2026 (3 months ago)                |
|  CONTENT:                                                  |
|    • 5 tasks                                               |
|    • 1 project                                             |
|                                                            |
|  ── TASKS ──                                               |
|  • "Review Q1 numbers" (created Feb 3)                    |
|  • "Send proposal to client" (created Feb 4)              |
|  • "Update website" (created Feb 5)                       |
|  ...                                                        |
|                                                            |
|  ── ACTIONS ──                                             |
|                                                            |
|  This data appears stale (no auth in 3 months) and       |
|  cannot be confidently matched to any active user.        |
|                                                            |
|  [Reattach to user...]    [Soft-delete orphan]            |
|  [Leave alone]                                             |
|                                                            |
+------------------------------------------------------------+
```

**Reattach to user**: shows a user picker. Admin selects the canonical user. Confirmation dialog: "Move 5 tasks and 1 project from orphan 018zzzz-... to Umar (umar@rana.pk)? This action cannot be undone." Confirm → reattachment runs (using same logic as auto-recovery), audit logged, admin redirected back.

**Soft-delete orphan**: marks the orphan as deleted. Data is retained but no longer surfaces. Recoverable from trash if needed within retention period.

**Leave alone**: closes the page without action. Orphan remains in the "possible orphans" list.

### 3.7 System jobs view

Page at `/admin/jobs`. Read-only view of scheduled job runner state.

This duplicates the existing Settings → System → Jobs page but accessible from the admin panel for convenience. Shows the same job list with last run, next run, status, and pause/resume controls.

If the user is an admin AND has access to their own Settings, both surfaces work. Future enhancement: admin can see jobs across all users, but for the current scale (single shared job runner), this isn't relevant.

### 3.8 Admin action audit logging

Every action taken in the admin panel writes an audit log entry:

- `admin_viewed_user` (when admin opens a user detail page) — informational
- `admin_flagged_recovery` (when admin flags a recovery as wrong)
- `admin_manual_reattach` (when admin manually reattaches an orphan)
- `admin_soft_deleted_orphan` (when admin soft-deletes an orphan)

Each entry has `actor_type = 'admin'` to distinguish from user or system actions.

Admin-viewed entries are informational and don't show prominently in the audit log explorer (admin viewing their own actions creates noise). They're queryable but filtered out by default.

---

## 4. tRPC procedures

```typescript
// All under adminRouter; require admin gate

admin.systemMetrics() → SystemMetrics
  // For dashboard. Returns user counts, content counts, recovery activity, recent auth events, job status

admin.users.list({ filter, sort, limit, cursor }) → User[]

admin.users.byId({ id }) → User & {
  content_summary: ContentSummary,
  recent_auth_events: AuditLog[],
  recovery_history: AuditLog[],
}

admin.audit.search({ filters, limit, cursor }) → AuditLog[]

admin.recoveries.list({ limit, cursor }) → RecoveryEvent[]

admin.recoveries.byId({ id }) → RecoveryDetail

admin.recoveries.flag({ recovery_id, reason? })

admin.orphans.listPossible({ limit, cursor }) → User[]
  // Users with content but no recent auth

admin.orphans.investigate({ orphan_id }) → OrphanDetail
  // Full orphan info including content samples

admin.orphans.reattach({ orphan_id, canonical_user_id })
  // Manual reattachment; uses same logic as auto-recovery

admin.orphans.softDelete({ orphan_id })
  // Marks orphan as deleted

admin.jobs.list() → JobInfo[]
  // Read-only view of job state
```

---

## 5. File changes

```
/atlas
  /src
    /app
      /admin
        /layout.tsx                  (admin gate, shell)
        /page.tsx                    (dashboard)
        /users
          /page.tsx                  (user list)
          /[id]/page.tsx             (user detail)
        /audit
          /page.tsx                  (audit log explorer)
        /recoveries
          /page.tsx                  (recovery activity)
          /[id]/page.tsx             (recovery detail)
        /orphans
          /[id]/page.tsx             (investigate orphan)
        /jobs
          /page.tsx                  (jobs view)
    /components
      /admin
        admin-shell.tsx              (layout with banner, navigation)
        admin-banner.tsx             (visual indicator at top)
        metric-card.tsx              (dashboard metric tiles)
        user-list-item.tsx
        user-detail.tsx
        audit-log-table.tsx
        audit-filter-bar.tsx
        recovery-card.tsx
        recovery-detail.tsx
        orphan-investigation.tsx
        manual-reattach-dialog.tsx
    /lib
      admin-gate.ts                  (isAdmin function and constants)
    /server
      /routers
        admin.ts                     (all admin tRPC procedures)
```

---

## 6. Verification

### Admin gate
1. Login as `umar@rana.pk` → can access `/admin/*` routes
2. Login as any other user → `/admin/*` returns 404
3. tRPC admin procedures fail with 404 for non-admin users
4. Admin banner visible at top of all `/admin/*` pages
5. Click X on banner → returns to `/` (regular app)

### Admin dashboard
6. Navigate to `/admin` → dashboard loads with system metrics
7. Metrics include: user counts, content counts, recovery activity, auth events, job status
8. Numbers reflect actual database state
9. Section navigation links work (View detail, View audit log, View jobs)

### User list
10. Navigate to `/admin/users` → user list loads
11. Search by email finds matching users
12. Filter "Active" shows only deleted_at IS NULL users
13. Filter "Deleted" shows soft-deleted users (including orphans soft-deleted by recovery)
14. Sort options work (last activity, created date, name, email, content)
15. Each user card shows email, name, content summary, last activity, created date
16. Click user card → navigates to user detail

### User detail
17. User detail page loads with comprehensive info
18. Content summary shows actual entity counts
19. Identity section shows internal User ID, Clerk ID, verified emails, locale
20. Recent auth events list shows last 30 days of auth_* audit log entries
21. Auth events with audit_warning flag are visually distinct
22. Recovery history section shows past recoveries (or "No recoveries")
23. View detail links work for individual events

### Audit log explorer
24. Navigate to `/admin/audit` → audit log table loads
25. Default filter: past 7 days, all actions, all users
26. Action filter pre-grouped by category (auth_*, task_*, etc.)
27. User filter: dropdown of all users
28. Date range filter: today, past 7 days, past 30 days, custom
29. Warning-only filter shows entries with audit_warning=true
30. Pagination: load 50 more works
31. Expand metadata shows formatted JSON
32. Total result count visible at top

### Orphan inspector
33. Navigate to `/admin/recoveries` → recovery activity loads
34. Total recovery counts visible (all time, past 30 days, past 7 days)
35. Recent recoveries listed with canonical user, orphan, counts, trigger
36. View full details opens recovery detail page
37. Flag as wrong sets flagged_for_review on the audit log entry
38. Possible orphans section shows users with content but no recent auth
39. Investigate orphan opens detail page
40. Reattach to user shows user picker; confirmation dialog before action
41. Manual reattach uses same logic as auto-recovery; transactional
42. Soft-delete orphan marks deleted_at; orphan no longer in active lists
43. All admin actions create audit log entries with actor_type='admin'

### Jobs view
44. Navigate to `/admin/jobs` → job list loads
45. Same content as Settings → System → Jobs (or comparable)
46. Read-only or with controls (run-now, pause/resume) — same as Settings page

### Performance
47. Dashboard loads in under 1 second on standard data
48. User list with 50+ users renders smoothly
49. Audit log with 500+ entries paginates correctly
50. No N+1 queries on user detail (verify with query log)

When all 50 verification steps pass, this CR is complete.

---

## 7. Rules of engagement

### 7.1 Admin gate is unconditional

Every admin route, every admin tRPC procedure must check `isAdmin(ctx.user)`. No exceptions. If you find a route or procedure that's "almost admin-only" but skips the check, fix it.

### 7.2 404, not 403

Non-admins accessing admin routes get 404. This avoids advertising the admin functionality. The admin panel exists; it's just invisible to anyone who doesn't have access.

### 7.3 Manual orphan reattachment uses auto-recovery's logic

Don't write a separate reattachment implementation for the manual case. Reuse the `reattachOrphanData` function from CR 1 with the admin-supplied canonical user. The logic should be identical; the only difference is the trigger (admin click vs. auto-detection).

### 7.4 No bulk admin operations in v1

Don't build "select multiple users and bulk-update," "select multiple orphans and bulk-reattach," or similar. The current scale (single-digit users) doesn't justify it. If real use shows the need, add specifically scoped bulk operations later.

### 7.5 Admin action audit logging is non-negotiable

Every meaningful admin action writes an audit log entry. Even read-only actions like viewing a user detail page log a low-priority entry (admin_viewed_user). This creates accountability for the admin user (you).

### 7.6 No admin can modify another admin's data

This is moot for now (single admin) but the principle should be enforced: admin tools modify USER data, not other admin data. If two admins existed, neither could modify the other's data through the admin panel.

### 7.7 Read-only first, careful with mutations

Most admin functionality is read-only. The mutations exist (flag recovery, manual reattach, soft-delete orphan) but each requires:
- Clear confirmation dialog
- Audit log entry
- Visible result feedback ("Reattached 5 tasks to Umar")

Don't add mutations without these safeguards.

---

## 8. Recommended Build Sequence

**Phase 1: Foundation (1 day)**

1. Admin gate (isAdmin function, layout check, tRPC middleware)
2. Admin shell with banner
3. Routing structure for `/admin/*`

**Phase 2: Dashboard (1 day)**

4. System metrics tRPC procedure
5. Dashboard page with metric cards
6. Wiring to real data

**Phase 3: User list and detail (1 day)**

7. User list with filtering and sorting
8. User detail page with comprehensive sections
9. Audit log queries scoped to single user

**Phase 4: Audit log explorer (1 day)**

10. Audit log search with filters
11. Pagination
12. Metadata expansion

**Phase 5: Recovery and orphan tools (1.5 days)**

13. Recovery activity list
14. Recovery detail page
15. Orphan investigation page
16. Manual reattach dialog (reusing CR 1's logic)
17. Soft-delete orphan flow
18. Flag as wrong functionality

**Phase 6: Jobs and polish (0.5 day)**

19. Jobs view
20. Admin action audit logging
21. Performance tuning (cache, query optimization)

**Phase 7: Verification**

22. All 50 verification steps

---

## 9. What is NOT in this CR

**Not in scope:**
- Multiple admins / admin management UI
- User impersonation (logging in as another user)
- Direct database editing (use psql for that)
- User data export from admin panel
- Account deletion from admin panel
- Email templates / notifications from admin panel
- Analytics / charts beyond simple counts
- Time-series visualization of metrics
- Audit log archival or rotation
- Role-based permissions (read-only vs. write admin)

**Phase 2 territory:**
- Admin RBAC (multiple admin levels)
- Bulk operations
- Custom audit log searches saved as views
- Email digests of admin activity

If you find yourself building any of these, stop.

---

## 10. Final note

This admin panel exists for two reasons: visibility and oversight. You can see what's happening in the system (users, content, auth events, recoveries) and you can intervene when the automatic systems can't handle a case (manual orphan reattachment).

The deliberate constraints — single hardcoded admin, no impersonation, no bulk operations, conservative mutations — keep the panel focused on what's actually needed at this scale. Productivity tools that try to be enterprise admin platforms become untrustworthy; this stays small and trustworthy.

If real use shows specific gaps (e.g., you find yourself wanting to filter the audit log by metadata field X, or you need to see usage trends), those become future work. Don't pre-build for hypothetical needs.

Begin with section 8, Phase 1.
