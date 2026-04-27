# Replit Agent Prompt — Wave 3b: Tasks Module (Forecast and Review)

## Read this entire prompt before taking any action.

---

## 1. Wave 3b Overview

Wave 3a shipped the GTD core: Tasks and Projects, Inbox/Today/Flagged/Projects/Contexts/Tags/Trash, capture, inspector, bulk operations, cross-module references. Atlas is now usable for daily GTD.

**Wave 3b adds the parts of Tasks that require real usage to design well:**

- **Forecast view** — timeline of the next 7 days
- **Review mode** — walks through projects that need review
- **Completed perspective** — view of completed tasks
- **Project folders** — hierarchical organization
- **Sequential project "available" filtering** — only the first incomplete task is active in sequential projects

These features distinguish a serious GTD system from a basic task list. Forecast is what makes weekly planning real. Review is what keeps the system trustworthy over time. Completed history is what makes audit and pattern-recognition possible.

**By end of Wave 3b, the user can plan the week ahead, run a real weekly review, organize many projects into folders, and look back at what's been accomplished.**

---

## 2. Pre-requisite: Real usage of Wave 3a

Before starting Wave 3b, the user (Umar) should have used Wave 3a's Tasks module for at least 2 weeks of actual daily work. This wave is designed to address gaps that only become visible through real use.

If you have notes from real usage about what feels missing or awkward, mention them now — Wave 3b's specifics may need adjustment.

---

## 3. Stack (continuing from Waves 0-3a)

No new dependencies expected. Wave 3b composes existing primitives:

- Stratum components (Card, Tabs, DatePicker, etc.)
- Wave 3a's Task, Project, Context, Tag entities
- Wave 1's Calendar integration tokens (read-only access for Forecast overlay)
- TanStack Query for caching, Zustand for ephemeral UI state

---

## 4. Wave 3b Deliverables

### 4.1 Schema additions

Add the following entities. Wave 3a's existing Task and Project entities already have fields anticipating Wave 3b (`folder_id`, `is_sequential`, `last_reviewed_at`, `review_interval_days`). This wave adds the Folder entity and activates those fields.

```prisma
model ProjectFolder {
  id                String    @id @default(uuid()) @db.Uuid
  user_id           String    @db.Uuid
  user              User      @relation(fields: [user_id], references: [id])
  
  name              String
  color_token       String?
  
  // Folders can nest (parent_id is null for root-level folders)
  parent_id         String?   @db.Uuid
  parent            ProjectFolder?  @relation("FolderHierarchy", fields: [parent_id], references: [id])
  children          ProjectFolder[] @relation("FolderHierarchy")
  
  // Position within parent (or root) for manual ordering
  position          Decimal   @db.Decimal(20, 10)
  
  // Folder description (optional)
  notes             String?
  
  // Collapsed state in sidebar (per-user UI state, but stored here for persistence)
  collapsed         Boolean   @default(false)
  
  // Projects in this folder
  projects          Project[]
  
  created_at        DateTime  @default(now()) @db.Timestamptz
  updated_at        DateTime  @updatedAt @db.Timestamptz
  deleted_at        DateTime? @db.Timestamptz
  
  @@index([user_id, deleted_at])
  @@index([user_id, parent_id])
}
```

The existing `Project.folder_id` foreign key now references this entity.

**Schema design notes:**

- Folders can nest. Root-level folders have `parent_id = null`. Reasonable depth limit: 5 levels. Beyond that, the user should reconsider their structure.
- Deleting a folder does NOT delete its projects or sub-folders. Confirmation dialog: "Delete folder 'X'? Its 5 projects and 2 sub-folders will move to root."
- Position is for manual ordering within parent (or root).

Migrate the schema. Verify migration succeeds.

### 4.2 Forecast view

The Forecast perspective shows a timeline of the next 7 days plus today.

**Layout:**

```
+---------+------------------------------------------------------+
| MODULE  | FORECAST                                             |
| RAIL    +------------------------------------------------------+
|         |                                                      |
|         |  Mon 28      Tue 29      Wed 30      Thu 1     ...  |
|  TASKS  |  Apr         Apr         Apr         May            |
|  SIDE   +-------------+-------------+-------------+-----------+
|  BAR    |             |             |             |           |
|         |  [Calendar  | [Calendar   | [Calendar   |           |
|         |   events    |  events     |  events     |           |
|         |   read-     |  read-only] |  read-only] |           |
|         |   only]     |             |             |           |
|         |             |             |             |           |
|         |  ─────────  | ─────────   | ─────────   | ────────  |
|         |             |             |             |           |
|         |  Tasks due  | Tasks due   | Tasks due   | Tasks due |
|         |  this day   | this day    | this day    | this day  |
|         |             |             |             |           |
|         |  □ Task     | □ Task      | □ Task      | □ Task    |
|         |  □ Task     |             |             |           |
|         |             |             |             |           |
+---------+-------------+-------------+-------------+-----------+
```

