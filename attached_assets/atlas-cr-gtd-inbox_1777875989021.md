# Atlas CR — GTD Inbox: Capture-First Model and Processing Mode

## Read this entire CR before taking any action.

---

## 1. Overview

Atlas's current Inbox doesn't reflect GTD's core principle: capture is fast and undefined; processing is deliberate and decision-rich. Today, captures convert to Tasks immediately, which means Inbox shows already-classified Tasks rather than raw stuff awaiting decisions. The "processing" step reduces to "assign a project" — losing the richer GTD decision tree (not actionable / 2-min rule / delegate / defer / multi-step project / single next action).

This CR introduces the Capture-first Inbox model with a focused processing mode. Captures are first-class entities that live in Inbox until processed. Processing converts a Capture into one of: Task, Note, Project (or addition to Project), Someday/Maybe, Waiting For (delegated), 2-minute completion, or trash. Existing Inbox tasks that are essentially unprocessed (title only, no metadata, no user activity) migrate retroactively to Captures so the new model is consistent.

This is a substantial change to how Inbox works. It's the right model for GTD discipline, and the existing Wave 3c capture infrastructure provides most of the foundation — this CR makes Captures the primary Inbox citizen rather than an intermediate step.

**The work:**

1. **Capture-first Inbox model** — Inbox shows Captures, not Tasks; Captures have richer state (raw / proposed / processed)
2. **Migration of existing Inbox tasks** — minimally-classified Inbox tasks become Captures retroactively
3. **Processing mode UI** — focused modal-style processing with keyboard-driven dispositions
4. **Disposition handlers** — Task, Note, Project, Someday/Maybe, Waiting For, 2-minute done, Trash
5. **Someday/Maybe perspective** — saved view for deferred items
6. **Waiting For perspective** — saved view for delegated tasks with follow-up tracking
7. **Bulk operations in regular Inbox view** — secondary affordance for routine batch processing
8. **Audit log continuity** — entity transitions (Task → Capture → New Task) traceable end-to-end

**Pre-requisites:**

- Wave 3c (Capture Intelligence) shipped with parser, AI fallback, hybrid local-first parsing
- Wave 4a Notes shipped (Notes are a destination for the Note disposition)
- Wave 4 Refinement shipped (editor and error handling solid)
- Project Type Rework CR shipped (open-type system used for new-project disposition)
- Audit log infrastructure works

**Estimated scope:** 4-5 weeks of focused work.

**Severity:** Medium-high. This is a foundational discipline shift. Done well, Inbox becomes the trusted entry point GTD intends. Done poorly, the architectural risk creates regressions in capture flow that's currently working.

---

## 2. Architectural foundation

### 2.1 Capture lifecycle

A Capture goes through three states:

**Raw** — just captured, not yet parsed. The user typed something or sent an email; the local-first parser hasn't completed (or returned uncertain).

**Proposed** — parser has run, suggestions are ready. The Capture knows what it might be (Task with date X, Note, etc.). User hasn't confirmed.

**Processed** — user has decided. The Capture has been transformed into another entity (or trashed). It no longer appears in Inbox.

A Capture in Raw or Proposed state lives in Inbox. A Processed Capture is essentially an audit-log record — it links to whatever it became.

### 2.2 Why Captures aren't Tasks

The conceptual integrity matters: a Task represents a defined Next Action. Until the user has decided "yes, this is a task with these properties," it's not a Task — it's stuff. Forcing premature classification means:

