# Replit Agent Prompt — Atlas Wave: Tasks Refinement v2

## Read this entire prompt before taking any action.

---

## 1. Overview

The original Wave 3a polish wave shipped successfully — subtasks, checklists, recurrence, activity feed, work logging, quick actions on rows, estimated time aggregation, defer date strictness, and Forecast lookback are all in production.

Continued real use has surfaced a fresh set of issues. This wave addresses them in one focused effort. Nothing here is large individually; together they meaningfully improve daily-use friction.

**The work:**

1. **Today/Forecast date filtering bug** — fix queries so tasks due tomorrow don't appear in Today and DO appear in Forecast on tomorrow's column
2. **AI suggestion Accept button bug** — fix broken Accept action in capture parse suggestions
3. **Progress note dropdown CSS** — restore visible styling on "Time spent" number input
4. **Tomorrow perspective** — new sidebar entry between Today and Forecast
5. **Tag architecture fix** — AI no longer auto-creates tags from arbitrary text recognition; only explicit `#tag` syntax creates tags
6. **Tag management UI** — rename, merge, delete with usage counts
7. **Tags section collapsed by default** — visual hygiene; show count even when collapsed
8. **Context management UI** — rename, delete (similar to tag operations)
9. **Contexts section collapsed by default** — same treatment as Tags
10. **Project/Folder architecture clarity** — confirm and enforce: folders contain projects (and other folders); projects contain tasks; tasks have subtasks (one level only)
11. **Media thumbnail sizing** — change from large rectangles to smaller squares for better grid density

**Pre-requisites:**

- Wave 3a, Wave 3a Polish, Wave 3c, and Media wave all shipped and stable
- Some real-use data exists (tasks, projects, folders, tags, attachments) so behaviors are testable

**Estimated scope:** 1.5-2 weeks of focused work.

---

## 2. Detailed deliverables

### 2.1 Today/Forecast date filtering bug

Real use observation: a task with `due_date = tomorrow` is appearing in the Today view (wrong), and the same task is NOT appearing in Forecast on tomorrow's column (also wrong). Both queries have bugs.

**Today view query — what it should be:**

```sql
WHERE user_id = ? 
  AND completed_at IS NULL
  AND deleted_at IS NULL
  AND (
    -- Due today
    (due_date IS NOT NULL AND due_date::date = CURRENT_DATE)
    -- OR overdue (due in the past)
    OR (due_date IS NOT NULL AND due_date::date < CURRENT_DATE)
    -- OR flagged (regardless of date)
    OR flagged = true
  )
  AND (
    -- Not deferred to the future
    defer_date IS NULL OR defer_date <= NOW()
  )
```

Critical: tasks due tomorrow must NOT match unless flagged. The current implementation appears to be matching too liberally.

**Forecast view query — what it should be:**

For each day in the forecast range:

```sql
WHERE user_id = ?
  AND completed_at IS NULL
  AND deleted_at IS NULL
  AND (
    -- Tasks due on this specific day
    (due_date IS NOT NULL AND due_date::date = ?)
    -- OR tasks scheduled (deferred to) this specific day
    OR (defer_date IS NOT NULL AND defer_date::date = ?)
  )
```

A task with due_date = May 1 must appear in the May 1 column of Forecast.

**Diagnose the existing queries:**

Audit current Today and Forecast query implementations. Common bugs:
- Date comparison using inclusive boundaries when they should be exclusive
- Using `>` when `>=` is needed (or vice versa) for the defer date check
- Forgetting timezone conversion when comparing user-facing dates
- Comparing timestamps when only the date portion should match

Fix the queries. Add unit tests covering boundary conditions: exactly today, exactly tomorrow, exactly yesterday, deferred, flagged variations.

---

### 2.2 AI suggestion Accept button bug fix

Bug observed: in capture parse suggestions, clicking "Accept" on a suggested project doesn't apply the project to the task.

**Diagnosis steps:**

1. Open a task with parse suggestions visible
2. Click Accept on the project suggestion
3. Inspect: does the network request fire? Does the server receive it? Does the database update?
4. Trace where the chain breaks