**Layout specifications:**

- **View modes:** "Week" (default, 7 days) and "Two weeks" (14 days, denser). Toggle in header.
- **Day columns:** Each day is a vertical column. Today's column has a subtle highlight (slightly different surface tint or accent border).
- **Top section per day:** Calendar events for that day (read from Wave 1's Google Calendar integration tokens; if Drive is linked but Calendar isn't yet, show "Connect Calendar to see events" empty state). Events show as small blocks with start time, title, calendar color.
- **Divider:** Between calendar events and tasks, a subtle horizontal line.
- **Bottom section per day:** Tasks due that day. Each task shows checkbox, title, project pill, flag.
- **Overdue stack:** A separate column (or bar above the timeline) for overdue tasks — tasks due before today that aren't complete. Visually distinct (red/amber tint). Clicking a task opens inspector.
- **Empty days:** Don't show "no tasks" for empty days; just show the day header and any calendar events. Empty visual real estate is fine — Forecast is about quick scanning, not filling space.

**Interactions:**

- **Drag a task between days** to change its due date (optimistic UI; server reschedules)
- **Click a task** → opens inspector with that task selected
- **Click a calendar event** → opens a small popover with event details (read-only in Wave 3b; full Calendar integration is Wave 5)
- **Hover a day header** → shows day's load summary: "5 tasks, 3 events, ~4 hours estimated"
- **Click a day header** → filters task list to just that day (returns to standard task list view, perspective shows "Tasks due [date]")

**Forecast intelligence (lightweight, no AI):**