- Inbox lies (it shows tasks, but they aren't really tasks yet)
- The 2-minute rule has no clean implementation (you "complete" a task you never really meant to be a task)
- Reference material gets shoehorned into Task or Note even when neither fits cleanly
- Delegation requires changing a task you already created instead of making the disposition decision once

The Capture-first model lets the user defer classification until they're ready to make it deliberately.

### 2.3 The parser still proposes

Wave 3c's hybrid local-first parser remains valuable. When a Capture is created, the parser runs (Tier 1 local rules, escalating to Tier 2 AI for ambiguous cases). It produces a proposal:

```
{
  proposed_disposition: 'task' | 'note' | 'reference' | 'unclear',
  proposed_title: string,
  proposed_body: string | null,
  proposed_attributes: {
    project_id?: string,
    context_id?: string,
    tags?: string[],
    due_date?: Date,
    defer_date?: Date,
    purpose?: string,  // For Note disposition
  },
  confidence: number,  // 0-1
}
```

The proposal pre-fills the processing UI when the user reaches that Capture. They accept, modify, or override. The parser is helpful, not authoritative.

### 2.4 What "processed" means

When the user processes a Capture into a Task:
1. New Task entity is created with the chosen attributes
2. Capture is marked as `processed_at = now()` and `processed_to_type = 'task'`, `processed_to_id = task.id`
3. Capture is removed from Inbox view (filtered by `processed_at IS NULL`)
4. Audit log entry: `capture_processed_to_task` with both IDs

The Capture record is preserved (not deleted) for audit traceability. After 90 days, processed Captures can be hard-deleted by a maintenance job — the resulting Task is the canonical record.

### 2.5 Migration of existing Inbox tasks

Existing Tasks in the Inbox project at migration time fall into three categories:

**Category A — Capture-equivalent:**
- No project assigned (or Inbox project as default)
- No context, tags, due date, defer date, estimated time
- No checklist items, no subtasks
- No description/body content
- No audit log entries beyond `task_created` (and possibly `capture_parsed`)

These get migrated. Process per task:
1. Create a new Capture with the Task's title as raw content
2. Capture's `created_at` matches Task's original `created_at` (preserves chronological position)
3. Capture's parser proposal pre-filled with Task's existing attributes (probably none)
4. Original Task is soft-deleted with `deleted_at = now()` and `migration_note = 'migrated_to_capture:{capture_id}'`
5. Audit log entry on both: `task_migrated_to_capture` and `capture_created_from_migration`

**Category B — Partially processed:**
Has at least one of: description/body, due date, defer date, tags, context, estimated time, checklist items, subtasks. These represent user investment; don't undo it.

Migration: **leave alone**. They stay as Tasks in Inbox. The new Inbox view shows them alongside new Captures. Over time, user manually moves them out of Inbox.

**Category C — Fully processed but in Inbox:**
Has substantial metadata but project is still Inbox. Rare but possible. Same handling as Category B — leave alone.

**Categorization audit:**
For each Task in Inbox, run categorization at migration:

```typescript
async function categorizeInboxTask(task: Task): Promise<'A' | 'B' | 'C'> {
  // Check metadata
  if (task.description || task.body) return 'B'
  if (task.due_date || task.defer_date) return 'B'
  if (task.estimated_minutes) return 'B'
  if (task.context_id) return 'B'
  if (task.tags?.length > 0) return 'B'
  
  // Check related entities
  const checklistCount = await prisma.checklistItem.count({ where: { task_id: task.id } })
  if (checklistCount > 0) return 'B'
  
  const subtaskCount = await prisma.task.count({ where: { parent_task_id: task.id, deleted_at: null } })
  if (subtaskCount > 0) return 'B'
  
  // Check audit log for user activity
  const userActivityCount = await prisma.auditLog.count({
    where: {
      target_id: task.id,
      target_type: 'task',
      action: { notIn: ['task_created', 'capture_parsed'] }
    }
  })
  if (userActivityCount > 0) return 'B'
  
  return 'A'
}
```

Category A tasks migrate to Captures. Categories B and C stay as Tasks in Inbox.

Post-migration summary surfaces to the user:

```
Inbox migration complete

  • 47 unprocessed items converted to captures (now in Inbox processing queue)
  • 12 items kept as tasks (had dates, descriptions, or other details set)
  
  [Review captures] [View tasks in Inbox]
```

### 2.6 Audit log continuity across entity transitions

When entity types change (Task → Capture → new Task), audit log references would normally break. Handle this by:

- Migration: original Task soft-deleted with `migration_note` field; Capture audit log references original task_id
- Processing: new Task created from Capture; audit log references Capture ID, which transitively references the original Task ID via Capture's migration_note
- Forensic queries: "show me history of this task" can follow the chain backward through Capture and original Task

This is mostly an audit-log hygiene concern. User-facing UX doesn't expose these transitions; it just shows the current entity.

---

## 3. Detailed deliverables

### 3.1 Capture entity updates

#### 3.1.1 Schema changes

```prisma
model Capture {
  // existing fields from Wave 3c
  
  // NEW or updated fields:
  raw_content           String    // The original captured text
  parser_proposal       Json?     // Parser's structured proposal (see 2.3)
  
  state                 String    // 'raw' | 'proposed' | 'processed'
  
  processed_at          DateTime? @db.Timestamptz
  processed_to_type     String?   // 'task' | 'note' | 'project' | 'someday' | 'waiting_for' | 'two_minute_done' | 'trashed'
  processed_to_id       String?   @db.Uuid  // ID of resulting entity (null for trashed)
  
  migration_source      String?   // 'task:{original_task_id}' if migrated from existing task
  
  // existing fields continued
  
  @@index([user_id, state, created_at])
  @@index([user_id, processed_at])
}
```

#### 3.1.2 New Captures use the new flow

When a user captures something (typing, email, etc.):

1. Capture created with `state = 'raw'`
2. Parser runs asynchronously (existing Wave 3c logic)
3. Parser sets `state = 'proposed'` with `parser_proposal` populated
4. Capture appears in Inbox

Capture creation no longer auto-creates a Task. The Task is only created when the user processes the Capture and chooses the Task disposition.

#### 3.1.3 Backward compatibility

The capture API (`captures.create`) remains the same shape externally. Internally, the flow changes (no longer creates Task automatically). External callers (email-to-inbox, browser extension if any) don't need to change.

### 3.2 Inbox view changes

#### 3.2.1 What Inbox shows

After this CR, Inbox shows:

- **Captures** with `state IN ('raw', 'proposed')` and `processed_at IS NULL` (the new primary content)
- **Tasks** that are still Category B or C from migration (legacy items the user hasn't moved out yet)

Visually distinguish them:
- Captures show a small "unprocessed" indicator
- Tasks show normal task chrome

This mixed state is temporary and intentional. As user processes both, Inbox drains to all-Captures (eventually).

#### 3.2.2 Sort order

Sort by `created_at` descending (newest first). Captures and Tasks intermixed by date. This matches the GTD principle: the Inbox is a chronological dump, not a categorized list.

#### 3.2.3 Inbox count badge

The Inbox count in the sidebar shows the total of unprocessed items (Captures + Inbox-bound Tasks). Don't separately show capture vs. task counts in the badge — that detail lives inside the view.

### 3.3 Processing mode UI

#### 3.3.1 Entry point

Inbox view has a prominent "Process Inbox" button at the top. Click → enter processing mode (modal overlay).

Keyboard shortcut: `Cmd+Shift+P` from anywhere in the app starts processing mode.

#### 3.3.2 Layout

```
+------------------------------------------------------------+
|                                              23 of 47 [×]  |
|                                                            |
|                                                            |
|  Call dentist tomorrow about appointment                   |
|                                                            |
|  Captured 2 hours ago · via quick capture                 |
|                                                            |
|  ─────                                                     |
|                                                            |
|  Parser suggests: Task                                     |
|  • Due: tomorrow                                           |
|  • Detected: phone-call context                            |
|                                                            |
|  ─────                                                     |
|                                                            |
|  [T] Task    [N] Note    [P] Project    [D] Someday        |
|  [W] Waiting [1] Did it (2 min)    [X] Trash               |
|                                                            |
|  [←] Previous    [→] Skip    [Esc] Exit                    |
|                                                            |
|                                                            |
+------------------------------------------------------------+
```

Single Capture displayed at a time. Full focus on this one item. Progress indicator (`23 of 47`) shows position in queue.

The parser's proposal is shown as a hint — "here's what I think this is." User can accept the proposal by pressing `T` (with parser's pre-filled attributes), or override by pressing a different disposition.

#### 3.3.3 Keyboard shortcuts

Primary dispositions:
- `T` — Make it a Task
- `N` — Make it a Note
- `P` — Make it part of a Project (existing or new)
- `D` — Defer to Someday/Maybe
- `W` — Delegate to Waiting For (someone)
- `1` — Did it (2-minute rule completion)
- `X` — Trash

Navigation:
- `→` or `J` — Next (skip without deciding)
- `←` or `K` — Previous
- `Esc` — Exit processing mode (return to Inbox view)

Confirmation:
- After pressing a disposition, an inline form may appear (e.g., for Task disposition, show pre-filled task form)
- `Enter` — Confirm with current values; advance to next Capture
- `Cmd+Enter` — Confirm with parser defaults (skip the form)
- `Esc` — Cancel the disposition (back to choosing)

#### 3.3.4 Disposition flows

**T — Make it a Task:**

```
+------------------------------------------------------------+
|  Make it a task                                            |
+------------------------------------------------------------+
|                                                            |
|  Title: [Call dentist about appointment______________]     |
|                                                            |
|  Project: [Inbox ▼]            Context: [Phone ▼]         |
|                                                            |
|  Due: [tomorrow ▼]             Defer: [— None — ▼]        |
|                                                            |
|  Tags: [+ Add tag]                                         |
|                                                            |
|  Estimated time: [— ▼]         Flagged: [☐]               |
|                                                            |
|       [Cancel]   [Confirm and next]   (Cmd+Enter for defaults) |
+------------------------------------------------------------+
```

Form pre-filled with parser proposals. User adjusts as needed. Confirm creates Task and advances to next Capture.

**N — Make it a Note:**

```
+------------------------------------------------------------+
|  Make it a note                                            |
+------------------------------------------------------------+
|                                                            |
|  Title: [Call dentist about appointment______________]     |
|                                                            |
|  Purpose: [Note ▼]                                         |
|                                                            |
|  Folder: [— None — ▼]          Project: [— None — ▼]      |
|                                                            |
|  The capture text becomes the note body. Edit later if    |
|  needed.                                                   |
|                                                            |
|       [Cancel]   [Confirm and next]                        |
+------------------------------------------------------------+
```

Note created with capture's text as body. User can choose Purpose (Meeting Note / Project Brief / Reading Note / Note default).

**P — Make it part of a Project:**

```
+------------------------------------------------------------+
|  Add to project                                            |
+------------------------------------------------------------+
|                                                            |
|  ⊙ Add to existing project                                 |
|     [Search projects...]                                   |
|                                                            |
|  ○ Create new project                                      |
|     Name: [_________________________]                      |
|     Type: [Project ▼]  (open-type system)                 |
|                                                            |
|  Convert capture to:                                       |
|  ⊙ Task in this project                                    |
|  ○ Note in this project                                    |
|  ○ Just attach capture text to project as brief           |
|                                                            |
|       [Cancel]   [Confirm and next]                        |
+------------------------------------------------------------+
```

User picks project (or creates new), then chooses how the Capture's content becomes part of the project (as a Task, Note, or attached as project brief).

**D — Defer to Someday/Maybe:**

```
+------------------------------------------------------------+
|  Defer to Someday/Maybe                                    |
+------------------------------------------------------------+
|                                                            |
|  Title: [Call dentist about appointment______________]     |
|                                                            |
|  Tags: [+ Add tag]                                         |
|                                                            |
|  Review date (when to revisit):                            |
|  ⊙ Next review cycle (weekly)                              |
|  ○ In a month                                               |
|  ○ In three months                                          |
|  ○ Specific date: [______]                                 |
|  ○ No review date (leave indefinitely)                     |
|                                                            |
|       [Cancel]   [Confirm and next]                        |
+------------------------------------------------------------+
```

Creates a Task with `is_someday = true` and optional `someday_review_date`. Doesn't appear in regular task perspectives; appears in Someday/Maybe perspective.

**W — Delegate to Waiting For:**

```
+------------------------------------------------------------+
|  Delegate (Waiting For)                                    |
+------------------------------------------------------------+
|                                                            |
|  Title: [Call dentist about appointment______________]     |
|                                                            |
|  Waiting for: [Person picker, or type name__________]      |
|                                                            |
|  Follow up by: [In a week ▼]                               |
|                                                            |
|  Notes: [_________________________________]                |
|                                                            |
|       [Cancel]   [Confirm and next]                        |
+------------------------------------------------------------+
```

Creates a Task with `delegated_to` set (person name or People entity reference) and `follow_up_date`. Appears in Waiting For perspective.

The People module isn't shipped yet (Wave 6), so for now `delegated_to` accepts a free-text string. When Wave 6 ships, this field will be upgraded to optionally reference a Person entity.

**1 — Did it (2-minute rule):**

```
+------------------------------------------------------------+
|  Did it ✓                                                  |
+------------------------------------------------------------+
|                                                            |
|  Marking complete: "Call dentist about appointment"       |
|                                                            |
|  This counts toward your completed tasks today.            |
|                                                            |
|              [Cancel]      [Confirm and next]              |
+------------------------------------------------------------+
```

Creates a Task and immediately marks it complete. Audit log notes "completed via 2-minute rule." The task appears in Completed perspective and contributes to "things done today" counts.

The confirmation step is brief because the action is satisfying — user did something, now they're recording it. Don't add friction.

**X — Trash:**

```
+------------------------------------------------------------+
|  Move to trash                                             |
+------------------------------------------------------------+
|                                                            |
|  This capture will be discarded:                           |
|  "Call dentist about appointment"                          |
|                                                            |
|              [Cancel]      [Confirm and next]              |
+------------------------------------------------------------+
```

Capture marked as `processed_to_type = 'trashed'`. No new entity created. Restored from trash within retention period if needed.

#### 3.3.5 Skip and navigation

`→` skips without deciding. The Capture stays in Inbox; the user advances to the next one. Useful when you can't decide right now and want to come back.

`←` returns to the previous Capture. If you decided wrong, you can undo by pressing `Cmd+Z` (undoes the last disposition; see 3.3.6).

`Esc` exits processing mode. Returns to Inbox view. Captures the user already processed remain processed; the queue resumes from current position next time.

#### 3.3.6 Undo

`Cmd+Z` during processing mode undoes the last disposition:

- Reverts the Capture's state from `processed` back to `proposed`
- Soft-deletes the entity that was created (Task, Note, etc.) — moves to trash
- Audit log records the undo
- User is returned to the Capture they just processed

Only the most recent disposition can be undone. After moving to the next item, undo no longer available for that one.

Multi-level undo would be nice but adds complexity. Single-level is enough for the "oops, didn't mean that" case.

### 3.4 Bulk operations in regular Inbox view

In the regular Inbox view (not processing mode), user can select multiple Captures via checkbox or shift-click and apply a single disposition.

#### 3.4.1 Selection UI

```
+------------------------------------------------------------+
|  Inbox                                                     |
+------------------------------------------------------------+
|                                                            |
|  [3 selected]  [Process selected ▼]  [Clear selection]    |
|                                                            |
|  ☑ Call dentist tomorrow                                  |
|  ☑ Review Q2 proposal                                     |
|  ☐ Buy groceries                                           |
|  ☑ Schedule annual checkup                                |
|  ☐ Plan birthday party                                    |
|                                                            |
+------------------------------------------------------------+
```

#### 3.4.2 Bulk disposition

"Process selected ▼" opens a dropdown:

```
+--------------------------------+
|  Make all tasks                |
|  Make all notes                |
|  ─────                         |
|  Defer all to Someday          |
|  Trash all                     |
+--------------------------------+
```

Selected disposition applies to all selected Captures with default attributes (no inline form per Capture; just bulk apply). For Task: project = Inbox, no date, no context. User can adjust afterward.

Bulk disposition has a confirmation:

```
Convert 3 captures to tasks?

These will be created with default settings (no project, no date).
You can edit each task afterward.

[Cancel]    [Convert]
```

This intentionally gates bulk operations behind a confirmation — bulk processing is for "these are routine; I don't need to think about each."

#### 3.4.3 What's NOT in bulk

Bulk operations don't support:
- Project disposition (each capture might need a different project)
- Waiting For (each delegation needs a person)
- 2-minute Did it (you didn't actually do 3 things in 6 minutes)

These dispositions remain individual via processing mode.

### 3.5 Someday/Maybe perspective

#### 3.5.1 Schema addition

```prisma
model Task {
  // existing fields
  
  is_someday              Boolean   @default(false)
  someday_review_date     DateTime? @db.Timestamptz
  
  // existing fields continued
  
  @@index([user_id, is_someday, someday_review_date])
}
```

#### 3.5.2 Perspective view

New left-sidebar entry under Tasks:

```
TASKS
  📥 Inbox
  ⭐ Today
  📅 Tomorrow
  🔮 Forecast
  🚩 Flagged
  📋 Review
  ─────
  💭 Someday/Maybe        ← NEW
  ⏳ Waiting For           ← NEW
  ─────
  ✓ Completed
```

Click Someday/Maybe → shows tasks with `is_someday = true`, sorted by review date (those with review dates closest to now first), then by created date.

#### 3.5.3 Filtering and grouping

Same filter pills as other task views (Tag, Context, Project). Group by review date suggested:
- Due for review (review_date <= today)
- This month
- Within three months
- Indefinite (no review date)

#### 3.5.4 Promote action

Each Someday task has a "Promote to active" action. Sets `is_someday = false`, clears `someday_review_date`. Task moves to regular task lists, retains other attributes.

### 3.6 Waiting For perspective

#### 3.6.1 Schema addition

```prisma
model Task {
  // existing fields
  
  delegated_to_text       String?   @db.VarChar(200)  // Free text for now
  delegated_to_person_id  String?   @db.Uuid          // For when People module ships
  follow_up_date          DateTime? @db.Timestamptz
  
  // existing fields continued
  
  @@index([user_id, delegated_to_text, follow_up_date])
}
```

#### 3.6.2 Perspective view

Click Waiting For → shows tasks with `delegated_to_text IS NOT NULL OR delegated_to_person_id IS NOT NULL`.

```
+------------------------------------------------------------+
|  Waiting For                                               |
+------------------------------------------------------------+
|                                                            |
|  Group by: [Person ▼]   Sort: [Follow-up date ▼]          |
|                                                            |
|  ── Sarah (Designer) ──                                    |
|                                                            |
|  ⏳ Logo concepts for Q2 launch                            |
|     Delegated 5 days ago · Follow up by tomorrow ⚠         |
|                                                            |
|  ⏳ Updated brand guidelines                               |
|     Delegated 2 weeks ago · Follow up by next Monday      |
|                                                            |
|  ── Ahmed (Developer) ──                                   |
|                                                            |
|  ⏳ Auth bug fix for Atlas                                 |
|     Delegated yesterday · Follow up in 3 days             |
|                                                            |
+------------------------------------------------------------+
```

#### 3.6.3 Follow-up indicators

Tasks with `follow_up_date` past or close to current date get visual emphasis:
- Past follow-up: red indicator with warning icon
- Within 24 hours: amber indicator
- Future: neutral

#### 3.6.4 Actions per task

Each Waiting For task has actions:
- "Mark received" → un-delegates (clears delegated_to and follow_up_date), task becomes a regular completed task
- "Follow up" → records a follow-up event in audit log; updates follow_up_date based on user choice
- "Convert to active task" → un-delegates without marking complete; task returns to active perspectives

### 3.7 New tRPC procedures

```typescript
// Capture lifecycle
captures.list({ state? }) → Capture[]  // For Inbox view
captures.processToTask({ capture_id, attributes }) → { capture, task }
captures.processToNote({ capture_id, attributes }) → { capture, note }
captures.processToProject({ capture_id, project_id?, new_project?, target_type }) → { capture, ... }
captures.processToSomeday({ capture_id, attributes, review_date? }) → { capture, task }
captures.processToWaitingFor({ capture_id, delegated_to, follow_up_date, notes? }) → { capture, task }
captures.processToTwoMinuteDone({ capture_id, attributes }) → { capture, task }
captures.processToTrash({ capture_id }) → { capture }
captures.bulkProcess({ capture_ids, disposition, defaults }) → { count, results }
captures.undoLastProcessing({ capture_id }) → { capture, reverted_entity_ids }

// Migration (run once via admin or migration script)
captures.runInboxMigration() → MigrationReport

// Perspectives
tasks.someday({ filters? }) → Task[]
tasks.waitingFor({ filters? }) → Task[]

// Waiting For actions
tasks.markReceived({ task_id }) → Task
tasks.recordFollowUp({ task_id, new_follow_up_date }) → Task
tasks.convertToActive({ task_id }) → Task

// Someday actions
tasks.promoteFromSomeday({ task_id }) → Task
```

### 3.8 Audit log additions

New audit actions:

- `capture_state_changed` — state transitioned (raw → proposed → processed)
- `capture_processed_to_task` (already exists conceptually; formalize)
- `capture_processed_to_note`
- `capture_processed_to_project`
- `capture_processed_to_someday`
- `capture_processed_to_waiting_for`
- `capture_processed_to_two_minute_done`
- `capture_processed_to_trash`
- `capture_processing_undone`
- `capture_bulk_processed`
- `task_migrated_to_capture` (one-time migration)
- `capture_created_from_migration` (one-time migration)
- `task_marked_someday`
- `task_promoted_from_someday`
- `task_delegated`
- `task_follow_up_recorded`
- `task_received` (delegation completed)

### 3.9 Settings additions

Add to Settings → System a "GTD" section:

```
GTD Configuration

  Default review cadence for Someday/Maybe items:
  [Weekly ▼]   ← affects "Next review cycle" choice in defer dialog

  Default follow-up window for Waiting For:
  [One week ▼]   ← affects default value in delegate dialog

  Show 2-minute rule reminder during processing:
  [☑ Enabled]
  
  When enabled, processing mode shows a small reminder
  for items that look like they could be done in 2 minutes.
```

These settings are personal preferences with sensible defaults. Don't require configuration for the system to work.

---

## 4. Migration runbook

### 4.1 Pre-migration check

Before running migration, generate a report of what will happen:

```sql
-- Count of tasks in Inbox by category
SELECT 
  CASE 
    WHEN /* Category A criteria */ THEN 'A_will_migrate'
    ELSE 'B_or_C_keep_as_task'
  END as category,
  COUNT(*) 
FROM tasks 
WHERE 
  project_id = (Inbox project for user)
  AND deleted_at IS NULL
GROUP BY category;
```

User reviews the counts. If looks reasonable (e.g., 47 will migrate, 12 stay), proceed. If unexpected (e.g., 500 expected to migrate, 5 staying), pause and investigate.

### 4.2 Run migration

Migration runs once per user. For your case (single user pre-F&F), this is a one-time operation.

Migration handler:
1. Identify all Inbox tasks meeting Category A criteria
2. For each, create Capture with original Task's title and created_at
3. Pre-fill Capture's parser_proposal with Task's existing attributes (typically empty)
4. Soft-delete original Task with migration_note
5. Audit log both events
6. Increment counter

Wrap each task's migration in a transaction. If any fails, roll back that task's migration only — continue with others.

### 4.3 Post-migration

Display the summary modal (section 2.5). User can review captures or remaining tasks.

After this, new captures use the new flow automatically. Migration is one-time.

### 4.4 Rollback path

If the migration causes problems and needs reverting:

- Captures created from migration have `migration_source` set
- Original tasks are soft-deleted with `migration_note` referencing the Capture
- A rollback script can restore the original Tasks (clear deleted_at) and delete the migration Captures

Don't ship rollback in CR (extra complexity). Document the schema fields that enable manual rollback if needed via SQL.

---

## 5. Schema summary

```prisma
model Capture {
  // (additions/changes shown earlier in 3.1.1)
  raw_content           String
  parser_proposal       Json?
  state                 String    @default("raw")
  processed_at          DateTime?
  processed_to_type     String?
  processed_to_id       String?
  migration_source      String?
}

model Task {
  // (additions shown earlier in 3.5.1, 3.6.1)
  is_someday              Boolean   @default(false)
  someday_review_date     DateTime?
  delegated_to_text       String?
  delegated_to_person_id  String?
  follow_up_date          DateTime?
  migration_note          String?  // For migration audit
}
```

---

## 6. File changes

```
/atlas
  /src
    /app
      /(app)
        /tasks
          /someday/page.tsx              (NEW)
          /waiting-for/page.tsx          (NEW)
    /components
      /capture
        capture-list-item.tsx            (NEW: Inbox row)
        processing-mode.tsx              (NEW: modal overlay)
        processing-mode-card.tsx         (NEW: single capture display)
        disposition-task-form.tsx        (NEW)
        disposition-note-form.tsx        (NEW)
        disposition-project-form.tsx     (NEW)
        disposition-someday-form.tsx     (NEW)
        disposition-waiting-for-form.tsx (NEW)
        disposition-two-min-form.tsx     (NEW)
        disposition-trash-form.tsx       (NEW)
        bulk-process-dropdown.tsx        (NEW)
        bulk-process-confirm.tsx         (NEW)
        migration-summary-modal.tsx      (NEW: shown post-migration)
      /tasks
        someday-perspective.tsx          (NEW)
        waiting-for-perspective.tsx      (NEW)
        waiting-for-task-card.tsx        (NEW: with delegation indicators)
        someday-task-card.tsx            (NEW: with review date)
      /inbox
        inbox-view.tsx                   (UPDATED: shows Captures + legacy Tasks)
        inbox-process-button.tsx         (NEW: prominent at top)
    /core
      /captures
        lifecycle.ts                     (NEW: state transitions)
        processing-handlers.ts           (NEW: per-disposition logic)
        migration.ts                     (NEW: Inbox migration script)
        categorization.ts                (NEW: Category A/B/C logic)
        undo.ts                          (NEW: undo last processing)
      /tasks
        someday-service.ts               (NEW)
        waiting-for-service.ts           (NEW)
    /server
      /routers
        captures.ts                      (UPDATED: many new procedures)
        tasks.ts                         (UPDATED: someday, waiting for procedures)
```

---

## 7. Verification

### Migration
1. Pre-migration check produces report of Category A vs. B/C task counts
2. Run migration → Category A tasks become Captures
3. Original Tasks soft-deleted with migration_note
4. Captures created with original task created_at preserved
5. Category B and C tasks remain unchanged in Inbox
6. Post-migration summary displayed with counts
7. Audit log entries on all migrations

### Capture lifecycle
8. New capture created via quick capture → state = 'raw'
9. Parser runs → state transitions to 'proposed' with parser_proposal populated
10. Capture appears in Inbox
11. Capture does NOT auto-create a Task (key behavior change)

### Inbox view
12. Inbox shows Captures (state in raw/proposed) and legacy Tasks
13. Both sorted by created_at descending, intermixed
14. Visual distinction between Captures (unprocessed indicator) and Tasks (normal chrome)
15. Inbox count badge totals both
16. "Process Inbox" button prominent at top

### Processing mode entry
17. Click "Process Inbox" → modal overlay opens
18. Cmd+Shift+P from anywhere → modal opens
19. First Capture displayed; queue counter shows position
20. Modal blocks other interactions (focused processing)

### Task disposition
21. Press T → task form appears with parser pre-fills
22. Edit attributes; press Enter → task created, advances to next Capture
23. Cmd+Enter → task created with parser defaults, advances
24. Created Task appears in regular task perspectives

### Note disposition
25. Press N → note form appears
26. Capture text becomes note body
27. Choose Purpose → note created with that Purpose
28. Created Note appears in Notes module

### Project disposition
29. Press P → project picker
30. Select existing project → choose target_type (task/note/project brief)
31. Confirm → entity created and attached to project
32. New project flow: enter name and type (open-type system) → project created
33. Capture's content becomes Task in new project (default)

### Someday disposition
34. Press D → someday form
35. Choose review date → task created with is_someday = true
36. Task does NOT appear in regular task perspectives
37. Task appears in Someday/Maybe perspective

### Waiting For disposition
38. Press W → waiting for form
39. Enter delegated person (free text for now) and follow-up date
40. Task created with delegated_to_text and follow_up_date
41. Task appears in Waiting For perspective with appropriate indicator

### 2-minute rule disposition
42. Press 1 → 2-min form
43. Confirm → task created and immediately marked complete
44. Task appears in Completed perspective
45. Audit log notes "completed via 2-minute rule"

### Trash disposition
46. Press X → trash confirm
47. Confirm → capture marked processed_to_type = 'trashed', no entity created

### Navigation
48. → advances to next Capture without deciding
49. ← returns to previous Capture
50. Esc exits processing mode; returns to Inbox view
51. Re-entering processing mode resumes from current position

### Undo
52. After disposition, Cmd+Z undoes
53. Capture state reverts from processed to proposed
54. Created entity soft-deleted (moved to trash)
55. User returned to that Capture
56. Audit log records undo
57. Only most recent disposition can be undone

### Bulk operations
58. Inbox view: select multiple Captures via checkbox
59. "Process selected ▼" dropdown shows bulk dispositions
60. Bulk to Task: confirmation, all selected → tasks with default settings
61. Bulk to Note: confirmation, all selected → notes
62. Bulk Defer: confirmation, all selected → someday tasks
63. Bulk Trash: confirmation, all selected → trashed
64. Project, Waiting For, 2-min not available in bulk

### Someday/Maybe perspective
65. Sidebar entry "Someday/Maybe" visible
66. Click → shows is_someday = true tasks
67. Sorted by review date (closest first), then created date
68. Group by review date works (Due for review / This month / etc.)
69. "Promote to active" action returns task to regular perspectives

### Waiting For perspective
70. Sidebar entry "Waiting For" visible
71. Click → shows tasks with delegated_to set
72. Group by Person works
73. Follow-up indicators: red for past, amber for within 24h, neutral otherwise
74. "Mark received" un-delegates and completes
75. "Follow up" records event, updates follow_up_date
76. "Convert to active" un-delegates without completing

### Settings
77. GTD section in Settings → System
78. Default review cadence dropdown works
79. Default follow-up window dropdown works
80. 2-minute rule reminder toggle works

### Cross-cutting
81. Audit log entries for all dispositions
82. Audit log chain traceable: original task → migration capture → new entity
83. Search finds Captures by content
84. Existing Wave 3c capture parsing still works (parser proposal populated)
85. Email-to-inbox creates Captures (not auto-Tasks)

### No regressions
86. All Wave 3a, 3b, 3c, 4a, 4b, 4 Refinement functionality unchanged
87. Existing tasks (not in Inbox) unaffected by migration
88. Tasks in Forecast, Today, Project views render correctly
89. Drive sync continues to work for Notes
90. Tags, Contexts, Projects all work as before

When all 90 verification steps pass, this CR is complete.

---

## 8. Rules of engagement

### 8.1 Captures are NOT Tasks

The conceptual integrity matters more than seeming convenience. Don't shortcut by treating Captures as "tasks with extra state." They're a distinct entity with their own lifecycle. Code paths that handle Captures should be separate from Task code paths.

If you find yourself reusing Task code for Captures, that's a sign you're collapsing the distinction. Don't.

### 8.2 Migration is one-shot, careful

The migration runs once per user. It moves real data. Verify the categorization logic carefully:

- Category A (will migrate) MUST be conservative — only items that truly look unprocessed
- When in doubt about a task, treat as Category B (don't migrate)
- The audit log check (no user activity beyond creation) is a key safeguard

If migration mis-categorizes (e.g., turns a Task with subtle metadata into a Capture, losing data), the user is unhappy. The schema retains rollback capability via migration_note, but rollback is manual SQL — better to not need it.

### 8.3 Parser proposal is a hint, not authority

When processing a Capture, the parser's proposed disposition is shown as a hint. Don't auto-select it; user always chooses explicitly. The parser is helpful (pre-filling forms) but not deciding.

### 8.4 Processing mode is focused, not a list

The processing UI shows ONE Capture at a time, full focus. Don't show a list with inline actions — that defeats the purpose of focused processing. Bulk operations exist in the regular Inbox view for batch work; processing mode is for deliberate per-item decisions.

### 8.5 The 2-minute rule completion is real

When user presses 1 (Did it), the resulting Task is genuinely created and genuinely completed. It contributes to completion stats, appears in Completed perspective, has full audit trail. Don't take a shortcut where it just deletes the Capture — that loses the satisfaction and tracking.

### 8.6 Someday and Waiting For are perspectives, not modules

These are saved views over the existing Task entity. They share the Task code path. Don't introduce parallel "Someday Task" or "Waiting For Task" entities — that fragments the model.

The Task entity has flags (`is_someday`, `delegated_to_*`) that perspectives filter on. Same Task can be promoted from Someday to active without a data migration.

### 8.7 Don't ship without migration verification

Before this CR ships to F&F users (or even your own usage), run the migration on your real data and verify the result. Some Inbox tasks may have history you didn't realize:

- Tasks created during testing of Wave 3c
- Tasks from email-to-inbox you never processed
- Tasks with audit log activity from accidental clicks

The categorization should err toward keeping items as Tasks (Category B). After migration, review the resulting Inbox to confirm nothing was lost.

### 8.8 The People module integration is forward-looking

Waiting For uses `delegated_to_text` (free text) for now. When Wave 6 (People) ships, the People entity will be linkable via `delegated_to_person_id`. Don't try to build People integration in this CR — just leave the field for future use.

---

## 9. Recommended Build Sequence

**Phase 1: Schema and migration (3-4 days)**

1. Add Capture state field, processed_to fields, migration_source
2. Add Task is_someday, someday_review_date, delegated_to fields, follow_up_date, migration_note
3. Build categorization logic with audit log check
4. Build migration script with transactional per-task handling
5. Generate pre-migration report tooling
6. Run migration on test data; verify output

**Phase 2: Capture lifecycle changes (3-4 days)**

7. Update capture creation: state = 'raw', parser updates to 'proposed', no auto-Task
8. Update Wave 3c parser integration to populate parser_proposal
9. Update Inbox query to show Captures + legacy Tasks
10. Visual distinction in Inbox list

**Phase 3: Processing mode core (5-7 days)**

11. Modal overlay component
12. Single Capture display with parser proposal hint
13. Keyboard shortcut handling (T/N/P/D/W/1/X/arrows/Esc)
14. Disposition handlers (start with Task, expand to others)
15. Per-disposition forms (pre-filled from parser)
16. Confirmation flow (Enter / Cmd+Enter)
17. Navigation (next/previous/skip)

**Phase 4: All disposition handlers (4-5 days)**

18. Task disposition complete with full form
19. Note disposition with Purpose selection
20. Project disposition (existing or new, with target_type choice)
21. Someday disposition with review date
22. Waiting For disposition with delegated_to and follow_up_date
23. 2-minute completion (creates and completes Task)
24. Trash disposition

**Phase 5: Undo (1-2 days)**

25. Undo last disposition (Cmd+Z)
26. Restore Capture state
27. Soft-delete created entity
28. Audit log undo

**Phase 6: Someday/Maybe perspective (2-3 days)**

29. Perspective view component
30. Filtering and grouping
31. Promote to active action
32. Sidebar entry

**Phase 7: Waiting For perspective (2-3 days)**

33. Perspective view component
34. Group by person
35. Follow-up indicators (red/amber/neutral)
36. Mark received, follow up, convert to active actions
37. Sidebar entry

**Phase 8: Bulk operations in regular Inbox (2 days)**

38. Selection UI in Inbox list
39. Bulk process dropdown
40. Bulk handlers for Task, Note, Someday, Trash
41. Confirmation flow

**Phase 9: Settings and polish (1-2 days)**

42. GTD section in Settings → System
43. Default review cadence and follow-up window
44. 2-minute rule reminder toggle

**Phase 10: Verification (2-3 days)**

45. All 90 verification steps
46. Run migration on real data
47. Review post-migration state carefully
48. Use processing mode for real Inbox items end-to-end

---

## 10. What is NOT in this CR

**Future Wave 6 (People) integration:**
- Linking delegated_to_person_id to actual Person entities
- Reminder notifications for delegated tasks
- Person-specific Waiting For dashboards

**Phase 2 territory:**
- Multi-level undo (only single-level for now)
- Undo across processing sessions (only within current session)
- Custom dispositions (only the 7 standard ones)
- Saved processing presets (e.g., "make all email captures into Notes")
- Smart batching ("you have 5 phone-related captures; process them together")
- Email forward processing as automatic disposition (still creates a regular Capture)
- Voice memo capture with auto-transcription
- Image capture with OCR

**Permanently excluded:**
- Auto-processing without user decision (defeats GTD discipline)
- "Snooze" disposition (Someday/Maybe with review date covers this)
- "Maybe later" disposition (use Defer with no review date)

If you find yourself building any of these, stop.

---

## 11. Final note

This is the CR that makes Atlas's Inbox actually work like GTD intends. The capture flow already feels good — text dumps fast, parser is helpful, items appear immediately. What's been missing is the deliberate processing step where decisions get made.

Processing mode delivers that. Each Capture gets the user's full attention briefly; the disposition is chosen explicitly; the Capture transforms into the right entity (or trash). The discipline of doing this regularly — daily, weekly, whenever Inbox builds up — is the GTD habit that produces the "mind like water" feeling.

The migration handles the awkward reality that Atlas already has Inbox tasks from the previous model. Conservative categorization keeps user investment intact (Category B/C) while bringing forward truly unprocessed items into the new flow (Category A).

Someday/Maybe and Waiting For perspectives close the loop — without destinations for "defer" and "delegate" dispositions, those decisions had nowhere to land. Now they do.

This CR is bigger than usual but the architectural shift is genuinely worth it. After this ships, Inbox stops feeling like "a list of poorly-defined tasks" and starts feeling like the trusted dump zone GTD relies on.

Begin with section 9, Phase 1.