Common causes:
- Click handler bound to wrong element
- tRPC mutation not invalidating relevant queries (UI doesn't re-render)
- Suggestion UI uses stale state and doesn't reflect server response

Fix the broken Accept action. Verify:
- Click Accept → project applied immediately (optimistic UI)
- Network request fires
- Server returns success
- Suggestion disappears from UI
- Task now shows the project assignment

Same verification for Skip and Different... actions.

---

### 2.3 Progress note dropdown CSS fix

Bug observed: the "Time spent (optional)" number input in the Add Update form has lost its visible styling. Only the up/down spinner controls are showing; the input field itself is invisible.

**Fix:**

The number input should render with:
- Visible border (matching other text inputs in the app)
- Background color (matching theme)
- Padding so the number text is readable
- Label "Time spent (optional)" clearly visible
- Suffix indicator: "minutes" after the number

**Recommended treatment:**

```
Time spent (optional)
[  30  ] minutes
```

A simple number input with a fixed "minutes" suffix is cleaner than a dropdown.

---

### 2.4 Tomorrow perspective

Add a new perspective to the sidebar between Today and Forecast.

**Sidebar order:**

```
Inbox
Today
Tomorrow      ← NEW
Forecast
Flagged
Review
─────
PROJECTS
  ...
─────
CONTEXTS    (collapsed by default — see 2.9)
  ...
─────
▶ TAGS (n)  ← collapsed by default — see 2.7
─────
Completed
Trash
```

**Tomorrow query:**

```sql
WHERE user_id = ?
  AND completed_at IS NULL
  AND deleted_at IS NULL
  AND (
    -- Due tomorrow
    (due_date IS NOT NULL AND due_date::date = CURRENT_DATE + INTERVAL '1 day')
    -- OR scheduled (deferred to) tomorrow
    OR (defer_date IS NOT NULL AND defer_date::date = CURRENT_DATE + INTERVAL '1 day')
  )
```

Tomorrow does NOT include flagged tasks (those stay in Flagged). Tomorrow does NOT include overdue tasks. It's specifically the tomorrow-only view.

**Tomorrow view header:**

```
Tomorrow · April 30
Due tomorrow or scheduled for tomorrow
[task count] · [estimated time]
```

**Quick-add bar in Tomorrow view:**

Captures a task with `due_date = tomorrow` by default. Adding a task while viewing Tomorrow auto-schedules it appropriately.

---

### 2.5 Tag architecture fix — AI suggests, doesn't auto-create

Real use observation: two captures created five tags. The capture parser is auto-creating tags from any term it identifies as tag-like. Without intervention, the user's tag library would balloon to hundreds of unused tags within weeks.

**New rule:**

- **Explicit `#tag` syntax** in capture text creates the tag immediately. User typed it; they meant it.
- **AI-detected tag candidates** (from compromise.js entity extraction or AI parsing) are *suggestions only*. They appear in the parse suggestion UI for the user to accept or reject.
- **Tags that don't exist yet** can be suggested with "Create new tag #X" affordance, but require user click to actually create.
- **Tags that already exist** in user's tag library can be auto-applied without confirmation since the user already created them at some point.

**Implementation changes:**

In the capture parser (`core/capture/parser/tier-1-local.ts` and `tier-2-ai.ts`):

```typescript
// BEFORE (current, wrong):
extractTags(text: string): { tagsToCreate: string[], tagsToApply: string[] }
// returned both new and existing tags merged, all auto-applied

// AFTER (correct):
extractTags(text: string, existingTags: Tag[]): {
  explicitTags: Tag[]              // From #tag syntax — auto-applied
  matchedExistingTags: Tag[]       // AI-detected, matched against existing — auto-applied  
  suggestedNewTags: string[]       // AI-detected, no match — SUGGEST ONLY, never auto-create
}
```

The parsing pipeline ends with capture parse log including suggested new tags but NOT creating them. The Inbox processing UI (or capture review modal) shows them as suggestions:

```
💡 Suggestions:
  ...
  Create new tags: #vercel  #deployment  [Accept all] [Pick which] [Skip]
```

User accepts → tags created and applied.
User picks → modal showing each suggestion with individual accept/reject.
User skips → suggestions discarded, no tags created.

**Migration of existing accidentally-created tags:**

Run a one-time analysis on existing tags. Tags with `usage_count == 1` and no explicit user interaction (never edited, never manually applied to additional tasks) are likely accidental creations. Surface these in the Tag management UI (section 2.6) as a "Tags with single use — review and clean up" section. Don't auto-delete; let the user decide.

---

### 2.6 Tag management UI

Tags need rename, merge, and delete operations. Build a "Manage tags" view accessible from the sidebar.

**Access point:**

In the sidebar, Tags section header has a small gear/manage affordance:

```
▼ TAGS (12)              ⚙
  #urgent       3
  #q2           5
  ...
```

Click gear → opens Tag management view in main pane.

**Tag management view:**

```
+--------------------------------------------------+
|  Manage tags                              [×]    |
+--------------------------------------------------+
|                                                  |
|  [Search tags...]      Sort: [Most used ▼]      |
|                                                  |
|  ┌──────────────────────────────────────────┐   |
|  │ ☐ #urgent          12 uses    [⋯]       │   |
|  │ ☐ #q2              8 uses     [⋯]       │   |
|  │ ☐ #devsinc         6 uses     [⋯]       │   |
|  │ ☐ #vercel          1 use      [⋯]       │   |
|  │ ☐ #deployment      1 use      [⋯]       │   |
|  │ ...                                      │   |
|  └──────────────────────────────────────────┘   |
|                                                  |
|  When tags are selected:                         |
|  [Bulk rename...] [Merge into...] [Delete]      |
|                                                  |
|  💡 5 tags with only 1 use — review for cleanup │
|                                                  |
+--------------------------------------------------+
```

**Per-tag actions (⋯ menu):**

- **Rename**: Inline edit. Renames the tag everywhere it's used (no need to update each task).
- **Merge into another tag**: Pick destination tag. All tasks with this tag get the destination tag instead. The original tag is deleted.
- **Delete**: Confirmation dialog showing usage count. "Delete #vercel? Used in 1 task. The tag will be removed from that task; the task itself is unaffected." Confirm → tag soft-deleted, removed from all tasks.

**Bulk operations:**

When multiple tags selected via checkbox:
- **Merge into...**: pick destination, all selected tags merged into it
- **Delete**: bulk delete with confirmation showing total usage

**Cleanup suggestion:**

The view highlights tags with usage_count == 1 as cleanup candidates. "5 tags used only once — review and clean up?" Click → filters list to show just those.

**tRPC procedures:**

```
tags.rename({ id, new_name })
tags.merge({ from_id, into_id })
tags.bulkDelete({ ids })
tags.usageStats() → { tag_id, usage_count, last_used_at }[]
```

---

### 2.7 Tags section collapsed by default

In the sidebar, the Tags section is collapsed by default.

**Behavior:**

- Section header: `▶ TAGS (12)` when collapsed (showing count)
- Section header: `▼ TAGS (12)` when expanded
- State persists per user (localStorage / Zustand local storage is fine; no DB needed)
- Same default for new users (collapsed)

**Why:** With 50+ tags, an expanded section dominates the sidebar. Collapsing by default keeps visual hygiene; the count communicates that tags exist without showing them all.

---

### 2.8 Context management UI

Same operations as tag management, smaller scope (most users have 5-15 contexts at most).

**Access point:**

Contexts section header has gear/manage affordance, similar to Tags.

**Context management view:**

```
+--------------------------------------------+
|  Manage contexts                    [×]    |
+--------------------------------------------+
|                                            |
|  ┌──────────────────────────────────────┐ |
|  │ Insightive       🏢   2 tasks  [⋯]   │ |
|  │ Devsinc          🏢   5 tasks  [⋯]   │ |
|  │ Errands          🚗   0 tasks  [⋯]   │ |
|  │ Deep work        🧠   3 tasks  [⋯]   │ |
|  └──────────────────────────────────────┘ |
|                                            |
|  [+ Add context]                           |
|                                            |
+--------------------------------------------+
```

Per-context actions (⋯):
- **Rename**: inline edit
- **Change icon/color**: small picker
- **Delete**: confirmation, removes context from all tasks (tasks themselves stay)

**tRPC procedures:**

```
contexts.rename({ id, new_name })
contexts.update({ id, name?, icon?, color? })
contexts.delete({ id })
```

These mostly already exist; verify and add the management UI.

---

### 2.9 Contexts section collapsed by default

Same treatment as Tags (section 2.7). Section header shows count; default collapsed; expandable on click.

**Projects section stays expanded by default.** Projects are the primary organizational structure; users navigate them frequently.

---

### 2.10 Project/Folder architecture clarification and enforcement

Real use has revealed ambiguity between projects and folders. Confirm and enforce the correct architecture.

**Correct architecture:**

Three distinct levels of organization:

1. **Folders** organize projects and other folders. Folders do NOT contain tasks directly. A folder is purely structural.
2. **Projects** contain tasks. A project is where actual work lives. Projects do NOT contain other projects.
3. **Tasks** can have subtasks (one level deep, established in the previous polish wave). Tasks do NOT contain projects or folders.

**Visual hierarchy in sidebar:**

```
PROJECTS                              [+]
▼ Devsinc                    [folder]
    ▼ Q2 2026                [folder]
        • Q2 Planning         [project]
        • Q2 Marketing        [project]
    ▶ Operations             [folder, collapsed]
▼ TGC                         [folder]
    • Brand Launch            [project]
    • Founding Team           [project]
• Personal Health             [project at root, no folder]
• Atlas (this project)        [project at root]

[+ Add project]  [+ Add folder]
```

Folders have folder-style icon (chevron + folder icon). Projects have colored dot icon. The visual difference is clear.

**Constraints to enforce server-side:**

- `tasks.create`: parent must be a Project (`project_id`) or another Task (`parent_id` for subtask). Reject if either points to a Folder.
- `projects.create`: cannot accept `parent_project_id` (no project nesting). Can accept `folder_id` to place in a folder.
- `folders.create`: can accept `parent_folder_id` for nesting (max 5 levels deep).

**Audit existing data:**

1. Check the schema: does the Project entity have a `parent_project_id` field that might be misused? (Probably not, but verify.)
2. Check whether any existing data violates the architecture: are there tasks whose parent is a folder? Are there projects with parent_project_id set?
3. Check the sidebar rendering: looking at "Sample 3" with a folder icon and "Testing" with a project dot — confirm these are correctly distinguished and behaving as their type implies.

If any data is inconsistent (e.g., tasks orphaned in folders, projects nested wrongly), fix it before enforcing the constraints. Surface the issue to the user with: "Found N tasks directly in folders. Move them to a project? [Pick projects] [Create default project per folder]"

**Sidebar UI fixes:**

Looking at the screenshot, "Sample 3" appears with a folder icon and chevron. Verify this is intentionally a folder, not a project that's misrendered. The chevron should only appear on folders (signaling expand/collapse of children); projects should not have a chevron.

If a project somehow has children rendering, that's a bug — investigate why and fix.

**Drag-drop semantics:**

- Drag project into folder → moves project, OK
- Drag folder into folder → nests folder (within depth limit), OK
- Drag task into folder → REJECTED (no drop target highlight, no action)
- Drag project into project → REJECTED
- Drag task into project → moves task, OK

---

### 2.11 Media thumbnail sizing

Looking at the Media inbox screenshot, the thumbnails are large rectangles (~200x150) and one tile per row dominates the screen. For grid density and quick scanning, smaller squares would work better.

**Change:**

Media inbox tile thumbnails change from rectangular ~200x150 to square ~120x120.

**Implications:**

- Grid fits more tiles per row at typical screen widths (4-6 per row instead of 2-3)
- Faster scanning of large media collections
- Image aspect ratios get cropped to square for thumbnail display (focus on center)
- Full preview in side panel still shows correct (uncropped) aspect ratio

**Implementation:**

In the attachment thumbnail component, update dimensions:
- Before: width: 200px, height: 150px, object-fit: cover
- After: width: 120px, height: 120px, object-fit: cover

Adjust grid layout to use the new dimensions. CSS Grid with `repeat(auto-fill, minmax(120px, 1fr))` handles this elegantly.

**Filename and metadata below thumbnail** still need to be readable at the smaller width. Truncate long filenames with ellipsis; metadata gets compact.

---

## 3. File structure additions

```
/atlas
  /app
    /(app)
      /tasks
        /tomorrow
          /page.tsx                  (Tomorrow perspective)
        /tags
          /manage/page.tsx           (Tag management view)
        /contexts
          /manage/page.tsx           (Context management view)
  /components
    /tasks
      tomorrow-perspective.tsx
      tag-management.tsx
      tag-suggestion-prompt.tsx      (AI suggestion accept/skip UI)
      context-management.tsx
    /sidebar
      tags-section.tsx               (collapsible with count)
      contexts-section.tsx           (collapsible with count)
  /core
    /tags
      cleanup.ts                     (analyze tags for cleanup suggestions)
      migration.ts                   (one-time analysis of accidental tags)
  /server
    /routers
      tags.ts                        (additions: rename, merge, bulk operations)
      contexts.ts                    (additions: rename, delete with task handling)
```

No schema changes needed. All tables exist; only behavior and UI changes.

---

## 4. Verification (Definition of Done)

### Today/Forecast date filtering bug
1. Create a task with due_date = tomorrow, no flag
2. Today view: task does NOT appear
3. Forecast view: task appears in tomorrow's column
4. Mark the task as flagged
5. Today view: task NOW appears (flag override)
6. Forecast view: task still appears in tomorrow's column

### AI suggestion Accept button
7. Open task with parse suggestions
8. Click Accept on project suggestion → project applied immediately
9. Suggestion disappears from UI
10. Task now shows project assignment
11. Same for Skip and Different... actions

### Progress note dropdown CSS
12. Open task → Activity tab → click "+ Add update"
13. Form shows visible number input for "Time spent (optional)"
14. Number input has clear border, label, and "minutes" suffix
15. Type number → spinner controls work
16. Submit → work log entry saved with correct duration

### Tomorrow perspective
17. Sidebar shows Tomorrow between Today and Forecast
18. Navigate to Tomorrow → tasks due/scheduled for tomorrow visible
19. Quick-add a task in Tomorrow → due_date set to tomorrow automatically
20. Task scheduled (deferred) for tomorrow appears in Tomorrow but not Today

### Tag architecture fix
21. Capture text without explicit `#tag` syntax → AI suggests new tags but doesn't create them
22. Capture text with `#existingtag` → tag applied immediately (matches existing)
23. Capture text with `#completelynewterm` → new tag created (explicit syntax)
24. AI suggestions for new tags appear in Inbox processing as "Create new tags: ... [Accept all] [Pick] [Skip]"
25. Skip → no tags created
26. Accept all → tags created and applied

### Tag management UI
27. Sidebar Tags section header → gear/manage affordance visible
28. Click manage → Tag management view opens
29. List shows all tags with usage counts
30. Rename tag → all tasks using it show new name immediately
31. Merge two tags → tasks of source now have destination, source deleted
32. Delete tag → confirmation, tag removed from all tasks (tasks unaffected)
33. Cleanup suggestion shows tags with low usage
34. Bulk select multiple tags → bulk operations work

### Tags collapsed by default
35. Tags section collapsed by default (header shows count: `▶ TAGS (n)`)
36. Click → expands; state persists across page reloads
37. Same behavior for new users

### Context management UI
38. Contexts section gear/manage affordance visible
39. Open Manage contexts → list with usage counts
40. Rename context → tasks using it show new name
41. Delete context → confirmation, removed from tasks
42. Add new context inline

### Contexts collapsed by default
43. Contexts section collapsed by default (header shows count)
44. Same expand/collapse behavior as Tags
45. Projects section stays expanded by default

### Project/Folder architecture
46. Sidebar shows folders with folder icon and chevron, projects with colored dot (no chevron on projects)
47. Create a folder → appears at root of Projects section with folder icon
48. Try to add task directly to folder → no UI affordance
49. Add a project to the folder → project nests under folder
50. Try to create project nested inside another project → not possible
51. Add sub-folder to folder → nests up to 5 levels deep
52. Drag project into folder → moves correctly
53. Drag folder into folder → nests correctly (within depth limit)
54. Drag task onto folder → rejected (no drop highlight, no action)

### Media thumbnail sizing
55. Open Media inbox
56. Thumbnails are square, ~120px (smaller than before)
57. More tiles fit per row than before (typically 4-6 at standard viewport)
58. Click thumbnail → side panel shows correct uncropped aspect ratio
59. Filename and metadata below thumbnail still readable

When all 59 verification steps pass, the wave is complete.

---

## 5. Rules of engagement

### 5.1 Bug fixes ship first

Phase the work so the three bugs (Today/Forecast filtering, AI Accept button, dropdown CSS) ship first. They're actively wrong right now; fixing them produces immediate user-visible improvement and lets you (Umar) feel relief while the larger pieces are still in progress.

### 5.2 Architectural fixes are foundational

Tag architecture (2.5) and Project/Folder architecture (2.10) are foundational corrections. Get them right early in the wave so subsequent UI work is built on the correct model. Don't ship new tag-management UI on top of an auto-creating parser — fix the parser first, then build the UI.

### 5.3 Tag creation is gated server-side

The capture parser tRPC procedure must NOT auto-create tags from AI suggestions. Only:
- Explicit `#tag` syntax in raw capture text creates tags
- User explicit acceptance via the suggestion UI creates tags

Enforce this at the API layer, not just UI. If you find the parser somewhere creating tags from AI output, that's the bug. Fix it at the source.

### 5.4 Folder/Project hierarchy enforced at API layer

The constraints in 2.10 must be enforced server-side:
- `tasks.create` rejects requests where parent is a Folder
- `projects.create` rejects requests with `parent_project_id`
- `folders.create` checks depth limit

The UI should also disallow these affordances, but the server is the gate.

### 5.5 Migration of accidental tags is opt-in

For the tag architecture fix migration: don't auto-delete accidentally-created tags. Surface them in the Tag management UI as cleanup candidates. User decides per-tag what to do. Auto-deletion would erase intentional categorizations along with accidental ones.

### 5.6 No schema changes

Everything in this wave is behavior, UI, or query corrections. No new tables, no new fields. If you find yourself proposing schema changes, that's a sign the scope has drifted — stop and ask.

### 5.7 Don't break what works

The previous polish wave shipped substantial functionality. All of that must continue working after this wave. Specifically:
- Subtasks and checklists still work as designed
- Recurrence still works
- Activity feed and work logging still work
- Quick actions on rows still work
- Estimated time aggregation still works

If any of these regress, fix before declaring done.

---

## 6. Recommended Build Sequence

**Phase 1: Bug fixes (3-5 days, quick wins)**

1. **Today/Forecast date filtering bug** — query corrections, unit tests covering boundary conditions
2. **AI suggestion Accept button** — diagnose the broken click handler, fix
3. **Progress note dropdown CSS** — restore visible styling on number input

**Phase 2: Architectural enforcement (3-4 days, foundational)**

4. **Tag architecture fix** — capture parser changes (suggest, don't auto-create); migration analysis for existing accidental tags
5. **Project/Folder architecture** — verify schema, audit data for inconsistencies, enforce constraints server-side, fix any sidebar rendering issues

**Phase 3: New perspective (1-2 days)**

6. **Tomorrow perspective** — sidebar entry, query, view, quick-add default

**Phase 4: Management UIs (3-4 days)**

7. **Tag management UI** — Manage tags view, rename/merge/delete
8. **Context management UI** — Manage contexts view (lighter scope than tags)

**Phase 5: Sidebar visual hygiene (1 day)**

9. **Tags section collapsed by default** — with count display
10. **Contexts section collapsed by default** — same treatment

**Phase 6: Media polish (1 day)**

11. **Media thumbnail sizing** — change to 120px squares, adjust grid layout

**Phase 7: Verification**

12. **Verification** — all 59 steps

This sequence puts bug fixes first (immediate user relief), then architectural corrections (foundational), then features and polish.

---

## 7. What is NOT in this wave

**Wave 3b territory:**
- Forecast view enhancements beyond the date bug fix (Wave 3b builds Forecast properly)
- Review mode
- Completed perspective
- Sequential project filtering enhancements

**Wave 4+ territory:**
- Notes module
- Calendar two-way sync
- People module
- Journals module

**Phase 2 candidates:**
- Custom perspectives (saved filtered views)
- Tag color customization
- Context icons beyond simple emoji
- AI-powered tag suggestion improvements (e.g., recommending which tag to merge into)
- Vault module (the permanent records vault)

If you find yourself building any of these, stop.

---

## 8. Final note

The bugs in this wave are actively wrong in production. The architectural corrections prevent compounding mistakes (tag explosion, project/folder confusion). The new UIs (Tomorrow, Tag/Context management) address gaps that real use surfaced.

None of it is glamorous. All of it makes Atlas noticeably better as a daily-driver tool.

Begin with section 6, Phase 1.