- Day load indicator: small bar under day header showing relative load (sum of estimated_minutes of tasks + duration of events)
- "Light day" / "Heavy day" / "Overloaded day" labels (heuristic: based on user's average load over past N days)
- Stale tasks (defer date reached but not started) get a gentle visual indicator

**Calendar overlay specifications:**

- For Wave 3b, Calendar is read-only. Use the Google Calendar API via Wave 1's IntegrationToken to fetch events for the visible date range.
- Cache events for 5 minutes to avoid hitting API limits
- If Calendar isn't connected, the calendar section per day shows: "Connect Google Calendar to see events here" with a button to go to Settings → Integrations
- Wave 5 will add bidirectional Calendar sync; Wave 3b just consumes events

**Empty states:**

- Forecast empty (no tasks due in next 7 days, no calendar events): "Your week is open. Capture something with ⌘⇧I or schedule existing tasks."
- Calendar not connected: per-day calendar section shows the connect prompt; rest of forecast still functions

### 4.3 Review mode

Review is the GTD-canonical workflow for keeping the system trustworthy. Atlas's Review walks the user through projects flagged for review.

**Trigger:**
- "Review" perspective in the sidebar (badge shows count of projects awaiting review)
- A project needs review when `now - last_reviewed_at >= review_interval_days`
- Default interval: 7 days; configurable per project

**Layout:**

Single-pane focused view. Sidebar collapses, inspector hidden. The full screen is the review session.

```
+------------------------------------------------------------------+
| Review session — Project 3 of 8                          [Esc]   |
+------------------------------------------------------------------+
|                                                                  |
|   Devsinc Q2 Planning                          [Active] ▾        |
|   ─────────────────────                                          |
|                                                                  |
|   Last reviewed: 12 days ago                                     |
|   Status: Active | 14 tasks | 3 completed this period            |
|                                                                  |
|   Recent activity:                                               |
|   • Completed "Send Q2 forecast to leadership" (3 days ago)      |
|   • Created "Schedule Q2 kickoff" (5 days ago)                   |
|                                                                  |
|   Stale tasks (no activity in 14+ days):                         |
|   • Update Q2 dashboard                                          |
|   • Reach out to Asghar re: budget                               |
|                                                                  |
|   Project notes:                                                 |
|   [Editable markdown notes — same as project detail view]        |
|                                                                  |
|   ─────────────────────                                          |
|                                                                  |
|   What's the state of this project?                              |
|                                                                  |
|   [Keep active]  [Put on hold]  [Mark complete]  [Drop]          |
|                                                                  |
|   [← Previous]                              [Skip]    [Next →]   |
|                                                                  |
+------------------------------------------------------------------+
```

**Interactions:**

- **Keep active** → updates `last_reviewed_at = now()`, advances to next project
- **Put on hold** → status = on_hold, `last_reviewed_at = now()`, advances
- **Mark complete** → status = completed (with confirmation if incomplete tasks exist; option to mark all tasks complete or move them to Inbox), advances
- **Drop** → status = dropped, advances
- **Skip** → doesn't update review timestamp, just moves to next; project stays in review queue
- **Previous** → go back to previous project (changes can be edited)
- **Esc** → exit review session (progress saved; user can resume later)

**Project actions inline (no need to leave review):**

- Edit project title (inline)
- Edit project notes (inline editor)
- View tasks (collapsible section showing all tasks in project; quick check what's there)
- Add note to a stale task (e.g., "still waiting on X" without leaving review)

**Review summary (at end of session):**

```
Review complete!

You reviewed 8 projects in 12 minutes.

5 kept active
1 marked complete  
1 put on hold
1 dropped

[Done]
```

**Review settings (in project detail view):**

- Review interval: dropdown (Never review, 3 days, 7 days, 14 days, 30 days)
- "Skip next review" option (resets last_reviewed_at to now, defers next review)

### 4.4 Completed perspective

Shows completed tasks across all projects.

**Layout:** Standard task list (middle pane), filtered to `completed_at IS NOT NULL`.

**Filters:**
- Date range: Today, This week, This month, This year, All time, Custom range
- By project: dropdown to filter to one project
- By context/tag: standard filter

**Sort options:**
- Most recently completed (default)
- Oldest first
- By project
- Alphabetical

**Row display:**
- Same as regular task list rows but with strikethrough title
- Shows completion timestamp instead of due date
- Click row → inspector opens (read-only-ish; mark as uncompleted is the primary action)

**Actions:**
- Bulk uncomplete (multi-select + restore)
- Permanent delete (multi-select + delete; goes to Trash)
- Archive (Phase 2; not in 3b)

**Empty state:**
- "No completed tasks yet. Atlas will keep your completion history here."

### 4.5 Project folders

Folders organize projects hierarchically. Sidebar's Projects section becomes a tree.

**Sidebar updates:**

The Projects section becomes:

```
PROJECTS
  ▼ Devsinc                  [folder]
      ▼ Q2 2026             [folder]
          • Q2 Planning      [project]
          • Q2 Marketing     [project]
      ▶ Operations          [folder, collapsed]
  ▼ TGC
      • Brand launch
      • Founding team intro
  • Personal Health         [project at root, no folder]
  • Atlas (this project)    [project at root]
  
  [+ Add project]  [+ Add folder]
```

**Folder interactions:**

- Click folder name → expands/collapses (state persisted to `ProjectFolder.collapsed`)
- Click folder icon → folder detail view in middle pane (shows folder name, notes, child projects with their stats, child folders)
- Right-click folder → context menu (rename, change color, add project, add sub-folder, move, delete)
- Drag project onto folder → moves project into folder
- Drag folder onto another folder → nests
- Drag folder out → moves to root

**Folder detail view (middle pane when folder selected):**

```
Devsinc                                      [Edit] [⋯]
─────────────────

Strategic engagements with Devsinc, organized by domain.

Sub-folders (2)
  Q2 2026 → 2 projects, 8 active tasks
  Operations → 4 projects, 17 active tasks

Projects in this folder (3)
  Q2 Planning → 14 tasks, last activity 2 days ago
  Q2 Marketing → 8 tasks, last activity 5 days ago
  Customer Success Framework → 3 tasks, last activity 1 day ago

[+ Add project]  [+ Add sub-folder]
```

**Folder constraints:**

- Maximum nesting depth: 5 levels (warn user when attempting deeper)
- Folders are user-specific (no sharing in Phase 1)
- Folders contribute to breadcrumbs: when viewing a project, breadcrumb shows "Devsinc / Q2 2026 / Q2 Planning"

### 4.6 Sequential project "available task" filtering

Wave 3a's `Project.is_sequential` field activates in 3b.

**Behavior:**

- When `is_sequential = true`, only the *first incomplete task* in the project (by manual position order) is "available"
- "Available" tasks appear in Today, Flagged, project active list
- "Unavailable" tasks (later in sequence) are visible in the project view but visually de-emphasized (slightly dimmed, with a hint icon "Waiting for previous task")
- They DON'T appear in Today or Flagged perspectives even if their dates match
- Once the first task is completed, the next becomes available automatically

**Visual treatment in project view:**

```
[✓] Research vendor options               (completed)
[ ] Send RFP to top 3 vendors             ← AVAILABLE (next in sequence)
    Score vendor responses                ← unavailable, dimmed
    Negotiate contract terms              ← unavailable, dimmed
    Sign contract                         ← unavailable, dimmed
```

**Toggle:**
- Project setting in detail view: "Sequential project (only show next task as active)"
- Default: parallel (false)
- Changing to sequential affects view immediately

**Override:**
- If user explicitly flags an "unavailable" task, it appears in Flagged anyway (flag overrides sequence)
- Right-click → "Make this task available now" temporarily promotes a later task

### 4.7 tRPC router additions

Add to existing routers:

**Folders:**
- `folders.list({ parent_id?, includeProjects?, includeChildren? })`
- `folders.byId({ id })` → with full hierarchy and projects
- `folders.create({ name, parent_id?, color?, notes? })`
- `folders.update({ id, ...fields })`
- `folders.delete({ id })` — soft delete; projects move to root
- `folders.move({ id, new_parent_id, new_position })`
- `folders.toggleCollapsed({ id })`

**Projects (additions):**
- `projects.review({ id, action })` — action: 'keep_active' | 'on_hold' | 'completed' | 'dropped' | 'skip'
- `projects.skipReview({ id })` — reset last_reviewed_at to now without status change
- `projects.move({ id, folder_id?, position })` — move project between folders

**Forecast:**
- `forecast.week({ start_date })` — returns 7 days of tasks + calendar events
- `forecast.day({ date })` — returns single day's tasks and events
- `forecast.dayLoad({ date })` — returns load summary (task count, total estimated minutes, event count, event minutes)

**Review:**
- `review.queue()` — returns projects awaiting review, sorted by overdue-ness
- `review.summary({ session_id })` — returns review session summary (Phase 2: actual sessions; Phase 1: just current state)

**Completed:**
- `tasks.completed({ filter, sort, range })` — completed tasks list with filters
- `tasks.completionStats({ range })` — aggregate stats (count, by project, by day) for charting

### 4.8 Sidebar updates

The Tasks sidebar from Wave 3a updates:

**New perspectives (replacing the "Coming in Wave 3b" placeholders):**
- Forecast (with optional badge showing tasks needing scheduling)
- Review (with badge showing count of projects awaiting review)
- Completed (no badge needed)

**Projects section becomes a folder tree** (per 4.5).

**Reorder:**
1. Inbox
2. Today
3. Forecast (new)
4. Flagged
5. Review (new)
6. Projects (now hierarchical)
7. Contexts
8. Tags
9. Completed (new)
10. Trash

### 4.9 Command palette and shortcut additions

**New commands:**
- "Start review session" → opens review mode
- "Go to Forecast"
- "Go to Completed"
- "Add folder..." → folder creation form
- "Mark project for review" → forces a specific project into review queue

**New shortcuts:**
- `⌘⇧R` — Start review session
- `⌘⇧F` — Open Forecast (overrides any existing browser shortcut on macOS; verify no conflict)

These integrate via Wave 2's extensible registries.

### 4.10 Settings additions

In Settings → Capture (or new "Tasks" section):

- Default review interval (3/7/14/30 days; default 7)
- Forecast default range (Week/Two weeks)
- Forecast: include unscheduled tasks dropdown ("Don't include" / "Show in 'Anytime' column")
- Sequential project default for new projects (parallel/sequential; default parallel)

### 4.11 Audit log additions

New audit actions logged:
- `review_completed` (with action: kept_active/on_hold/completed/dropped/skipped)
- `folder_created`, `folder_updated`, `folder_deleted`
- `project_moved` (between folders)
- `task_rescheduled` (when dragged in Forecast)

---

## 5. File Structure (additions to Wave 3a)

```
/atlas
  /app
    /(app)
      /tasks
        /forecast
          /page.tsx                     # Forecast view
        /review
          /page.tsx                     # Review session
        /completed
          /page.tsx                     # Completed tasks
        /folders
          /[folderId]/page.tsx          # Folder detail view
  /components
    /tasks
      forecast-view.tsx
      forecast-day-column.tsx
      forecast-task-card.tsx
      review-session.tsx
      review-project-card.tsx
      review-summary.tsx
      completed-task-list.tsx
      project-folder-tree.tsx
      project-folder-detail.tsx
      sequential-task-indicator.tsx
  /core
    /forecast
      service.ts                        # Forecast computation
      load-calculator.ts                # Day load heuristics
    /review
      service.ts                        # Review queue, session management
      queue.ts                          # Determines what needs review
    /folders
      service.ts                        # Folder hierarchy operations
      tree-builder.ts                   # Convert flat folders to nested tree
  /server
    /routers
      folders.ts
      forecast.ts
      review.ts
      (projects.ts and tasks.ts get additions)
```

---

## 6. Verification (Definition of Done)

**Forecast:**
1. Navigate to Forecast → see 7-day timeline
2. Tasks due in next 7 days appear in correct day columns
3. Calendar events appear in correct day columns (if Calendar is connected; otherwise see connect prompt)
4. Today's column is visually highlighted
5. Drag a task from Wednesday to Friday → task's due date updates
6. Click a task → inspector opens
7. Hover a day header → load summary tooltip
8. Switch to Two-weeks view → 14 days visible
9. Overdue tasks appear in dedicated section with appropriate visual treatment
10. If no tasks/events: appropriate empty state

**Review:**
11. Create a project, set review_interval_days = 1
12. Wait until interval elapses (or manually set last_reviewed_at to yesterday)
13. Navigate to Review → project appears in queue
14. Click "Start review session" → focused review view appears
15. See project's recent activity, stale tasks, notes
16. Click "Keep active" → advances to next project (or summary if last)
17. Try "Put on hold" on a project → status changes
18. Try "Mark complete" with incomplete tasks → confirmation dialog appears
19. Click "Skip" → project not updated, advances
20. Press Esc → exits review session, returns to wherever
21. Reopen Review → see remaining projects

**Completed:**
22. Complete several tasks across different days
23. Navigate to Completed → see them sorted by completion date
24. Filter by "This week" → only this week's completions shown
25. Filter by project → only that project's completions
26. Click a completed task → inspector opens
27. Use bulk-select → uncomplete 3 tasks at once
28. They reappear in original locations

**Folders:**
29. Create a folder "Devsinc" → appears in sidebar at root
30. Create a project inside it (or move existing project) → appears nested
31. Create a sub-folder "Q2 2026" inside Devsinc → nested correctly
32. Move a project into the sub-folder via drag-drop
33. Click folder name → folder detail view in middle pane
34. Folder shows projects, sub-folders, stats correctly
35. Collapse folder in sidebar → state persists across page reload
36. Right-click folder → context menu works (rename, color, etc.)
37. Delete folder with projects → confirmation dialog appears, projects move to root
38. Try to nest 6 levels deep → warning appears

**Sequential projects:**
39. Create a project, mark as sequential
40. Add 4 tasks to it
41. View project → only first task appears active; others dimmed with "Waiting" indicator
42. Today view → only first task appears (if due today)
43. Complete first task → second task becomes active
44. Navigate to Today → second task now appears
45. Flag a later task in the sequential project → appears in Flagged despite sequence

**Cross-cutting:**
46. Command palette: "Start review session" works
47. Command palette: "Go to Forecast" navigates correctly
48. Keyboard shortcut ⌘⇧R triggers review
49. Audit log records all new actions correctly
50. All Wave 3a features still work (regression check)

When all 50 steps pass, Wave 3b is complete.

---

## 7. Rules of Engagement

All previous rules apply. Adding for Wave 3b:

### 7.1 Calendar overlay is read-only

In Wave 3b, Calendar events are READ-ONLY in Forecast. Do not let user edit/delete events from Forecast. That's Wave 5's territory.

If a user clicks an event in Forecast, show event details popover with "Open in Google Calendar" link. Do not build inline event editing.

### 7.2 Review must feel calm

Review is the most psychologically loaded GTD workflow — users avoid it when it feels heavy. The review session UI must:

- Show ONE project at a time (not a list)
- Provide clear, big actions (Keep active / On hold / Complete / Drop)
- Allow Skip for indecision
- Save progress automatically (Esc out, resume later)
- Never blame, criticize, or guilt the user about old projects

If the review session feels stressful or list-like, you've built it wrong.

### 7.3 Folder operations are non-destructive

Deleting a folder never destroys data. Projects move to root; sub-folders move to root (or parent of deleted folder). Confirmation dialogs spell out exactly what will happen.

### 7.4 Sequential project filter is strict

When a project is sequential and a task is "unavailable" (later in sequence):
- It does NOT appear in Today, even if due today
- It does NOT appear in Forecast's task section (but is visible in project view)
- It does NOT count in Today's task count
- It DOES appear in search results
- It DOES appear in project view (dimmed)
- It DOES appear in Flagged if flagged (flag overrides sequence)

This filtering is the whole point of sequential projects. Be strict.

### 7.5 Forecast performance

Forecast queries 7-14 days of tasks + calendar events. With Calendar overlay, this can be slow if implemented naively.

- Cache calendar events for 5 minutes per date range
- Use a single query for all 14 days of tasks (not 14 queries)
- Render skeleton state immediately, fill in events as they load
- If Calendar is unconnected, skip event queries entirely

### 7.6 Don't over-engineer review summary

The end-of-session summary is a single screen with counts. No charts, no streaks, no AI-generated reflection. Phase 2 may add intelligence; Phase 1's review is workmanlike.

### 7.7 Folder tree drag-drop must be robust

Drag-drop is the primary way users organize. It must handle:
- Drag project → folder (move)
- Drag folder → folder (nest, with depth check)
- Drag → root area (un-nest to root)
- Drag onto folder while folder is collapsed (folder expands during hover)
- Invalid drop (e.g., trying to nest a folder into itself) → cancel with subtle feedback
- Network failure during move → revert with toast

Use a tested DnD library (`dnd-kit` is recommended; if Wave 3a established a different one, continue with it).

---

## 8. Recommended Build Sequence

1. **Schema migration** — ProjectFolder entity
2. **Folder backend** — folders router, hierarchy queries, tree builder utility
3. **Folder sidebar UI** — collapsible tree, drag-drop, project nesting
4. **Folder detail view** — middle pane when folder selected
5. **Sequential project filtering** — Task.available concept, query updates, view dimming
6. **Completed perspective** — straightforward filter on completed_at
7. **Review backend** — queue logic, review actions, session state
8. **Review UI** — focused single-project view, action buttons, summary
9. **Forecast backend** — week/day queries, load calculator, calendar event fetching
10. **Forecast UI** — day columns, task placement, calendar overlay, drag-to-reschedule
11. **Sidebar updates** — replace placeholders, add Forecast/Review/Completed
12. **Command palette and shortcuts** — register new commands and shortcuts
13. **Settings additions** — review interval, forecast preferences
14. **Audit log integration** — new action types
15. **Polish pass** — empty states, loading states, error handling
16. **Verification** — all 50 steps

---

## 9. Definition of Done

- [ ] Schema migrated with ProjectFolder
- [ ] Folder CRUD with hierarchy and drag-drop
- [ ] Sidebar shows project tree
- [ ] Folder detail view in middle pane
- [ ] Sequential projects filter "unavailable" tasks correctly
- [ ] Completed perspective with date/project filters
- [ ] Review queue identifies projects correctly
- [ ] Review session UX is calm, focused, single-project-at-a-time
- [ ] Forecast week view with tasks distributed by day
- [ ] Forecast shows calendar events (read-only)
- [ ] Drag task in Forecast reschedules it
- [ ] All 50 verification steps pass
- [ ] No regressions on Wave 3a functionality
- [ ] No TypeScript errors, ESLint passes
- [ ] User confirms via real use that weekly planning and review feel right

---

## 10. What is NOT in Wave 3b

**Wave 3c (Tasks: Capture Intelligence):**
- Email-to-inbox endpoint
- AI capture parsing
- Full natural language dates

**Wave 5 (Calendar):**
- Bidirectional Calendar sync
- Drag tasks INTO calendar (time-blocking)
- Calendar event editing
- Auto-scheduling

**Phase 2:**
- Custom perspectives (saved filtered views)
- Recurring tasks
- Task templates
- Recurring review sessions (e.g., automatic weekly review reminder)
- AI review summaries
- Forecast intelligence beyond basic load
- Cross-folder task search refinements

If you find yourself building any of these, stop.

---

## 11. Final note

Wave 3b is what makes Atlas a *trustworthy* GTD system. Wave 3a made it usable; 3b makes it sustainable.

The Review is the most important piece. If users skip review (in any GTD system), the system loses trust over time and they go back to the chaos that brought them to GTD in the first place. Atlas's review must be calm enough to actually do.

Begin with section 8, step 1.
