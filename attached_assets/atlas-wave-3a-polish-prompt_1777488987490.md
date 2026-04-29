# Replit Agent Prompt — Wave 3a Polish: Tasks Module Refinement

## Read this entire prompt before taking any action.

---

## 1. Overview

Wave 3a shipped the GTD core. Real use has surfaced several rough edges that should be addressed before Wave 3b adds Forecast/Review, and definitely before Wave 4 starts on Notes. This polish wave addresses depth and refinement of the existing Tasks module rather than new feature breadth.

**The work:**

1. **Activity tab fix** — render audit log as readable sentences, not raw JSON
2. **Work logging** — manual progress entries integrated into Activity feed
3. **Subtasks vs checklists** — split the confused current implementation into two distinct concepts
4. **Recurring tasks** — full recurrence rules with from-completion and from-due-date patterns
5. **Quick actions on task rows** — hover-revealed affordances for common operations
6. **Estimated time aggregation** — totals shown in project and Today headers
7. **Defer date strictness** — verify deferred tasks don't appear in Today
8. **Forecast lookback** — Wave 3b's Forecast supports scrolling past dates

**Pre-requisites:**

- Wave 3a complete and in real use
- Wave 3c can be in progress in parallel (these don't conflict architecturally) but ideally 3c finishes first to avoid merge complexity
- This wave should land before Wave 3b if possible (so 3b's Forecast inherits the polish)

**Estimated scope:** 2-3 weeks of focused work.

---

## 2. Detailed deliverables

### 2.1 Activity tab fix and work logging

The current Activity tab displays raw JSON from the AuditLog table. This is wrong — it should be a readable chronological feed of what happened to the task, combining system-generated entries (audit log) with manual progress entries from the user.

#### 2.1.1 Audit log renderer

Create `core/audit/render.ts` that translates an AuditLog entry into a human-readable sentence:

```typescript
export function renderAuditEntry(entry: AuditLog): {
  timestamp: Date
  actor: 'system' | 'user'
  message: string  // human-readable, e.g., "Added tag #urgent"
  details?: string // optional secondary line, e.g., "from #pending"
}
```

Rendering rules per action:

- `created` → "Created this task"
- `updated` with `title` change → "Renamed to '[new title]'"
- `updated` with `due_date` change → "Set due date to [formatted date]" or "Removed due date" or "Changed due date from [old] to [new]"
- `updated` with `defer_date` change → similar
- `updated` with `flagged` change → "Flagged" or "Unflagged"
- `updated` with `project_id` change → "Moved to project [name]" or "Moved to Inbox"
- `updated` with `notes` change → "Updated notes"
- `updated` with `estimated_minutes` change → "Set estimate to [X] minutes"
- `tags.to` change with new entries → "Added tag #[name]"
- `tags.to` change with removed entries → "Removed tag #[name]"
- `contexts.to` change → "Added/removed context [name]"
- `subtasks.to` change with new entries → "Added subtask: [title]"
- `subtasks.to` change with removed entries → "Removed subtask: [title]"
- `completed` → "Marked complete"
- `uncompleted` → "Marked incomplete"
- `deleted` → "Moved to trash"
- `restored` → "Restored from trash"
- `recurrence_set` → "Set to repeat [rule description]"
- `recurrence_completed` → "Completed; next occurrence created for [date]"

For changes the renderer doesn't recognize (future field additions), fall back to a generic "Updated this task" rather than showing JSON.

Dates in messages use the user's preferred date format and timezone.

#### 2.1.2 Work log entries (manual progress)

Add a new entity `TaskWorkLog`:

```prisma
model TaskWorkLog {
  id          String    @id @default(uuid()) @db.Uuid
  user_id     String    @db.Uuid
  user        User      @relation(fields: [user_id], references: [id])
  
  task_id     String    @db.Uuid
  task        Task      @relation(fields: [task_id], references: [id])
  
  body        String    // The progress note text (markdown supported)
  
  // Optional: time spent on this update (in minutes)
  // Useful for "I worked on this for 30 minutes today"
  duration_minutes Int?
  
  created_at  DateTime  @default(now()) @db.Timestamptz
  updated_at  DateTime  @updatedAt @db.Timestamptz
  deleted_at  DateTime? @db.Timestamptz
  
  @@index([task_id, created_at])
  @@index([user_id, created_at])
}
```

A work log entry is a timestamped note the user writes about progress on the task. Examples:
- "Spent 30 min on data analysis, found discrepancy in March numbers, need to verify with Asghar"
- "Blocked: waiting for Sarah's response on the Q2 budget approval"
- "Completed first draft, sent to legal for review"

These are different from the static `Task.notes` field (which describes what the task is) and different from audit log entries (which are system-generated).

#### 2.1.3 Unified Activity feed

The Activity tab in the inspector becomes a unified chronological feed combining:

- AuditLog entries for this task, rendered as sentences
- TaskWorkLog entries for this task, displayed as written notes with timestamps

Sort by timestamp descending (most recent first).

**Width constraint handling:**

The inspector panel is approximately 360px wide. Work log entries can be substantially longer than what fits comfortably in that space. The Activity feed handles this with consistent truncation and inline expansion:

- Audit entries are always short sentences — no truncation needed (they're written to fit)
- Work log entries truncate at approximately 150 characters OR 3 lines (whichever is reached first)
- When truncated, the entry shows "Show more" inline at the end
- Click "Show more" → entry expands inline to show full content (no popup, no modal)
- When expanded, "Show less" appears to collapse back
- Multiple entries can be expanded simultaneously
- For very long entries (>800 characters), even when expanded, the entry is constrained to ~400px max height with internal vertical scroll

This pattern matches familiar feed UIs (Twitter, LinkedIn) and keeps the visual rhythm consistent — every entry is small by default, expansion is opt-in, multiple expansions don't trigger modal-style context switches.

**Visual treatment:**

```
+------------------------------------------+
|  Activity                                |
+------------------------------------------+
|                                          |
|  [+ Add update]                          |
|                                          |
|  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━         |
|                                          |
|  Today, 2:30 PM                          |
|  💬 Spent 30 minutes on the data         |
|     analysis. Found a discrepancy in     |
|     the March numbers — the variance...  |
|     Show more                            |
|     • 30 minutes                         |
|     [✏️] [🗑️] (on hover)                  |
|                                          |
|  Today, 11:45 AM                         |
|  ⚙ Added tag #urgent                     |
|                                          |
|  Today, 10:20 AM                         |
|  💬 Started working on this              |
|     • 15 minutes                         |
|                                          |
|  Yesterday, 4:15 PM                      |
|  ⚙ Set due date to May 3                 |
|                                          |
|  Yesterday, 4:14 PM                      |
|  ⚙ Created this task                     |
|                                          |
+------------------------------------------+
```

Visual distinctions:
- 💬 icon for work log entries (manual user notes)
- ⚙ icon for audit entries (system-generated)
- Work log entries truncate at ~150 chars / 3 lines with "Show more" affordance
- Work log entries have edit/delete affordances on hover (icons appear on the right)
- Audit entries don't have edit/delete (history is immutable)
- Time formatting: "Today HH:MM", "Yesterday HH:MM", "MMM D HH:MM" for older
- Duration display ("• 30 minutes") only shown if duration_minutes is set

#### 2.1.4 Add update flow

The "+ Add update" button at the top of the Activity tab opens an inline form:

```
+------------------------------------------+
|  + Add update                            |
+------------------------------------------+
|  [text area for the progress note]       |
|                                          |
|  Time spent (optional):                  |
|  [   ] minutes                           |
|                                          |
|  [Cancel]                    [Save]      |
+------------------------------------------+
```

Submit creates a TaskWorkLog entry with `created_at = now()`. Entry appears at top of Activity feed immediately (optimistic UI).

Edit and delete: each work log entry has hover affordances. Edit reopens the inline form prepopulated. Delete is soft delete with confirmation.

#### 2.1.5 tRPC procedures

```
worklogs.list({ task_id, limit?, cursor? })
worklogs.create({ task_id, body, duration_minutes? })
worklogs.update({ id, body?, duration_minutes? })
worklogs.delete({ id })

activity.feed({ task_id }) → combined audit + worklog feed, chronologically sorted
```

The `activity.feed` procedure is what the Activity tab calls — it merges audit entries and work logs into a single chronological list with type discrimination.

---

### 2.2 Subtasks and checklists split

The current implementation treats subtasks as unmodifiable strings, which is neither a good checklist nor a real subtask system. Split into two clear concepts.

#### 2.2.1 Checklist items (new concept)

Checklist items are mechanical steps within a task. Just title + checkbox. No dates, no contexts, no tags, no projects, no independent existence.

Schema addition:

```prisma
model ChecklistItem {
  id          String    @id @default(uuid()) @db.Uuid
  user_id     String    @db.Uuid
  user        User      @relation(fields: [user_id], references: [id])
  
  task_id     String    @db.Uuid
  task        Task      @relation(fields: [task_id], references: [id])
  
  title       String
  completed_at DateTime? @db.Timestamptz
  position    Decimal   @db.Decimal(20, 10)
  
  created_at  DateTime  @default(now()) @db.Timestamptz
  updated_at  DateTime  @updatedAt @db.Timestamptz
  deleted_at  DateTime? @db.Timestamptz
  
  @@index([task_id, position])
}
```

Checklist items have NO audit log (they're internal to a task) and NO work log. They're cheap, fast to create, and disappear from view when the parent is deleted (cascade soft delete).

UI in inspector — new section "Checklist":

```
CHECKLIST
─────────
☐ Call vendor and get quote
☐ Compare with current pricing
☐ Send recommendation to manager
☐ + Add item
```

Click an item title to inline-edit (Things-style: click, type, Enter saves). Drag to reorder. Click checkbox to toggle. Click "+ Add item" to create new (auto-focused for typing).

Hovering an item reveals a delete affordance.

Checklist completion progress shows on the task list row when the task has checklist items: "3/5" badge or progress bar.

#### 2.2.2 Subtasks (full Task entities)

Subtasks become real Task entities with full properties — dates, tags, contexts, notes, work log, the works. They have a parent_task_id relationship.

The existing `Task.parent_id` field already supports this from Wave 3a's schema. The behavior change is in the UI and query logic.

**Critical constraint:** subtasks can be ONE LEVEL DEEP only. A subtask cannot have its own subtasks. Enforce this in the create/update procedures:

```typescript
// In tasks.create({ parent_id, ... })
if (parent_id) {
  const parent = await prisma.task.findUnique({ where: { id: parent_id } })
  if (parent.parent_id) {
    throw new Error('Cannot create subtask of a subtask. Subtasks can only be one level deep.')
  }
}
```

Same enforcement on update if changing parent_id.

UI in inspector — new section "Subtasks":

```
SUBTASKS
────────
☐ Sub Task 1                    [May 5]  >
☐ Sub Task 2                    [Today] 🚩 >
☐ + Add subtask
```

Each subtask row shows:
- Checkbox (complete/uncomplete)
- Title (inline-editable)
- Due date if set (color-coded as in main list)
- Flag icon if flagged
- ">" affordance to open the subtask's own inspector

Click ">" → inspector opens for the subtask, replacing the parent's inspector content (with breadcrumb back to parent).

Click "+ Add subtask" → inline title entry, creates Task with parent_id set, opens its inspector for further editing if user wants (or stays in list for next quick add).

#### 2.2.3 Subtasks in main task list

The main task list shows subtasks contextually:

**In project view:**
- Parent tasks appear as normal rows
- Tasks with subtasks have a chevron affordance on the left (▶ collapsed, ▼ expanded)
- Click chevron → expands to show subtasks indented below parent
- State (collapsed/expanded) persists per parent in user preferences (Zustand local state is fine; doesn't need DB persistence)

**In Today / Flagged / date-filtered views:**
- Subtasks appear standalone if their dates/flags qualify them
- They display "↳ from [parent task title]" as a small reference line
- Clicking the parent reference navigates to parent's project context

**In Inbox:**
- Only top-level tasks (parent_id = null AND project_id = null) appear
- Orphan subtasks (parent deleted somehow) get reparented to Inbox

#### 2.2.4 Cascade behavior

Deleting a parent task: all its subtasks AND checklist items soft-delete (cascade).
Restoring a parent: subtasks and checklist items restored.
Permanent delete of parent: subtasks and checklist items permanent delete.

Moving a parent task between projects: subtasks move with it (they inherit project_id from parent or have it independently? — make subtasks track parent's project_id automatically; if parent moves, subtasks move).

Completing a parent task: with explicit confirmation, option to also complete all incomplete subtasks. Default: just complete the parent, leave subtasks alone.

#### 2.2.5 Migration of existing data

Current tasks may have entries in the existing subtask system that's the confused middle ground. Migration strategy:

1. Identify any existing subtasks (Tasks with parent_id set) — keep them as-is, they become full Task subtasks
2. If any tasks have what was conceptually a "checklist" (the unmodifiable string list), they need to be migrated:
   - For each task that has the old subtask records, examine them
   - Decision rule: if the existing "subtask" has only a title and a completed status (no dates, tags, etc.), it was probably intended as a checklist item — migrate to ChecklistItem
   - If it has any task-like properties, keep as full subtask
3. Create a migration script that performs this analysis and conversion
4. The migration is one-time; after running, all tasks have clean checklist + subtask structures

If the existing data is simple (just a few tasks during testing), manual reclassification is fine — let the user decide per task whether items should be checklists or subtasks via the inspector.

---

### 2.3 Recurring tasks

Repeating tasks like "review backups every Tuesday" or "pay rent on the 1st."

#### 2.3.1 Schema addition

Add fields to Task:

```prisma
// In Task model:
recurrence_rule    String?   // Stored as RFC 5545 RRULE string, or simplified DSL
recurrence_anchor  String    @default("due_date")  // "due_date" | "completion"
recurrence_parent_id  String? @db.Uuid  // If this task is an instance of a recurring template, points to original
```

**RRULE format choice:** use RFC 5545 RRULE strings (e.g., `FREQ=WEEKLY;BYDAY=TU`). It's the standard for calendar-style recurrence and there are good JS libraries (`rrule` package) to parse and compute next occurrences. This makes future Calendar integration trivial.

#### 2.3.2 Recurrence semantics

Two modes determined by `recurrence_anchor`:

**`due_date`** (anchor = due date):
- Task has due date X
- When completed, next occurrence is created with due date = X + period (e.g., +7 days)
- Use case: "pay rent" — always on the 1st regardless of when you actually pay
- If you complete late, next occurrence still anchors to the schedule

**`completion`** (anchor = completion date):
- Task has due date X
- When completed at time T, next occurrence created with due date = T + period
- Use case: "review backups" — you want 7 days from when you actually did it, not the schedule
- Schedule drifts based on when you complete

#### 2.3.3 Recurrence creation

When a recurring task is completed:

1. Original task marked complete (completed_at set)
2. New Task created with:
   - Same title, notes, tags, contexts, project, estimated_minutes, recurrence_rule, recurrence_anchor
   - New due_date computed from rule + anchor
   - `recurrence_parent_id` pointing to the original (or to the very first task in the chain — see "anchor task" below)
   - Position adjusted to appear in correct list order
3. Subtasks and checklist items: regenerate from the recurring task template (more on this below)
4. Audit log entry: "Completed; next occurrence created for [date]"

**Anchor task pattern:** the first task in a recurrence chain is the "anchor." All subsequent occurrences point their `recurrence_parent_id` to the anchor (not to the immediately previous task). This makes querying "all instances of this recurring task" easy.

#### 2.3.4 Subtasks and checklists in recurring tasks

When a recurring task has subtasks or checklist items, they need to repeat too. Options:

**Option A: Templates** — the original task's subtasks/checklists are templates, and each new occurrence gets fresh copies (reset to incomplete state).

**Option B: Carry forward** — subtasks/checklists move with the task; you complete them once.

**Recommendation: Option A (templates) for checklist items, Option B (carry forward) for subtasks.**

Reasoning: checklist items are mechanical steps within an instance of work — reset them. Subtasks are tasks of their own and may have independent recurrence rules — carry them forward as-is, and let users decide if they want to handle each subtask.

Actually, this gets complicated. Simpler rule: **for v1, only checklist items reset; subtasks of recurring tasks aren't supported**. If a user creates a recurring task that has subtasks, show a warning: "Recurring tasks with subtasks aren't yet supported. The subtasks won't repeat."

This is an honest limitation. Phase 2 can add proper subtask handling for recurrence.

#### 2.3.5 UI for setting recurrence

**In inspector — new section "Repeat":**

```
REPEAT
──────
[None ▼]
```

When clicked, dropdown shows:
- None
- Daily
- Every weekday
- Weekly
- Every 2 weeks
- Monthly
- Yearly
- Custom...

Choosing "Custom..." opens a more detailed form:

```
+------------------------------------------+
|  Repeat                                  |
+------------------------------------------+
|  Every [1] [day(s) ▼]                    |
|                                          |
|  On: ☑Mon ☑Tue ☑Wed ☑Thu ☑Fri ☐Sat ☐Sun |
|       (only shown for weekly)            |
|                                          |
|  After completion or due date?           |
|  ⊙ Repeat from due date                  |
|  ○ Repeat from completion date            |
|                                          |
|  Ends:                                   |
|  ⊙ Never                                  |
|  ○ After [N] occurrences                  |
|  ○ On [date]                              |
|                                          |
|  [Cancel]                    [Save]      |
+------------------------------------------+
```

The form generates an RRULE string and saves it. Display the rule in human-readable form below the dropdown:

```
REPEAT
──────
[Weekly on Mon, Wed, Fri ▼]
From completion date · No end
```

#### 2.3.6 Quick action on task list row

The hover-revealed quick actions on rows (section 2.5) include a recurrence action. Click → small popover with the same set of preset options (Daily, Weekly, Monthly, Custom...). This is a fast path for setting recurrence without opening inspector.

#### 2.3.7 Visual treatment

Tasks that are recurring show a small ↻ icon on the row, near the date. Hovering shows a tooltip: "Repeats weekly on Mondays."

In Forecast view (Wave 3b), recurring tasks have the icon to distinguish them from one-off tasks.

#### 2.3.8 tRPC procedures

```
tasks.setRecurrence({ id, rule, anchor })  // RFC 5545 RRULE + 'due_date'|'completion'
tasks.removeRecurrence({ id })
tasks.recurrenceInstances({ id, limit })  // List all instances of this recurring task chain

// tasks.complete({ id }) updates to handle recurrence:
// - If task has recurrence_rule, after completing the current task, create next occurrence
```

#### 2.3.9 Edge cases

- User edits a recurring task's title/notes: changes apply to the current instance only, not future occurrences (each instance is its own Task record). To change "all future occurrences," user opens the anchor task and edits there — future occurrences inherit from anchor at creation time.
- User deletes a recurring task: just deletes that one instance. Recurrence chain continues from the anchor.
- User deletes the anchor: chain breaks, future occurrences will not be created. Existing instances remain.
- Recurrence rule produces a date that conflicts with existing logic (e.g., feb 30): use rrule library's built-in handling, which typically skips invalid dates.

---

### 2.4 Quick actions on task list rows

When hovering a task row in the list, reveal a row of quick action affordances on the right side. Click an action to perform it without opening the inspector.

#### 2.4.1 Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ ☐ 🚩 Call Ahmed about Q2 partnership   #urgent  [May 3]            │
└────────────────────────────────────────────────────────────────────┘
                                                                      
On hover:
┌────────────────────────────────────────────────────────────────────┐
│ ☐ 🚩 Call Ahmed about Q2 partnership  [📅] [⏰] [📁] [↻] [⋯]      │
└────────────────────────────────────────────────────────────────────┘
```

The hover affordances appear on the right side, replacing the date/tag display while hovered. When mouse leaves, return to normal view.

Affordances (left to right):
- 📅 Set/change due date
- ⏰ Set/change defer date
- 📁 Move to project
- ↻ Set/change recurrence
- ⋯ More actions menu (delete, duplicate, copy link, etc.)

Click any affordance → small popover/menu opens with relevant options.

#### 2.4.2 Date affordance popover

Click 📅 → popover with quick options:

```
+----------------------+
| Today                |
| Tomorrow             |
| This Friday          |
| Next Monday          |
| In a week            |
| Custom date...       |
| ─────                |
| Remove due date      |
+----------------------+
```

Click an option → due date set immediately, popover closes, row updates with new date.

Same pattern for defer date (⏰).

#### 2.4.3 Project affordance popover

Click 📁 → popover with project picker:

```
+----------------------+
| [search...]          |
| ─────                |
| Inbox                |
| Devsinc Q2           |
| TGC Launch           |
| Personal Health      |
| ─────                |
| + Create new...       |
+----------------------+
```

Searchable, click to assign. "Create new..." inline-creates a project and assigns.

#### 2.4.4 Recurrence affordance popover

Click ↻ → quick recurrence options:

```
+----------------------+
| Daily                |
| Weekly               |
| Monthly              |
| Custom...            |
| ─────                |
| (Don't repeat)        |
+----------------------+
```

Standard presets, custom opens the full recurrence form from 2.3.5.

#### 2.4.5 More menu (⋯)

```
+----------------------+
| Open inspector       |
| Duplicate            |
| Copy link            |
| ─────                |
| Move to trash        |
+----------------------+
```

Standard task operations.

#### 2.4.6 Implementation notes

- Popovers use the existing Stratum popover/dropdown component
- Click outside to close (standard popover behavior)
- Keyboard: ESC closes popover
- Optimistic UI: changes apply immediately; failures revert with toast
- The flag affordance (🚩) is already on the row; clicking it toggles. No popover needed.

---

### 2.5 Estimated time aggregation

Tasks have `estimated_minutes`. Aggregate this in views.

#### 2.5.1 Project view header

When viewing a project, the header shows aggregate stats:

```
Devsinc Q2                    [⋯]
14 tasks · 8 incomplete · ~6 hours estimated
```

The "~6 hours" is the sum of `estimated_minutes` across incomplete tasks in the project, formatted humanely:
- < 60 min: "X minutes"
- 60-180 min: "X.Y hours"
- > 180 min: "X hours"

Skip the estimate display if no tasks have estimates set.

#### 2.5.2 Today view header

When viewing Today perspective:

```
Today · April 29
8 tasks · ~3.5 hours · 2 calendar events
```

Sum of estimates for tasks due today + scheduled today. Calendar events come from Wave 1 integration; show event count (and optionally aggregate event duration).

#### 2.5.3 Inspector subtask total

When a task has subtasks with estimates, show total in the Subtasks section header:

```
SUBTASKS · ~2 hours total
```

#### 2.5.4 No aggregation in Inbox or other unfiltered views

Don't aggregate in views that span the entire database (Inbox, all projects, etc.). The number would be meaningless.

---

### 2.6 Defer date strictness verification

Wave 3a defined `defer_date` but the filtering may be loose. Verify and tighten:

**Strict semantics:**
- A task with `defer_date > now()` does NOT appear in:
  - Today perspective
  - Forecast (the day grid; appears only on its defer date or due date)
  - Project active list (greyed out / hidden by toggle)
  - Available task counts
- A task with `defer_date > now()` DOES appear in:
  - Search results
  - Project view if user toggles "Show deferred"
  - Trash (if deleted)
  - Flagged perspective IF the task is flagged (flag overrides defer)

The override-by-flag rule is intentional: if you flag a deferred task, you're saying "I want to see this regardless of defer schedule."

#### 2.6.1 Verification steps

Audit existing query logic:
1. Today query: `WHERE (due_date <= today OR flagged = true) AND (defer_date IS NULL OR defer_date <= now()) AND completed_at IS NULL`
2. Project active query: similar; deferred tasks hidden by default
3. Flagged query: `WHERE flagged = true AND completed_at IS NULL` — no defer_date filter (flag overrides)

If any query is missing the defer_date check, fix it.

#### 2.6.2 UI affordance for deferred tasks

In project view, add a header affordance: "Show deferred (3)" — click to show currently-deferred tasks in the project, dimmed.

---

### 2.7 Forecast lookback (Wave 3b enhancement)

Wave 3b's Forecast shows the next 7 (or 14) days. Add ability to scroll back through past dates.

#### 2.7.1 Behavior

The Forecast component supports a `start_date` query parameter. Default = today. User can:
- Click "← Previous week" button → start_date moves back 7 days
- Click "Next week →" → start_date moves forward 7 days
- "Today" button → resets to today

When viewing past dates, the timeline shows what was actually due/scheduled on those dates (including completed tasks, with strikethrough). Useful for review: "what did I get done last week?"

#### 2.7.2 Display differences for past dates

- Completed tasks shown with strikethrough
- Calendar events shown as they occurred
- Drag-to-reschedule is DISABLED for past dates (you can't reschedule history)
- Day load indicators show actual load (what was on the schedule, not "estimated")

#### 2.7.3 Performance

Past Forecast queries can be cached more aggressively (the past doesn't change). Use TanStack Query with longer staleTime for historical queries.

---

## 3. File structure additions

```
/atlas
  /components
    /tasks
      activity-feed.tsx          (replaces raw JSON Activity tab)
      worklog-entry.tsx
      worklog-create-form.tsx
      checklist-section.tsx
      subtask-section.tsx
      subtask-row.tsx            (specific to inspector display)
      recurrence-form.tsx
      recurrence-quick-popover.tsx
      task-row-quick-actions.tsx (hover affordances)
      project-header-stats.tsx
      forecast-navigation.tsx    (prev/next/today buttons)
  /core
    /audit
      render.ts                  (audit entry → readable sentence)
    /recurrence
      rrule-helpers.ts           (compute next occurrence from rule + anchor)
      preset-rules.ts            (Daily, Weekly, etc. → RRULE strings)
    /aggregation
      project-stats.ts
      day-stats.ts
  /server
    /routers
      worklogs.ts
      activity.ts                (combined feed: audit + worklog)
      checklist.ts
      recurrence.ts              (additions to tasks router)
```

---

## 4. Verification (Definition of Done)

### Activity tab fix
1. Open any task → Activity tab → entries shown as sentences, not JSON
2. Each system entry has correct rendering ("Set due date to May 3", not raw JSON)
3. Add an update via "+ Add update" button → appears in feed immediately
4. Edit an update → changes persist
5. Delete an update → soft-deleted, removed from feed
6. Audit entries don't have edit/delete (immutable)
7. Feed sorted chronologically descending
8. Time formatting reads naturally ("Today 2:30 PM", "Yesterday 4:15 PM", "Apr 25 11:30 AM")
9. Long work log entry (>150 chars) truncates with "Show more" affordance
10. Click "Show more" → expands inline to full content
11. Click "Show less" → collapses back to truncated view
12. Multiple long entries can be expanded simultaneously without breaking layout
13. Very long entry (>800 chars) when expanded is height-constrained with internal scroll
14. Hover over work log entry → edit and delete icons appear on right
15. Audit entries don't show edit/delete affordances on hover

### Checklist
16. Create a new task, add 3 checklist items via inspector
17. Click an item title → inline edit, type, Enter saves
18. Click checkbox → toggles completion
19. Drag to reorder → order persists
20. Hover item → delete affordance appears
21. Delete item → removed from list
22. Task list row shows "X/Y" progress for tasks with checklist
23. Checklist items don't appear as standalone tasks anywhere

### Subtasks
24. Create a task, add a subtask → subtask is full Task with all properties
25. Open subtask → inspector shows all task fields (dates, tags, contexts, etc.)
26. Set subtask due date → appears in Today if due today
27. Try to create a sub-subtask → blocked with error message
28. Project view: parent has chevron, expand shows subtasks indented
29. Today view: subtasks appear standalone with "↳ from [parent]" reference
30. Delete parent → subtasks soft-deleted (cascade)
31. Restore parent → subtasks restored
32. Move parent between projects → subtasks move with it

### Recurring tasks
33. Set a task to "Weekly on Mondays" → recurrence saved
34. Complete the task → next occurrence created for next Monday
35. Set a task to "Repeat from completion every 7 days" → completing on Tuesday creates next for next Tuesday
36. Set a task to "Repeat from due date every 7 days" → completing late doesn't shift schedule
37. Custom recurrence form works (every N days/weeks/months, by day of week, end conditions)
38. Recurring task shows ↻ icon in row
39. Quick action ↻ on row works (preset options)
40. Recurring task with checklist items: completing creates new occurrence with fresh (incomplete) checklist
41. Recurring task with subtasks: warning shown ("Subtasks don't yet repeat")
42. Delete a recurring instance → just that instance removed; chain continues
43. Delete anchor task → chain breaks; existing instances stay

### Quick actions on rows
44. Hover task row → affordances appear on right
45. Click 📅 → date picker popover opens
46. Select "Tomorrow" → due date updates immediately
47. Same flow works for defer (⏰), project (📁), recurrence (↻)
48. Click ⋯ → more menu with delete, duplicate, etc.
49. Popovers close on click outside or ESC
50. Optimistic UI: changes appear instantly; failures revert with toast

### Estimated time aggregation
51. Project view header shows total estimated time of incomplete tasks
52. Today header shows total estimated time
53. Subtask section header shows aggregate
54. No aggregation shown in views where it doesn't make sense (Inbox)

### Defer date strictness
55. Create a task with defer_date in the future → does not appear in Today
56. Same task with flag → does appear in Flagged (override)
57. Project view: deferred task hidden by default; "Show deferred" toggle reveals them dimmed

### Forecast lookback
58. Open Forecast → click ← to navigate to last week
59. See historical tasks with strikethrough for completed
60. Drag-reschedule disabled for past dates
61. Click "Today" → returns to current week

When all 61 verification steps pass, the polish wave is complete.

---

## 5. Rules of engagement

### 5.1 Don't break Wave 3a

This wave refines existing functionality. All Wave 3a verification steps must still pass after this work. Specifically: the 50-step verification from Wave 3a remains valid. If any of those break, fix before proceeding.

### 5.2 Migration of existing data

If any users (you or family/friends) have created tasks with the old confused subtask system, migration must be safe and deliberate. Don't auto-convert without user awareness. If conversion is needed, surface it clearly: "We've improved how subtasks and checklists work. We found 5 tasks with old-style subtasks. Convert them now? [Review each] [Keep as subtasks] [Convert to checklists]"

### 5.3 Recurrence is genuinely complex; ship the simple cases first

Don't try to implement every edge case. Order:
1. Daily, weekly, monthly preset rules — most common
2. From-completion vs from-due-date anchoring
3. Custom rules via RRULE
4. End conditions (never, after N, on date)
5. Edge cases (Feb 30, DST changes, etc.) — rely on `rrule` library

If a feature would take a week to perfect and only one user in five would use it, defer to Phase 2.

### 5.4 Activity feed is the unified surface

Don't create separate "Activity" and "Work log" tabs. Combine them. The user thinks of "what's been happening with this task" as one concept; the UI should match.

### 5.5 Quick actions are for speed, not completeness

The quick action affordances on rows are for *common* operations. Don't try to pack every possible action into the popovers. The inspector is still where users go for full editing. Quick actions are for the 80% case.

### 5.6 Subtask hierarchy depth limit is enforced server-side

Don't rely on UI to prevent sub-subtasks. The tRPC procedure for task creation must check parent_id's parent and reject if creating a third level. Trust nothing on the client.

---

## 6. Recommended Build Sequence

1. **Schema migrations** — TaskWorkLog, ChecklistItem, recurrence fields on Task
2. **Audit log renderer** — translate AuditLog entries to sentences
3. **TaskWorkLog CRUD** — tRPC procedures for create/edit/delete
4. **Activity feed component** — combines audit + worklog, renders as sentences
5. **Checklist UI** — section in inspector, CRUD operations
6. **Subtasks refactor** — full Task entity behavior, depth limit enforcement
7. **Subtask display in main task list** — chevron, expand/collapse, contextual display
8. **Recurrence schema and rrule integration** — rule storage and computation
9. **Recurrence UI** — preset dropdown, custom form, display
10. **Recurrence completion flow** — creating next occurrence on complete
11. **Quick actions on rows** — hover affordances and popovers
12. **Estimated time aggregation** — project header, Today header, subtask total
13. **Defer date strictness audit** — verify all queries respect defer
14. **Forecast lookback** — backward navigation in Wave 3b's Forecast
15. **Verification** — all 61 steps

---

## 7. What is NOT in this wave

**Wave 3b territory (separate wave):**
- Forecast view (existing; 3b builds it)
- Review mode
- Completed perspective
- Project folders
- Sequential project filtering

**Wave 3c territory (separate wave):**
- Email-to-inbox
- AI capture parsing
- Hybrid local-first parsing

**Wave 4+ territory:**
- Notes module
- Calendar two-way sync
- People module
- Journal module

**Phase 2 candidates:**
- Subtasks for recurring tasks (proper handling, not just "warning shown")
- Custom perspectives
- iOS Shortcuts integration
- Sub-sub-tasks (we explicitly limit to one level)

If you find yourself building any of these, stop.

---

## 8. Final note

This wave isn't about new capabilities — it's about making what exists work the way users expect. Real GTD use surfaces the gaps that pre-launch design can't predict. The fixes here are the result of actual usage friction, not theoretical improvements.

Take it carefully. Each piece is small individually, but they compound into a noticeably more refined Tasks module.

Begin with section 6, step 1.
