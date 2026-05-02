# Atlas CR — Project Type System Rework + Polish

## Read this entire CR before taking any action.

---

## 1. Overview

Wave 4a shipped Projects with a fixed three-type system (`project | goal | habit`). Real-use thinking has surfaced two problems:

1. **The fixed three-type taxonomy is wrong for the real range of initiatives.** Travel, Learning, Health, Reading, Marathon, Vacation — these don't fit cleanly as Projects, Goals, or Habits. Forcing them into the three buckets means most things end up labeled wrong.

2. **Habit as a distinct type invites design pressure toward gamification.** Even with explicit "no streaks, no percentages" rules, having Habit as a first-class type creates ongoing temptation to add habit-tracker features that conflict with our principle of facts-not-interpretations. Removing the type removes the temptation. Things like "Meditate daily" work fine as recurring tasks within any project, or as a Goal type if structure matters.

This CR transitions the type system from closed-three to open-string with curated suggestions, removes Habit, migrates existing data safely, and bundles the previously-deferred polish (filter pills, informational header metrics) into one shippable unit.

**The work:**

1. **Type field becomes free-form string** (with sensible default and curated suggestions in the picker)
2. **Habit type removed** — existing Habit projects migrate to Goal
3. **Sidebar grouping becomes dynamic** — shows only types the user actually has
4. **Type picker on project creation** — curated suggestions + custom option
5. **Filter pills on All Projects page** — dynamic pills with overflow dropdown for many types
6. **Informational metrics in project header** — task counts and dates as facts, no percentages
7. **Type-based templates deferred** — explicitly noted as Phase 2 (e.g., creating a "Travel" project could pre-suggest itinerary table, packing list note, etc., but that's later)

**Pre-requisites:**

- Wave 4a is shipped and stable
- Existing projects exist with types in `{project, goal, habit}`
- Sidebar Projects section already groups by Type (this CR generalizes that grouping)

**Estimated scope:** 2-3 days of focused work.

---

## 2. Detailed deliverables

### 2.1 Type field becomes free-form string

#### 2.1.1 Schema change

The `type` field on Project is currently constrained to `{project, goal, habit}`. Change it to a free-form string:

```prisma
model Project {
  // existing fields...
  
  type        String    @default("project")  // Free-form, lowercased
  
  // existing fields continued...
}
```

If the field has a CHECK constraint or enum at the DB level, drop that constraint. The application layer enforces:
- Lowercase storage (e.g., "goal" not "Goal")
- Trimmed (no leading/trailing whitespace)
- Length limit (32 chars max for sanity)
- Display capitalization happens at render time (e.g., "goal" displayed as "Goal", "travel" as "Travel")

Special characters allowed in type names: alphanumeric, spaces, hyphens. Reject anything else (no slashes, quotes, etc. — keeps URL slugs clean).

#### 2.1.2 Migration of existing data

Run a one-time migration:

1. All projects with `type = 'habit'` → update to `type = 'goal'`
2. All projects with `type = 'project'` → no change
3. All projects with `type = 'goal'` → no change

Audit log: write a `project_type_migrated` entry for each project that was changed, so the user can see what happened.

If there are zero existing Habit projects (likely, given early-stage use), this migration is a no-op but should still run for safety.

### 2.2 Sidebar grouping becomes dynamic

The sidebar currently groups by the three hardcoded types. Change to dynamic grouping:

#### 2.2.1 Behavior

- Query: get all projects, group by `type`
- Each group renders as a collapsible section with the type name (capitalized for display) and count
- Empty groups don't render (no "Habits (0)" if user has no habits)
- Order of groups: by user's most-frequently-used type first, then alphabetical
- Within each group: alphabetical by project name

```
PROJECTS                              [+]

▼ Projects (3)
    • Atlas
    • Q2 Strategy
    • Operations Q2

▼ Goals (2)
    • Run a half marathon
    • Save emergency fund

▼ Travel (1)
    • Japan trip 2026

▼ Learning (1)
    • Master Spanish
```

If the user creates a project with type "Hobby Project" and later another with type "Hobby," they'd appear as two separate groups. This is acceptable for v1 — the merge/rename UI for types is a Phase 2 concern (see section 7).

#### 2.2.2 Collapse state

Each group's collapsed/expanded state persists per type, per user. Use Zustand local storage (no DB schema change needed). When a new type appears for the first time, default to expanded.

#### 2.2.3 Empty state

If user has zero projects of any type, sidebar shows the existing empty state ("No projects yet — create one with [+]").

### 2.3 Type picker on project creation

The "+" button on the Projects sidebar header opens a Type picker:

#### 2.3.1 Picker UI

```
[+]
┌──────────────────────────┐
│ + New Project            │
│ + New Goal               │
│ ──────                   │
│ + New Travel             │
│ + New Learning           │
│ + New Health             │
│ + New Reading            │
│ ──────                   │
│ + Custom type...         │
└──────────────────────────┘
```

The picker shows:
- **Section 1**: Project (default) and Goal — the two universally useful types
- **Divider**
- **Section 2**: Curated suggestions — Travel, Learning, Health, Reading
- **Divider**
- **Section 3**: Custom type entry

#### 2.3.2 Curated suggestions logic

The curated suggestions list is **adaptive**. Specifically:

- If the user already has projects of certain types (e.g., they've used "Travel" before), those types appear in section 2 with the user's existing usage prioritized
- If the user has never used a type from the curated list, show the standard curated set
- Types the user has created (e.g., "Hobby") that aren't in the standard curated set ALSO appear in section 2 if they've been used 2+ times

This balances helping new users (curated defaults) with respecting existing users (their patterns are reinforced).

For Wave 4a state, where Project/Goal are the only existing types, the picker shows:
```
+ New Project
+ New Goal
──────
+ New Travel       ← curated default
+ New Learning     ← curated default
+ New Health       ← curated default
+ New Reading      ← curated default
──────
+ Custom type...
```

#### 2.3.3 Custom type entry

Click "Custom type..." → small inline dialog:

```
+--------------------------------+
|  What kind of initiative?      |
+--------------------------------+
|                                |
|  Type name                     |
|  [_____________________]       |
|                                |
|  Examples: Vacation, Habit,    |
|  Side Project, Marathon        |
|                                |
|  [Cancel]            [Create]  |
+--------------------------------+
```

Validate: 1-32 chars, alphanumeric + spaces + hyphens. Lowercase before storing.

If the user types a name that already exists (e.g., "Travel" when "travel" projects exist), don't create a duplicate type — use the existing one.

After custom type creation, the new type joins the curated suggestions for future picker invocations (if used 2+ times).

#### 2.3.4 Naming flow

After Type is selected, prompt for project name as usual. Project is created with `type = <selected>`, defaults applied (status = 'active', no target_date).

### 2.4 Filter pills on All Projects page

The All Projects page (`/tasks/projects` or equivalent) gets a filter pill row.

#### 2.4.1 Visual treatment

```
+------------------------------------------------------+
|  All Projects                                        |
+------------------------------------------------------+
|                                                      |
|  [All]  [Projects 3]  [Goals 2]  [Travel 1]  [More ▼]│
|                                                      |
|  ─────                                                |
|                                                      |
|  • Atlas                            Project          |
|  • Q2 Planning                      Project          |
|  • Run a half marathon              Goal             |
|  • Japan trip 2026                  Travel           |
|  ...                                                  |
|                                                      |
+------------------------------------------------------+
```

#### 2.4.2 Behavior

- "All" pill is active by default; URL has no `?type` param
- Type pills filter the list to that type; URL becomes `?type=goal` (lowercase)
- Active pill is visually distinct (filled background)
- Counts shown in pills (e.g., "Goals 2")
- Filter state persists in URL query parameter
- Browser back/forward works naturally
- Page refresh preserves the filter

#### 2.4.3 Overflow handling

When the user has many types (4+ in addition to All/Projects/Goals), the most-used types are shown as pills and the rest collapse into a "More ▼" dropdown:

```
[All]  [Projects 3]  [Goals 2]  [Travel 1]  [More ▼]
                                                    ├─ Learning (1)
                                                    ├─ Health (1)
                                                    └─ Reading (1)
```

Rules for what's a pill vs in the dropdown:
- "All" is always a pill, leftmost
- Top 3-4 most-used types are pills
- Remaining types are in the More dropdown
- If a type from the dropdown is selected, it temporarily replaces the least-used pill (so the active filter is always visible)

For users with 1-3 types, no overflow needed; all types are pills.

#### 2.4.4 Empty states

Filtered to a type with no matching projects: "No [type] projects yet."

E.g., if user clicks "Travel" pill but has no travel projects: "No travel projects yet."

The "All" filter empty state stays as the existing empty state.

### 2.5 Informational metrics in project header

When viewing a project's detail page, the header shows informational facts. The same metrics apply to all project types — no type-specific behavior. The principle: facts the user can interpret, not interpretations the system imposes.

#### 2.5.1 Metrics shown for all projects

A small metadata row beneath the project title:

```
+------------------------------------------------------+
|  Run a half marathon                          [⋯]    |
|  Goal · Active                                       |
|  ─────                                                |
|  12 tasks total · 6 active · 6 completed             |
|  Target: October 15, 2026 (5 months away)            |
|  Last activity: 3 days ago                           |
+------------------------------------------------------+
```

**Specific metrics:**

- **Task counts** as three numbers (no percentage):
  - Total tasks (all tasks scoped to this project, regardless of state)
  - Active tasks (incomplete, not deferred to the future)
  - Completed tasks (have completed_at set)
  - Format: `12 tasks total · 6 active · 6 completed`
  - Critical: never compute or display this as a percentage

- **Target date and time-to-target** (only if `target_date` is set):
  - Format: `Target: [formatted date] ([N days/weeks/months] away)` for future dates
  - Format: `Target: [formatted date] (passed [N days] ago)` for past dates
  - Date uses Locale formatter
  - Time distance: "5 months away", "3 weeks away", "yesterday", "passed 2 days ago"

- **Last activity** (only if there's been any task interaction in the past 30 days):
  - Most recent of: any task created, completed, or modified in this project
  - Format: `Last activity: today` / `yesterday` / `3 days ago` / `2 weeks ago`
  - If no activity in past 30 days, omit this line entirely

#### 2.5.2 Empty state

If a project has zero tasks:

```
No tasks yet
Target: October 15, 2026 (5 months away)
```

Don't show "0 tasks total · 0 active · 0 completed" — that's noise.

#### 2.5.3 No type-specific metric variation

Importantly, **all project types show the same metrics**. The header doesn't change based on whether it's a Project, Goal, Travel, or anything else. The user-defined Type is a label for organization; the underlying entity is the same and gets the same display.

This is intentional. The previous CR draft had Habit-specific displays (count this month, last performed). With Habit removed, that complexity goes away. All projects render identically in the header.

#### 2.5.4 Tracker table (deferred to Wave 4c)

When a project has an attached tracker table (Wave 4c feature), the metrics section will be enhanced to show the table-based progress (which can include percentages because the user defined the metric explicitly via the table).

For this CR: do NOT implement tracker table integration. The metrics section shows only task counts and dates. Wave 4c adds the tracker table layer on top.

### 2.6 Removing Habit from the codebase

Anywhere the codebase has special handling for `type = 'habit'`, remove it:

- Sidebar Habit-specific group (replaced by dynamic grouping)
- Habit type option in any picker
- Habit-specific UI labels or icons
- Habit-specific computation logic (if any was added during Wave 4a)

If Wave 4a included Habit-specific files (e.g., `habit-streak-display.tsx`), delete them. Don't leave dead code.

The Project entity's type field accepts "habit" as a string if a user manually creates a project with that custom type — that's their choice. But the system doesn't treat it specially.

### 2.7 Audit log additions

New audit actions:

- `project_type_changed` — when user changes a project's type (already exists from Wave 4a; still relevant)
- `project_type_migrated` — one-time migration from habit to goal (system action)

### 2.8 Locale respect

All date displays (target dates, last activity timestamps) use the Locale formatter from Wave 4a. No hardcoded date formats.

Time distance phrases ("3 days ago", "5 months away") use English natural language for v1. Localizing distance phrases is Phase 2.

---

## 3. tRPC procedures

Modify existing:

```typescript
projects.create({ name, type, folder_id?, ... })
  // type: free-form string, validated, lowercased before storage

projects.update({ id, type?, ... })
  // type: same validation as create

projects.byId({ id }) → Project & {
  metrics: {
    task_counts: {
      total: number
      active: number
      completed: number
    }
    target_date?: Date  // already on Project
    days_to_target?: number  // negative if passed
    last_activity_at: Date | null  // null if no activity in past 30 days
  }
}

projects.list({ type? })
  // type filter accepts any string; returns matching projects
```

Add:

```typescript
projects.distinctTypes() → { type: string, count: number }[]
  // Returns all types the user has used, with counts
  // Used by sidebar grouping and filter pills
```

---

## 4. File changes

```
/atlas
  /app
    /(app)
      /tasks
        /projects/page.tsx                  (filter pills row)
  /components
    /projects
      project-type-picker.tsx               (UPDATED: curated + custom)
      custom-type-dialog.tsx                (NEW)
      project-type-filter-pills.tsx         (NEW: dynamic pills with overflow)
      project-header-metrics.tsx            (NEW: task counts + dates)
    /sidebar
      projects-by-type.tsx                  (UPDATED: dynamic grouping)
  /core
    /projects
      type-validation.ts                    (NEW: validate, normalize, capitalize)
      metrics.ts                            (NEW: compute task_counts, last_activity)
      type-suggestions.ts                   (NEW: curated + adaptive logic)
      time-distance.ts                      (NEW: "3 days ago", "5 months away")
      migration.ts                          (NEW: one-time habit → goal)
  /server
    /routers
      projects.ts                           (extend list, byId; add distinctTypes)
```

Files to remove (if they exist from Wave 4a):
- Any Habit-specific component files
- Any Habit-specific computation (streak, monthly count, etc.)

---

## 5. Verification

### Type system rework
1. Schema: Project.type is now free-form string (no DB-level enum/check constraint)
2. Application validates: 1-32 chars, alphanumeric + spaces + hyphens, lowercased before storage
3. Migration ran: any existing `type = 'habit'` projects are now `type = 'goal'`
4. Audit log shows `project_type_migrated` entry for each migrated project

### Sidebar grouping
5. Sidebar groups projects dynamically by type
6. Each group shows count
7. Empty types don't render (no "Habits (0)")
8. Group order: most-used type first, then alphabetical
9. Group collapse state persists per type
10. New user with zero projects: existing empty state

### Type picker
11. Click + button → picker opens
12. Standard section: Project (default), Goal
13. Curated section: Travel, Learning, Health, Reading
14. Custom type option at bottom
15. Click "Custom type..." → dialog opens
16. Enter "Vacation" → creates project with type='vacation', new section in sidebar
17. Enter "VACATION" → stored lowercased; same as existing 'vacation' type if one exists
18. Enter type with special chars (e.g., "Work/Personal") → rejected with clear error
19. After using "Travel" 2+ times, it appears prominently in future pickers

### Filter pills
20. Open `/tasks/projects` → see filter pills row
21. "All" is active by default; all projects shown
22. Pills show count (e.g., "Goals 2")
23. Click "Goals" → filter applied; URL becomes `?type=goal`
24. Active pill visually distinct (filled style)
25. With 4+ types, "More ▼" dropdown appears with overflow types
26. Click a type from More dropdown → temporarily replaces least-used pill
27. URL state survives refresh
28. Browser back navigates between filter states
29. Empty state per filter: "No [type] projects yet"

### Project header metrics
30. Open any project → see metadata row beneath title
31. Format: `N tasks total · M active · K completed`
32. NO percentage anywhere
33. NO progress bar
34. Target date (if set): formatted via Locale + natural time distance
35. Past target date with active project: "passed N days ago"
36. No target date: Target line omitted entirely
37. Recent activity: "Last activity: today/yesterday/N days ago"
38. No activity in 30+ days: Last activity line omitted
39. Project with zero tasks: "No tasks yet"
40. Same metrics format for ALL types (Project, Goal, Travel, etc.)

### Habit removal
41. No "Habit" appears anywhere in standard UI (pickers, sidebar groups, filters)
42. Existing habit-related component files removed from codebase
43. No habit-specific computation runs anywhere
44. If user manually creates project with custom type "habit" or "habits", it's stored as that string but treated identically to any other type

### Locale respect
45. Change Locale to United States → target dates reformat throughout
46. Number formatting in task counts respects locale (e.g., "1,234 tasks" or "1.234")

### Backwards compatibility
47. Existing tasks within migrated projects still work
48. Existing notes, references, links to migrated projects still resolve correctly
49. No regression in any task functionality
50. No regression in folder hierarchy
51. No regression in Wave 4a Notes module functionality

When all 51 verification steps pass, the CR is complete.

---

## 6. Rules of engagement

### 6.1 Open type system, no system-imposed type semantics

The Type field is a user-defined label. The system stores it, groups by it, filters by it, and displays it. The system does NOT:

- Add type-specific behavior (no "Habits get X, Goals get Y")
- Add type-specific UI variations (no different headers per type)
- Validate that a type is "real" (any 1-32 char alphanumeric string is valid)
- Suggest that a type is "wrong" (no "this should probably be a Goal")

The user shapes the initiative through what they put inside it. Type is just a label for organization.

### 6.2 No gamification, ever

Same line as before: facts, not interpretations.

If you find yourself implementing anything that:
- Computes a percentage of completion based on tasks
- Shows a streak counter
- Displays "you're on track" / "behind" messaging
- Adds emoji indicators of progress quality
- Implements a weekly frequency target
- Generates motivational copy

Stop. That's not in this CR.

The exception coming in Wave 4c: tracker tables can show percentages because the user explicitly defines the metric by building the table. But that's Wave 4c. For this CR, no percentages anywhere.

### 6.3 Migration must be safe

The Habit → Goal migration is the highest-risk piece. Verify:

1. Read all projects with `type = 'habit'`
2. Update each to `type = 'goal'`
3. Write audit log entry per change
4. No tasks, notes, or references break

If any project has unusual state (deleted, archived, etc.), include it in the migration audit but skip the type change if it would cause issues.

### 6.4 Filter pills are filter pills, not tabs

URL stays at `/tasks/projects` with query param. Don't restructure routing into `/tasks/projects/goals` or similar.

### 6.5 Custom type entry is forgiving but bounded

Accept reasonable input. Lowercase before storing. Trim whitespace. Limit to 32 chars. Reject characters that would break URL slugs or display weirdly.

If a user enters a type that exactly matches an existing one (case-insensitive), use the existing one — don't create a duplicate. This prevents "Travel" and "travel" both existing as separate types from a single user.

### 6.6 Type display capitalizes the first letter

Stored: `"goal"`, `"travel"`, `"hobby project"`
Displayed: `"Goal"`, `"Travel"`, `"Hobby Project"`

Use a simple title-case helper. Multi-word types get each word capitalized.

### 6.7 No new schema beyond what's specified

The Type field changes from constrained to free-form. That's the only schema change. Don't add:

- A separate Types table (over-engineering for v1)
- Type-specific configuration storage
- Templates table (Phase 2)

If you find yourself wanting these, stop — they're future concerns.

---

## 7. What is NOT in this CR

**Wave 4c territory:**
- Tracker table integration (percentage display when a table is designated as the tracker)
- Type-based templates (creating a "Travel" project pre-suggests itinerary table, packing list note, etc.)
- Unified Project view aggregating notes, tasks, tables, calendar, journal entries

**Phase 2 territory:**
- Type management UI (rename, merge, delete types — like Tag/Context management)
- Type icons or colors (per-type visual customization)
- User-customizable curated suggestions list
- Type usage analytics / suggestions ("you have 3 different types for vacation-like projects; want to merge?")

**Permanently excluded:**
- Streak counters (any kind)
- Percentage of completion based on task count
- Frequency targets ("3/7 days this week")
- Motivational messaging
- Type-imposed behavior beyond grouping/filtering

If you find yourself building any of these, stop.

---

## 8. Recommended Build Sequence

1. **Type validation utility** — normalize, validate, lowercase, capitalize for display
2. **Schema migration** — drop type constraint, run habit → goal migration
3. **Time distance formatter** — "today", "3 days ago", "5 months away", etc.
4. **Project metrics computation** — extend `projects.byId` with metrics object
5. **Sidebar dynamic grouping** — query distinct types, render groups dynamically
6. **Type picker rework** — curated + custom + adaptive suggestions
7. **Custom type dialog** — inline creation flow
8. **Filter pills component** — with overflow dropdown for many types
9. **All Projects page integration** — wire pills to URL state and list query
10. **Project header metrics component** — render task counts + dates
11. **Codebase cleanup** — remove Habit-specific files and code paths
12. **Verification** — all 51 steps

---

## 9. Final note

This CR completes the project Type story. The taxonomy becomes flexible enough to match how people actually organize their initiatives, without inviting the gamification trap that distinct Habit types would have created.

The deliberate constraints — no streaks, no percentages, no type-specific behavior beyond labeling — are what make this useful rather than another productivity tool optimizing for engagement metrics.

Type-based templates are a deliberate Phase 2 deferral. When you've used the system for several months and noticed which types you actually use, designing templates that fit your real patterns will be a small Phase 2 wave. Doing it now would be premature.

Begin with section 8, step 1.
