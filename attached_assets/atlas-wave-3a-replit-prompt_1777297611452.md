# Replit Agent Prompt — Wave 3a: Tasks Module (Core GTD)

## Read this entire prompt before taking any action. Do not start coding until you have read all sections including the Rules of Engagement.

---

## 1. Wave 3a Overview

Wave 2 (with amendments) built the app shell. Wave 3a builds the **Tasks module — core GTD functionality**.

This is the first real product feature in Atlas. The verification standard is high: when this wave is complete, the user (Umar) should be able to **start using Atlas for daily GTD instead of OmniFocus**. Anything less is incomplete.

**Scope of Wave 3a (specifically the "core GTD" subset):**

- Task and Project entities with full CRUD
- Inbox, Today, Flagged, Projects, Contexts, Tags views
- Capture (real, replacing Wave 2's placeholder)
- Inline editing and inspector panel detail
- Bulk operations
- Context/tag system
- Cross-module reference resolution (`@`, `#`, `[[`)
- Trash for tasks

**Deferred to Wave 3b:** Forecast view, Review mode, Completed view, project folders, sequential project filtering
**Deferred to Wave 3c:** Email-to-inbox, AI capture parsing, full natural language dates beyond basic "today/tomorrow/next week"

These deferrals are intentional. Wave 3a's goal is the daily-driver core; later waves add intelligence and review workflows.

By end of Wave 3a, the user can capture tasks, organize them into projects with contexts and due dates, see Today, process the Inbox into projects, and complete or delete tasks — all with the polish and speed of a real GTD application.

---

## 2. Stack (continuing from Waves 0-2)

No new dependencies expected. Wave 3a uses:

- Existing Stratum components (especially `TaskListItem` if previously built; if not, build it now using existing primitives)
- Wave 2's command and shortcut registries (Tasks plugs into them)
- Existing tRPC, Prisma, soft delete middleware, audit log
- TanStack Query for caching task lists
- Zustand for ephemeral UI state (current selection, expanded projects, etc.)

If a new dependency seems needed, stop and ask before installing.

---

## 3. Wave 3a Deliverables

### 3.1 Database schema

Add the following Prisma entities. All use UUIDv7 keys, soft delete, audit-logged.

```prisma
model Task {
  id                String    @id @default(uuid()) @db.Uuid
  user_id           String    @db.Uuid
  user              User      @relation(fields: [user_id], references: [id])
  
  title             String
  notes             String?   // Markdown supported
  
  project_id        String?   @db.Uuid
  project           Project?  @relation(fields: [project_id], references: [id])
  
  // Hierarchy: tasks can have parent task (subtasks)
  parent_id         String?   @db.Uuid
  parent            Task?     @relation("TaskSubtasks", fields: [parent_id], references: [id])
  subtasks          Task[]    @relation("TaskSubtasks")
  
  // GTD timing
  defer_date        DateTime? @db.Timestamptz
  due_date          DateTime? @db.Timestamptz
  
  // Estimated duration in minutes (for future Calendar time-blocking in Wave 5)
  estimated_minutes Int?
  
  // Status
  flagged           Boolean   @default(false)
  completed_at      DateTime? @db.Timestamptz
  
  // Position within parent (project or parent task) for manual ordering
  position          Decimal   @db.Decimal(20, 10)
  
  // Cross-module references (denormalized for fast queries)
  // The notes field contains the source markdown with @, #, [[ syntax;
  // these arrays mirror parsed references for indexing
  referenced_person_ids   String[]  @db.Uuid
  referenced_tag_ids      String[]  @db.Uuid
  referenced_entity_refs  Json?     // [[entity]] refs as { type, id } pairs
  
  created_at        DateTime  @default(now()) @db.Timestamptz
  updated_at        DateTime  @updatedAt @db.Timestamptz
  deleted_at        DateTime? @db.Timestamptz
  
  // Search
  search_vector     Unsupported("tsvector")?
  
  // Tags (many-to-many)
  tags              TagOnTask[]
  contexts          ContextOnTask[]
  
  @@index([user_id, deleted_at])
  @@index([user_id, project_id, deleted_at])
  @@index([user_id, due_date, deleted_at])
  @@index([user_id, flagged, deleted_at])
}

model Project {
  id                String    @id @default(uuid()) @db.Uuid
  user_id           String    @db.Uuid
  user              User      @relation(fields: [user_id], references: [id])
  
  title             String
  notes             String?
  
  // Status
  status            String    @default("active")  // active | on_hold | completed | dropped
  completed_at      DateTime? @db.Timestamptz
  
  // Sequential vs parallel: in sequential, only the first incomplete task is "available"
  // (Wave 3a: support the field; "available" filtering is Wave 3b)
  is_sequential     Boolean   @default(false)
  
  // Optional folder organization (Wave 3a does not build folders UI; field exists for Wave 3b)
  folder_id         String?   @db.Uuid
  
  // Position for manual sorting
  position          Decimal   @db.Decimal(20, 10)
  
  // Review settings (used in Wave 3b)
  review_interval_days  Int     @default(7)
  last_reviewed_at      DateTime? @db.Timestamptz
  
  // Color for visual identification (12-color calendar palette from Stratum)
  color_token       String?   // e.g., "calendar-1" through "calendar-12"
  
  tasks             Task[]
  
  created_at        DateTime  @default(now()) @db.Timestamptz
  updated_at        DateTime  @updatedAt @db.Timestamptz
  deleted_at        DateTime? @db.Timestamptz
  
  search_vector     Unsupported("tsvector")?
  
  @@index([user_id, status, deleted_at])
}

model Context {
  // GTD contexts: "deep-work", "errands", "@phone", "office", etc.
  // Tasks have N contexts.
  id                String    @id @default(uuid()) @db.Uuid
  user_id           String    @db.Uuid
  user              User      @relation(fields: [user_id], references: [id])
  
  name              String
  // Optional emoji or single character for quick visual ID
  icon              String?
  // Color from the categorical palette
  color_token       String?
  
  // Position for manual ordering in lists
  position          Decimal   @db.Decimal(20, 10)
  
  tasks             ContextOnTask[]
  
  created_at        DateTime  @default(now()) @db.Timestamptz
  updated_at        DateTime  @updatedAt @db.Timestamptz
  deleted_at        DateTime? @db.Timestamptz
  
  @@unique([user_id, name])
  @@index([user_id, deleted_at])
}

model ContextOnTask {
  context_id        String    @db.Uuid
  context           Context   @relation(fields: [context_id], references: [id])
  task_id           String    @db.Uuid
  task              Task      @relation(fields: [task_id], references: [id])
  
  @@id([context_id, task_id])
  @@index([task_id])
}

model Tag {
  // Free-form tags (the # in @ # [[ syntax)
  // Shared namespace across modules: Tasks, Notes (Wave 4), Journals (Wave 7) all use these
  id                String    @id @default(uuid()) @db.Uuid
  user_id           String    @db.Uuid
  user              User      @relation(fields: [user_id], references: [id])
  
  name              String    // Stored without leading #, displayed with #
  color_token       String?
  
  usage_count       Int       @default(0)  // Updated on tag association/dissociation
  
  tasks             TagOnTask[]
  // Future relations (Wave 4+): TagOnNote, TagOnJournalEntry
  
  created_at        DateTime  @default(now()) @db.Timestamptz
  updated_at        DateTime  @updatedAt @db.Timestamptz
  deleted_at        DateTime? @db.Timestamptz
  
  @@unique([user_id, name])
  @@index([user_id, deleted_at])
}

model TagOnTask {
  tag_id            String    @db.Uuid
  tag               Tag       @relation(fields: [tag_id], references: [id])
  task_id           String    @db.Uuid
  task              Task      @relation(fields: [task_id], references: [id])
  
  @@id([tag_id, task_id])
  @@index([task_id])
}
```

**Schema notes:**

- `Task.position` and `Project.position` use `Decimal` for fractional indexing (insert between two items without renumbering everything). Initial positions can be sequential integers; reorders use midpoints.
- `referenced_*` fields on Task are denormalized for query performance (e.g., find all tasks mentioning a person, find all tasks with a given tag without joining). They're maintained by a server-side reference parser whenever notes change.
- `referenced_person_ids` will populate when Wave 6 (People) ships and `@person` autocomplete returns real results. In Wave 3a it stays empty (no people yet).
- Inbox is implicit: tasks where `project_id IS NULL AND deleted_at IS NULL AND completed_at IS NULL` are in the Inbox.
- Tag namespace is shared across modules now (Notes Wave 4, Journals Wave 7) to avoid migration later.

Migrate the schema. Verify migration succeeds.

### 3.2 Reference parser

Build `core/references/parser.ts`:

- Parses task notes (markdown) for `@person`, `#tag`, `[[entity]]` syntax
- Returns `{ personIds: string[], tagNames: string[], entityRefs: { type, id }[] }`
- Auto-creates tags that don't exist yet (with the user's user_id, increments usage_count)
- Resolves person references against the future Person table (Wave 6 will create it; for now returns empty `personIds`, that's correct)
- Resolves entity references against Project, Task tables (Note and Journal entities don't exist yet; autocomplete should still offer to create-as-link with a deferred resolution)
- Updates the Task's denormalized reference fields atomically
- Updates Tag.usage_count on add/remove

Trigger this parser:
- On task create with notes
- On task update if notes changed
- On task delete (decrement tag usage)

The parser is a foundational piece — every module will use it (Notes in Wave 4, Journals in Wave 7). Get it right.

### 3.3 tRPC routers for Tasks

Build `server/routers/tasks.ts`:

**Task procedures:**
- `tasks.list({ filter, sort, limit, cursor })` — paginated list with filters (project_id, context_ids, tag_ids, flagged, completed status, search query)
- `tasks.byId({ id })` — single task with full detail including subtasks, contexts, tags, references
- `tasks.create({ ...fields })` — create new task
- `tasks.update({ id, ...fields })` — partial update
- `tasks.delete({ id })` — soft delete (cascades to subtasks)
- `tasks.restore({ id })` — restore from trash
- `tasks.complete({ id })` — set completed_at = now()
- `tasks.uncomplete({ id })` — clear completed_at
- `tasks.toggleFlag({ id })` — toggle flagged
- `tasks.move({ id, newProjectId, newPosition })` — move task to project at position
- `tasks.bulkComplete({ ids })` — bulk mark complete
- `tasks.bulkDelete({ ids })` — bulk soft delete
- `tasks.bulkMove({ ids, newProjectId })` — bulk move to project
- `tasks.bulkAddContext({ ids, contextId })` — bulk add context
- `tasks.bulkAddTag({ ids, tagName })` — bulk add tag (creates tag if needed)
- `tasks.subtasks({ parentId })` — list subtasks of a task

**Project procedures:**
- `projects.list({ status, search })` — list projects, optionally filtered
- `projects.byId({ id })` — single project with task counts
- `projects.create({ ...fields })`
- `projects.update({ id, ...fields })`
- `projects.delete({ id })` — soft delete (does NOT delete tasks; they go to Inbox)
- `projects.restore({ id })`
- `projects.complete({ id })` — sets status = completed, completed_at = now()
- `projects.changeStatus({ id, status })`

**Context procedures:**
- `contexts.list()`
- `contexts.create({ name, icon?, color? })`
- `contexts.update({ id, ...fields })`
- `contexts.delete({ id })` — does not delete tasks; just removes the association

**Tag procedures:**
- `tags.list({ search? })`
- `tags.byName({ name })`
- (Tags are mostly auto-managed by the reference parser; explicit CRUD is for renaming/deleting)
- `tags.update({ id, ...fields })`
- `tags.delete({ id })` — confirms with user count of references

**Inbox procedures:**
- `inbox.list({ limit, cursor })` — tasks where project_id IS NULL
- `inbox.count()` — count of inbox items (for sidebar badge)

**Search procedures:**
- `search.tasks({ query })` — full-text search over tasks (uses search_vector)

All procedures are protected (authenticated user only) and scoped to the user's own data. Authorization checks on every call: never return another user's task.

### 3.4 Tasks module shell

The `/tasks` route now becomes the real Tasks module. Layout uses Stratum's `ThreePaneLayout`:

- Pane 1: perspectives sidebar (~240px)
- Pane 2: task list (flex)
- Pane 3: inspector (~360px, collapsible)

All resizable.

### 3.5 Tasks sidebar (perspectives)

Left pane shows perspective navigation:

- **Inbox** (with unread count badge) — tasks not yet assigned to a project
- **Today** — due today + flagged + due in past (overdue)
- **Flagged** — flagged tasks regardless of date
- **Projects** (expandable section)
  - List of active projects
  - Each project shows task count, optional color dot
  - Click project → middle pane shows that project's tasks
  - Right-click → context menu (rename, change status, delete, etc.)
- **Contexts** (expandable section)
  - List of contexts
  - Click context → middle pane shows tasks with that context
- **Tags** (expandable section, alphabetized, top 20 by usage)
  - Click tag → middle pane shows tasks with that tag
  - "Show all tags" link if more than 20
- **Trash** — deleted tasks
- **Completed** — placeholder for now (Wave 3b)
- **Forecast** — placeholder for now (Wave 3b)
- **Review** — placeholder for now (Wave 3b)

Visual treatment:
- Section headers small caps, neutral
- Active perspective uses `surface-selected`
- Counts use Stratum Badge component
- Density tight

The sidebar is its own component; perspectives are extensible (custom perspectives in Phase 2 will add to this list).

### 3.6 Task list (middle pane)

The middle pane shows the task list for the active perspective. Each row uses Stratum's `TaskListItem` component (build it now using existing primitives if not in Wave 0).

**Row contents (left to right):**
- Drag handle (visible on hover)
- Checkbox (click to complete)
- Flag icon button (toggle, dim if not flagged)
- Title (inline-editable on click; Enter saves, Esc cancels)
- Project pill (small, only shown if not in project-specific view)
- Context pills (small, multiple)
- Tag pills (small, multiple, with `#` prefix)
- Due date (right-aligned, color-coded: red overdue, amber today, neutral future)
- Subtask indicator (icon with count if has subtasks; expandable inline)

**Row interactions:**
- Click row (not on a control): selects the task (highlights row)
- Selected row + `⌘I`: opens inspector
- Double-click row: opens inspector
- `Space`: toggles complete on selected
- `Shift+click`: range select
- `⌘+click` (Mac) / `Ctrl+click` (Win): toggle in multi-select
- Right-click: context menu with all actions
- Drag handle: drag to reorder within current view (when sortable by manual position)

**Multi-select bar:**
When 2+ tasks selected, a bar appears at the bottom of the list:
"3 selected | Complete | Delete | Move to... | Add context... | Add tag..."

**Empty states:**
- Inbox empty: "Inbox is clear. Capture something with ⌘⇧I."
- Today empty: "Nothing due today. Enjoy the calm."
- Project empty: "No tasks yet. Add one with ⌘N."
- Filtered (context/tag) empty: "No tasks match this filter."

**List header:**
- Perspective title and count
- Sort dropdown (defaults: manual position; alternatives: due date, defer date, created, alphabetical, flagged-first)
- Group-by dropdown (defaults: none; alternatives: project, context, due date, tag)
- Add task button (opens new task at top)

### 3.7 Quick-add bar

Persistent at the top of the task list (above the list, below the perspective header):

- Single-line input
- Placeholder: "Add a task to [perspective name]..." (e.g., "Add a task to Inbox...")
- Press Enter: creates the task with title; cleared, ready for next
- Press `⌘Enter`: creates the task and opens inspector for further editing
- Supports `#tag` and `@person` inline (parsed on save; `@person` resolves empty until Wave 6)
- Supports project notation: typing `>>` shows project picker
- Supports context notation: typing `~~` shows context picker
- Supports natural language dates basic version (just "today", "tomorrow", "next week", "next monday" — full natural language is Wave 3c)
- Tab order: stays in input after Enter for rapid capture

**Note:** Wave 2's global capture modal (`⌘⇧I`, triggered by the plus button next to search) still exists and is preserved. It's a *different* capture surface — quicker, modal, accessible from anywhere. The quick-add bar is for rapid in-context capture while looking at a perspective. Both feed into the same task creation logic.

### 3.8 Task inspector

Right pane, opened by:
- Selecting a task and pressing `⌘I`
- Double-clicking a task
- Click an "Open inspector" affordance

Shows full task detail:

- **Header:** Title (inline-editable, large), close button, pin/unpin button
- **Status row:** Checkbox (complete), flag toggle, project (clickable to change)
- **Dates section:** Defer date picker, due date picker, estimated duration input
- **Contexts:** Tag-input style — click to add context from picker
- **Tags:** Tag-input style — type # then name; auto-creates new tags
- **Notes:** Markdown editor (use the Stratum primitive; rich editor with `@`, `#`, `[[` autocomplete via reference parser)
- **Subtasks:** Inline list of subtasks with their own checkbox, ability to add subtask
- **Linked entities:** Auto-shown — people mentioned (will resolve in Wave 6), projects/notes referenced via `[[`
- **Activity:** Audit log entries for this task (created, edited, completed, etc.) — uses AuditLog from Wave 1
- **Footer:** Created date, last modified date, "View raw" debug option (collapsed by default)

The inspector saves changes on blur or after debounce (no explicit Save button). Optimistic UI updates.

### 3.9 Project management

Projects need their own affordances. From the sidebar:

- **Add project** affordance at the bottom of the Projects section
- Click opens a small inline form: title, optional color, status (default "active"), is_sequential toggle
- Created project appears in sidebar immediately

**Project detail view** (when project clicked in sidebar, the middle pane shows):
- Project header at top: title (inline-editable), status pill, task count, color dot
- Project actions menu (kebab): change status, change color, delete, mark all complete, etc.
- Project notes section (collapsible, markdown — use same editor as task notes)
- Task list below (filtered to this project's tasks)
- Quick-add bar pre-scoped to this project

Status changes:
- "Mark complete" sets project.status = 'completed', completed_at = now(), and (with confirmation) marks all incomplete tasks complete
- "Put on hold" sets status = 'on_hold' (project hidden from default views; visible in "All projects including held")
- "Drop" sets status = 'dropped' (similar)

### 3.10 Context management

Contexts are simpler than projects but need their own management:

- **Add context** affordance at the bottom of the Contexts section in sidebar
- Quick form: name, optional icon (single emoji or letter), optional color
- Click context in sidebar → middle pane shows tasks with this context
- Context detail header: name, count, edit/delete actions

### 3.11 Trash

`/tasks/trash` (or Trash perspective active) shows soft-deleted tasks:

- List of trashed tasks with deletion timestamp
- Click row → inspector (read-only with restore action)
- Bulk select for restore or permanent delete
- "Empty trash" action at top (with confirmation)
- Auto-expires after 30 days (background job — for Wave 3a, this can be a manual "Run cleanup" button in Settings → Data; proper scheduled job runs in Wave 4 when scheduled job infrastructure exists)

### 3.12 Capture modal upgrade

Wave 2's capture modal (triggered by the plus button next to the centered search bar, or `⌘⇧I`) showed a placeholder toast. Wave 3a wires it to actually create tasks:

- Submit creates task in Inbox (project_id = null)
- Toast: "Captured to Inbox" with action "View" that navigates to Inbox
- Reference parsing: `#tag` and `@person` in the captured text are recognized and stored (`@person` resolves empty until Wave 6)
- Natural language dates basic: "today", "tomorrow", "next week", "next monday" recognized; full natural language is Wave 3c
- Context notation: typing `~~` opens context picker (or autocompletes from already-typed name)

Both the global capture modal and the inline quick-add bar use the same underlying creation logic.

### 3.13 Cross-module reference resolution

The `@`, `#`, `[[` autocomplete from Wave 2 now has data sources:

- `@` autocomplete: queries Person table — returns empty in Wave 3a since People (Wave 6) hasn't shipped. Empty state: "No people added yet. People sync arrives in Wave 6."
- `#` autocomplete: queries Tag table (returns existing user's tags, sorted by usage_count desc; allows create-new)
- `[[` autocomplete: queries Project, Task. (Notes and Journals don't exist yet; the autocomplete framework should support them but data sources stay empty until Waves 4 and 7.)

The autocomplete component from Wave 2 needs to support multiple search providers (a list of `{ id, search: async (query) => results, label }`). Tasks module registers its providers on mount.

When a reference is selected from autocomplete, it's inserted into the text as plain markdown (e.g., `[[project:abc-123]]` or `#urgent`). The reference parser resolves these on save.

### 3.14 Command palette and shortcuts integration

Tasks module registers commands and shortcuts via Wave 2's registries:

**Commands registered:**
- "New task" → opens capture modal
- "New project" → opens new project form
- "Go to Inbox" / "Go to Today" / "Go to Flagged" / etc.
- "Complete selected" (when tasks selected)
- "Delete selected"
- "Move selected to..."
- Each project as a goto: "Go to [project name]" — generated dynamically

**Shortcuts registered:**
- `⌘N` — New task in current view
- `⌘⇧N` — New project
- `⌘D` — Toggle complete on selected
- `⌘⇧D` — Delete selected
- `⌘F` (within task list) — Focus search/filter
- `⌘I` — Open inspector for selected
- `J` / `K` — Move selection down / up (vim-style; optional)
- `Space` — Toggle complete
- `F` — Toggle flag

These appear in the `⌘/` cheat sheet automatically since Wave 2's registry is extensible.

### 3.15 Search integration

Wave 2's command palette had empty search. Tasks module registers a search provider:

- `search.tasks({ query })` returns tasks matching the query
- Command palette displays them under "Tasks" section
- Click a result → navigates to the task in its current perspective and opens inspector

### 3.16 Audit log integration

Tasks and Projects opt into the audit log infrastructure from Wave 1:

- Create, update, delete, complete, status_change actions all logged
- Diffs computed for updates (changed fields only)
- Inspector "Activity" section reads from AuditLog filtered to this entity

---

## 4. File Structure (additions to Wave 2)

```
/atlas
  /app
    /(app)
      /tasks
        /page.tsx                       # Tasks module entry, redirects to default perspective
        /layout.tsx                     # Three-pane layout
        /inbox/page.tsx
        /today/page.tsx
        /flagged/page.tsx
        /projects
          /page.tsx                     # All projects view
          /[projectId]/page.tsx         # Single project
        /contexts
          /[contextId]/page.tsx
        /tags
          /[tagName]/page.tsx
        /trash/page.tsx
  /components
    /tasks
      tasks-sidebar.tsx
      task-list.tsx
      task-list-item.tsx
      task-inspector.tsx
      task-quick-add.tsx
      project-add-form.tsx
      project-detail-header.tsx
      context-add-form.tsx
      tag-picker.tsx
      bulk-action-bar.tsx
  /core
    /references
      parser.ts
      resolver.ts
    /tasks
      service.ts                        # Business logic (create, update, complete with side effects)
      queries.ts                        # Query helpers
  /server
    /routers
      tasks.ts
      projects.ts
      contexts.ts
      tags.ts
```

---

## 5. Verification (Definition of Done)

Wave 3a is complete when the user can perform this verification flow without any step failing:

**Capture flow:**
1. Press `⌘⇧I` (or click the plus button next to the search bar) → capture modal opens
2. Type "Call Ahmed about Q2 partnership #urgent due tomorrow" → Enter
3. See toast "Captured to Inbox"
4. Navigate to Inbox → task appears with title "Call Ahmed about Q2 partnership", `#urgent` tag visible, due date tomorrow
5. The task's notes (if you opened inspector) shows the original markdown intact

**Inbox processing:**
6. Click the task → inspector opens
7. Click "Project" field → see "No project" with autocomplete
8. Type "Devsinc" → if no project exists with that name, see "Create project: Devsinc"
9. Create project → task moves to Devsinc project
10. Set defer date to next Monday
11. Add context "deep-work" (creating it inline)
12. Close inspector
13. Verify task no longer in Inbox; appears in Devsinc project view; appears in deep-work context view

**Today view:**
14. Navigate to Today (or `⌘1` then click Today)
15. See tasks due today + flagged tasks
16. Click a task, press `Space` → it's marked complete with optimistic strikethrough
17. Refresh page → completion persists

**Project management:**
18. Navigate to Projects → see Devsinc project in list
19. Click Devsinc → see project detail view with tasks
20. Add a new task via quick-add bar at top
21. Add 2 more tasks
22. Drag to reorder them
23. Bulk-select 2 tasks via Shift+click
24. Bulk action bar appears at bottom
25. Click "Add context" → add "errands" context to both
26. Verify both now show errands context

**Context view:**
27. Navigate to Contexts → "deep-work" → see filtered tasks
28. Click "errands" → see different filtered tasks
29. Bulk operations work in context views too

**Tag view:**
30. Navigate to Tags → "#urgent" → see tasks tagged urgent
31. Click a task with #urgent in notes → reference autocomplete works in the editor

**Cross-module references:**
32. Open a task's notes
33. Type `#newtag` → see tag autocomplete (or "Create newtag")
34. Type `@` → see "No people added yet. People sync arrives in Wave 6."
35. Type `[[` → see project list and task list to link to
36. Insert a `[[Devsinc]]` link → save → see it as styled chip in rendered notes
37. Backlinks panel on the linked entity (project) shows this task

**Trash:**
38. Delete a task (right-click → Delete)
39. Navigate to Trash → see deleted task
40. Restore → task returns to its original location
41. Delete again, then "Empty trash" → permanent delete

**Search:**
42. Press `⌘K` → command palette
43. Type "ahmed" → see "Call Ahmed about Q2 partnership" under "Tasks"
44. Click result → navigates to the task and opens inspector

**Performance and feel:**
45. Sidebar counts update in real-time when tasks added/completed/moved
46. Inspector saves on blur, no Save button needed
47. All actions feel instant (optimistic UI); failures revert with toast
48. Keyboard shortcuts work consistently
49. `⌘/` cheat sheet shows all task shortcuts

**The big test:**
50. Use Atlas exclusively for one full work day. At day's end, OmniFocus has not been opened.

When all 50 steps pass — including step 50 over a full day of real use — Wave 3a is complete.

---

## 6. Rules of Engagement (continued from Waves 0-2)

All previous rules continue to apply. Adding for Wave 3a:

### 6.1 Optimistic UI is mandatory

Every user action — completing a task, editing a title, moving a task — must feel instant. Use TanStack Query's optimistic update pattern. On failure, revert and show error toast. Never show a spinner for an action that should feel instant.

### 6.2 Capture is the most important interaction

If capture has any friction, the system fails. The capture modal must:
- Open in <100ms when shortcut pressed or button clicked
- Accept text and Enter immediately
- Never block on AI parsing (Wave 3c will add async parsing; Wave 3a is pure-text)
- Show success feedback in <500ms

If you find yourself adding loading states to capture, stop and reconsider.

### 6.3 Reference parsing must be robust

The reference parser is foundational. It must handle:
- `@names with spaces` (followed by space or punctuation ends the reference)
- `#multi-word-tags` (hyphens allowed)
- `[[entity names with spaces]]`
- Nested `[[refs in [[refs]]]]` — invalid, treat outer as the reference
- Escaped characters (e.g., `\@notamention`)
- Markdown code blocks (references inside backtick code don't parse)
- Edge cases: empty references (`@`, `#`, `[[]]`) — ignore silently

Test the parser thoroughly. Bad parsing means bad data.

### 6.4 Soft delete cascades

Deleting a project does NOT delete its tasks; tasks become inbox items (project_id = null). Confirm this with the user via a confirmation dialog: "Delete project 'X'? Its 12 tasks will move to Inbox."

Deleting a task DOES soft-delete its subtasks (they go to Trash with the parent). Restoring the parent restores the subtasks.

### 6.5 Position-based ordering

Use fractional indexing for `position` field. When inserting between two items, calculate the midpoint. When the precision approaches the limit (~10 inserts in the same gap), trigger a rebalance. This is well-known territory; don't over-engineer it.

### 6.6 Don't auto-suggest contexts/tags from AI

Wave 3a is the manual-entry foundation. The user creates contexts and tags explicitly. AI suggestions for context/tag are Wave 3c. Don't anticipate.

### 6.7 Project status semantics

- `active` — visible in default Projects view, tasks visible in Today/Flagged/etc.
- `on_hold` — hidden from default views; tasks not in Today/Flagged either; visible only in "On hold" filter
- `completed` — moved to Completed section (Wave 3b); tasks similarly
- `dropped` — like completed but no celebration; tasks similarly

For Wave 3a, "on_hold" and "dropped" projects can be hidden simply by filter; the "Completed" / "On hold" perspective views come in Wave 3b.

### 6.8 Completion semantics

A completed task:
- Has `completed_at` set
- Stops appearing in active perspectives (Inbox, Today, Flagged, project active list)
- Appears in Completed perspective (Wave 3b) and search results
- Strikethrough styling in any view that shows completed tasks

Uncomplete clears `completed_at`. The audit log records both directions.

### 6.9 No premature module dependencies

Tasks references People (`@person`), but People doesn't exist until Wave 6. Build Tasks to gracefully handle this:
- `@` autocomplete returns empty with the explanatory message
- Storing `referenced_person_ids` is fine (empty array); the field exists for Wave 6 to populate
- Inspector's "Linked people" section shows "(People sync coming in Wave 6)" — explicit, not awkward

Same logic for Notes (Wave 4) and Journals (Wave 7) — `[[` autocomplete handles missing entity types gracefully without breaking.

---

## 7. Recommended Build Sequence

1. **Schema and migrations** — get the entities into the database
2. **Reference parser** — foundational; everything else depends on it being right
3. **tRPC procedures** — all CRUD for tasks, projects, contexts, tags; test via tRPC playground or simple test page
4. **Tasks module shell layout** — three-pane structure, routing for perspectives
5. **Sidebar (perspectives)** — Inbox, Today, Flagged, Projects, Contexts, Tags, Trash
6. **Task list view (basic)** — TaskListItem rendering, list virtualization for performance, basic perspective filtering
7. **Quick-add bar** — inline capture, basic syntax parsing
8. **Task inspector** — full detail view with all editing
9. **Project management** — add, edit, status changes, project detail view
10. **Context and tag management** — add, edit, delete
11. **Bulk operations** — multi-select, bulk action bar, all bulk procedures
12. **Drag and drop reordering** — within current perspective
13. **Trash perspective** — restore, permanent delete, empty
14. **Capture modal upgrade** — wire to real task creation, replace Wave 2 placeholder
15. **Cross-module references** — `@`, `#`, `[[` autocomplete with data sources, backlinks
16. **Command and shortcut registration** — Tasks plugs into Wave 2 registries
17. **Search integration** — `search.tasks` plugged into command palette
18. **Audit log integration** — Tasks and Projects opt in, inspector Activity tab works
19. **Polish pass** — empty states, loading states, error states, keyboard navigation, performance audit
20. **The big test** — use Atlas for a full work day

Each step concludes with verification.

---

## 8. Definition of Done

Wave 3a is complete when:

- [ ] Schema migrated, all entities working
- [ ] Reference parser handles all syntaxes correctly
- [ ] All tRPC procedures protected and authorized correctly
- [ ] Three-pane Tasks module layout works
- [ ] Sidebar perspectives all functional
- [ ] Task list rendering, virtualized, performant
- [ ] Inline editing works on title and dates
- [ ] Inspector provides full task editing
- [ ] Project management complete (CRUD, status, detail view)
- [ ] Context management complete
- [ ] Tag management complete (mostly auto via parser)
- [ ] Bulk operations functional
- [ ] Drag-and-drop reordering works with fractional positions
- [ ] Trash with restore and permanent delete
- [ ] Capture modal creates real tasks
- [ ] @, #, [[ autocomplete with multiple search providers
- [ ] Backlinks visible on referenced entities
- [ ] Command palette has all task commands
- [ ] Keyboard shortcuts registered and working
- [ ] Search returns task results
- [ ] Audit log records Task and Project changes
- [ ] All 50 verification steps pass
- [ ] No TypeScript errors, ESLint passes
- [ ] Performance budgets met (capture <500ms, action feedback instant)
- [ ] User uses Atlas for a full day without OmniFocus

---

## 9. What is NOT in Wave 3a

Do not build any of the following — they are explicitly later waves:

**Wave 3b (Tasks: Forecast and Review):**
- Forecast view (timeline of next 7 days with calendar overlay)
- Review mode (stalled project walkthrough)
- Completed perspective view
- Project folders / hierarchical project organization
- Sequential project "available task" filtering

**Wave 3c (Tasks: Capture Intelligence):**
- Email-to-inbox endpoint (Resend inbound)
- AI capture parsing (the `capture_parse` task type wiring)
- Natural language date parsing beyond the basic "today/tomorrow/next week/next monday"
- Smart context suggestions

**Wave 4 (Notes):**
- Markdown editor improvements beyond what Stratum already provides
- Note creation from inside Tasks (link to Note)
- Notes-to-Tasks reverse linking

**Wave 5 (Calendar):**
- Drag tasks onto calendar
- Time-blocking
- Calendar event display

**Wave 6 (People):**
- Real `@person` autocomplete results (Wave 3a returns empty with clear message, that's correct)
- Person-to-task interaction logging

**Wave 7 (Journals):**
- Journal entry to task linking
- `[[journal]]` autocomplete

**Phase 2:**
- Custom perspectives (saved filtered views)
- Recurring tasks
- Task templates
- Smart inbox auto-routing

If you find yourself building any of these, stop. Wave 3a is the GTD core only.

---

## 10. Final note

This wave is the moment of truth. Every architectural decision in Waves 0-2 was preparation for this. If the foundation work was good, Wave 3a should compose cleanly. If shortcuts were taken in foundation, this wave will expose them.

The ultimate verification is not a checklist — it's whether you find yourself reaching for Atlas instead of OmniFocus tomorrow morning. Build with that as the north star.

When in doubt: **ask before assuming. Verify before declaring done. Hold the bar high.**

Begin with section 7, step 1.
