# Atlas CR — Mobile Capture Optimization

## Read this entire CR before taking any action.

---

## 1. Overview

The mobile interface (`/m`) currently provides task list, task detail, and settings — a thin slice. Capture, the most important mobile use case for productivity tools, currently reuses the desktop `CaptureModal` and the desktop `CommandPalette` for search. Both are keyboard-first surfaces that don't fit touch-driven phones.

This CR optimizes mobile around its actual primary use case: **capture and triage on the go**. Heavy editing, multi-pane work, and complex modules remain desktop-only — that's the deliberate "minimal mobile" philosophy. What ships in this CR makes mobile genuinely good for the use case it's meant to serve.

**The work:**

1. **Mobile-native capture sheet** — full-screen, touch-first capture replacing the desktop modal on `/m`
2. **Mobile-native search** — touch-first search replacing CommandPalette on `/m`
3. **`/m/captures` route** — captures inbox with mobile-adapted processing mode
4. **Mobile task perspectives expansion** — Tomorrow, Forecast, Someday, Waiting For, Completed accessible from `/m/tasks`
5. **Mobile task detail enhancements** — defer date, someday flag, waiting-for, follow-up date, parse-source badge visible
6. **"Switch to desktop" graceful affordances** — for features that are desktop-only (Tables, Notes editing, Project setup, Vault, etc.)

**Out of scope (deferred to future mobile advancements):**

- Mobile People interface (separate CR after Wave 5a-ii fully shipped)
- QR / business card scanning (separate CR)
- Mobile Notes editing beyond read-only viewing
- Mobile Tables (defer entirely)
- Mobile Calendar (Wave 6a desktop-first; mobile follows later)
- Mobile Journals (Wave 7 hasn't shipped)
- Photo-based event capture
- Mobile project creation/editing (use desktop)

**Pre-requisites:**

- GTD Inbox CR shipped (Captures with state lifecycle, processing dispositions)
- Wave 4 Refinement shipped (error handling, attachment infrastructure)
- The existing `/m` shell (`MobileTopBar`, `BottomTabBar`, middleware-based detection) is in place
- Stratum tokens are clean (Stratum Compliance Round 2 shipped)

**Estimated scope:** 3-4 weeks of focused work.

**Severity:** Medium-high. Approaching F&F production. Mobile is where most of capture happens (commutes, meetings, while walking around). Current capture UX on mobile is keyboard-first and doesn't fit. Without this CR, mobile feels half-finished.

---

## 2. Mobile design philosophy

### 2.1 Minimal mobile, deliberately

Atlas's mobile philosophy is: capture, triage, reference. Not heavy editing. Not multi-pane work. Not full feature parity.

This means:
- Capture must be excellent — fast, touch-first, low-friction
- Triage (processing captures, marking tasks done, deferring) must be excellent
- Reference (viewing tasks, projects, notes) must be acceptable
- Editing beyond simple changes redirects to desktop

When in doubt, do less on mobile. The escape hatch is "Switch to desktop" — it's there for a reason.

### 2.2 Touch-first, not keyboard-first

Every mobile UI element this CR introduces assumes:
- Primary interaction is finger taps, not keyboard
- Tap targets are 44px minimum (existing convention)
- No keyboard shortcuts (those are desktop-only)
- Common actions are accessible without precise positioning
- Swipe gestures used where they fit naturally

### 2.3 Bottom sheets over modals

Modal dialogs that pop in the middle of the screen are awkward on mobile (block the topbar, hard to dismiss with one hand on large phones). Bottom sheets are the right pattern:
- Slide up from bottom
- Drag-to-dismiss handle at top
- Cover only the bottom 50-90% of viewport
- Easy to reach with thumb

Use bottom sheets for: capture, search, filter pickers, action menus, processing mode.

### 2.4 Safe area awareness

Modern phones have notches, home indicators, dynamic islands. Every full-screen surface respects:
- `safe-area-inset-top` for content under notches
- `safe-area-inset-bottom` for content above home indicators
- Existing `BottomTabBar` already does this; new components must too

---

## 3. Detailed deliverables

### 3.1 Mobile-native capture sheet

#### 3.1.1 Replace desktop CaptureModal usage on `/m`

The `MobileTopBar`'s `+` button currently opens `CaptureModal` (the desktop modal). Replace with `MobileCaptureSheet` — a bottom sheet optimized for touch and one-handed use.

Detect platform context:
- On `/m/*` routes → use `MobileCaptureSheet`
- On desktop routes → continue using `CaptureModal`
- The existing capture API (tRPC procedure) is shared; only the UI differs

#### 3.1.2 Layout

```
+---------------------------------------+
|                                       |  ← top of screen
|         (page content visible)        |
|                                       |
|                                       |
+=======================================+  ← sheet starts (60% from top)
|                                       |
|     Drag handle ━━━                    |
|                                       |
|  Capture                              |
|                                       |
|  [Multi-line input, autofocus]        |
|                                       |
|  ┌─────────────────────────────────┐  |
|  │                                 │  |
|  │  Type or speak something...     │  |
|  │                                 │  |
|  └─────────────────────────────────┘  |
|                                       |
|  🎤 Voice    📎 Attach   📷 Photo     |
|                                       |
|                       [Cancel] [Save] |
|                                       |
+---------------------------------------+
```

Specifications:
- Sheet covers ~60% of viewport when keyboard is closed
- Expands to ~85% when keyboard opens (input field stays above keyboard)
- Drag handle at top — drag down to dismiss
- Tap outside sheet area → confirm before dismissing if input has content
- Input is `<textarea>` with autosize, max ~10 lines visible (scrolls within if longer)
- Save button is large (44px+ height), prominent placement
- Cancel button is left-of-Save, less prominent

#### 3.1.3 Voice capture

The `🎤 Voice` button opens device speech-to-text:
- Uses Web Speech API (`SpeechRecognition`) on supported browsers
- Falls back to "Tap to speak" overlay that delegates to OS-native voice keyboard if Web Speech unavailable
- Live transcription appears in input as user speaks
- Tap to stop recording

**Implementation note:** Web Speech API support varies. iOS Safari supports it (with permission). Android Chrome supports it. Other browsers vary. If unsupported, hide the button entirely rather than showing a broken state.

#### 3.1.4 Attachment buttons

`📎 Attach` opens device file picker (`<input type="file">`)
- Selected files upload to R2 immediately (existing attachment infrastructure)
- Attachments display as small chips in the sheet
- Limit 5 attachments per capture (mobile users shouldn't be uploading hundreds)

`📷 Photo` opens device camera (`<input type="file" accept="image/*" capture="environment">`)
- iOS/Android both support this attribute
- Photo taken → uploads as attachment
- Doesn't run AI vision extraction (that's the future People scanning CR; this just attaches the photo)

#### 3.1.5 Save behavior

Save creates a Capture with the input text:
- Same tRPC procedure as desktop (`capture.create`)
- Capture state begins `raw`, transitions to `proposed` after Tier 1 parsing completes (Wave 3c infrastructure)
- Sheet dismisses with success toast: "Captured to inbox"
- Toast has "View" action navigating to `/m/captures`

If save fails:
- Sheet stays open
- Error toast with friendly message (matching Wave 4 Refinement error handling standards)
- Input content preserved so user doesn't lose their text

#### 3.1.6 Sheet dismissal patterns

Three ways to dismiss:
1. **Cancel button** — confirm if input has content; otherwise close immediately
2. **Drag down on handle** — same confirmation logic
3. **Tap outside sheet** — same confirmation logic

Confirmation dialog when discarding non-empty input:
```
Discard capture?
You have unsaved text.

[Cancel]  [Discard]
```

This prevents accidental data loss when user fat-fingers an outside tap.

### 3.2 Mobile-native search

#### 3.2.1 Replace CommandPalette usage on `/m`

The `MobileTopBar`'s search button currently opens `CommandPalette` (desktop, keyboard-first via cmdk). Replace with `MobileSearchSheet`.

Same context detection pattern:
- On `/m/*` routes → `MobileSearchSheet`
- On desktop routes → continue using `CommandPalette`

#### 3.2.2 Layout

```
+---------------------------------------+
|  ← Search                             |  ← sticky header with back button
|  ┌─────────────────────────────────┐  |
|  │ 🔍  Search...                   │  |
|  └─────────────────────────────────┘  |
|                                       |
|  RECENT                               |
|  • Q2 OKRs                            |
|  • Devsinc partnership                |
|  • Half marathon training             |
|                                       |
|  TASKS (3)                             |
|  • Call dentist tomorrow              |
|  • Review Q2 budget                   |
|  • Schedule offsite                   |
|                                       |
|  NOTES (1)                             |
|  • Q2 Strategy Brief                  |
|                                       |
|  PROJECTS (2)                          |
|  • Q2 Strategic Planning              |
|  • Atlas product launch               |
|                                       |
+---------------------------------------+
```

Specifications:
- Full-screen overlay (not a sheet — search needs all available space)
- Sticky header with back arrow (returns to previous mobile view) and input
- Input is autofocused on mount; on-screen keyboard appears
- Recent searches shown when input is empty
- Results grouped by entity type (Tasks, Notes, Projects, Captures, Tags)
- Tap a result → navigates to that entity's mobile detail view

#### 3.2.3 Search behavior

- Debounced query (200ms) to avoid hammering server while user types
- Uses existing `search` tRPC router
- Returns same results as desktop search (full-text search via Postgres triggers)
- Limit to ~5 results per category (don't overwhelm small screens; show "View all" if more)

#### 3.2.4 Result tap handling

Each result type navigates to:
- Task → `/m/tasks/[taskId]`
- Note → "Switch to desktop" prompt (mobile doesn't have full notes view yet)
- Project → "Switch to desktop" prompt
- Capture → `/m/captures` with that capture pre-selected (for processing)
- Tag → `/m/tasks?tag=...` (filtered task view)

The "Switch to desktop" prompt is described in section 3.5.

### 3.3 `/m/captures` — captures inbox + processing mode

#### 3.3.1 Routes

- `/m/captures` — list view of unprocessed Captures
- `/m/captures/process` — focused processing mode (single capture at a time)

#### 3.3.2 List view layout

```
+---------------------------------------+
|  Captures                          ⚙   |
|                                       |
|  8 captures to process                |
|                                       |
|  [Process all →]                       |
|                                       |
|  ───────                              |
|                                       |
|  ┌─────────────────────────────────┐  |
|  │ Call dentist about cleaning     │  |
|  │ 2h ago · Looks like a task      │  |
|  └─────────────────────────────────┘  |
|                                       |
|  ┌─────────────────────────────────┐  |
|  │ Idea: weekly team lunch could   │  |
|  │ improve morale                  │  |
|  │ 5h ago · Looks like a note      │  |
|  └─────────────────────────────────┘  |
|                                       |
|  ┌─────────────────────────────────┐  |
|  │ Buy birthday gift for Hassan    │  |
|  │ 18h ago · Looks like a task     │  |
|  └─────────────────────────────────┘  |
|                                       |
+---------------------------------------+
|  Tasks   Captures   Notes   Settings  |  ← bottom tab bar
+---------------------------------------+
```

Each capture card shows:
- Raw text (truncated to ~3 lines with ellipsis if longer)
- Time captured (relative: "2h ago", "yesterday", "3 days ago")
- Parser proposal (e.g., "Looks like a task", "Looks like a note") — informational hint, lowered emphasis
- Tap card → enters processing mode focused on this capture

The "Process all" button enters processing mode starting from the oldest capture.

#### 3.3.3 Processing mode

Mobile processing differs significantly from desktop. No keyboard shortcuts. Larger touch targets. Swipe gestures.

Layout:

```
+---------------------------------------+
|  ← Cancel                       2/8   |  ← progress indicator
|                                       |
|                                       |
|  "Call dentist about cleaning         |
|   appointment"                        |
|                                       |
|  Captured 2 hours ago                 |
|                                       |
|  Parser suggests: Task                |
|  Detected: phone-call context         |
|                                       |
|  ─────                                |
|                                       |
|     Make it a:                        |
|                                       |
|     ┌──────────┐ ┌──────────┐         |
|     │   📋     │ │   📝     │         |
|     │  Task    │ │  Note    │         |
|     └──────────┘ └──────────┘         |
|                                       |
|     ┌──────────┐ ┌──────────┐         |
|     │   📁     │ │   ⏳     │         |
|     │ Project  │ │ Someday  │         |
|     └──────────┘ └──────────┘         |
|                                       |
|     ┌──────────┐ ┌──────────┐         |
|     │   👤     │ │   ✓      │         |
|     │ Waiting  │ │ Did it   │         |
|     │   For    │ │ (2 min)  │         |
|     └──────────┘ └──────────┘         |
|                                       |
|     ┌──────────┐                       |
|     │   🗑      │                       |
|     │  Trash   │                       |
|     └──────────┘                       |
|                                       |
|                                       |
|  [Skip →]                              |  ← move to next without deciding
|                                       |
+---------------------------------------+
```

Disposition buttons are large grid tiles (each ~120x80px), arranged in 2-column grid.

#### 3.3.4 Disposition flows on mobile

When user taps a disposition tile, an inline editing sheet appears:

**Task disposition:**
```
+---------------------------------------+
|  Make it a task                       |
|                                       |
|  Title:                               |
|  [Call dentist about cleaning_____]    |
|                                       |
|  Project:                             |
|  [— None — ▼]                          |
|                                       |
|  Context:                             |
|  [Phone ▼]                             |
|                                       |
|  Due:                                 |
|  [tomorrow ▼]                          |
|                                       |
|  ─────                                |
|                                       |
|  [Cancel]              [Save & next]  |
+---------------------------------------+
```

Fields are pre-filled from parser proposal. User can edit each. Pickers (Project, Context, Due date) open as nested bottom sheets.

The other disposition forms (Note, Project, Someday, Waiting For, 2-minute, Trash) follow the same pattern — pre-filled forms in bottom sheets with simplified field sets adapted to mobile.

**2-minute "Did it" is the simplest:**
```
Mark complete?
"Call dentist about cleaning appointment"

[Cancel]  [Confirm and next]
```

One tap to confirm; capture becomes a completed Task.

**Trash** is also single-tap confirm.

#### 3.3.5 Swipe gestures

Optional but valuable for power users:
- **Swipe left on capture card** in list view → quick disposition menu (slide-out with Task/Trash icons)
- **Swipe right on capture card** → expand to processing mode
- **Swipe down** in processing mode → skip to next capture
- **Swipe up** in processing mode → return to previous capture

These match common mobile app patterns. Don't make them required — buttons are always available.

#### 3.3.6 Undo

After confirming a disposition, a brief snackbar appears:
```
Capture processed.
[Undo]
```

Snackbar persists for 5 seconds. Tap "Undo" reverses the disposition (same logic as desktop GTD Inbox CR's undo).

After 5 seconds, undo is no longer available for that capture.

#### 3.3.7 Bottom tab bar update

Current bottom tabs are: Tasks, Notes, Calendar, Journals, Settings (per README).

Replace with: **Tasks, Captures, Notes, Settings** (drop Calendar and Journals — they're stubs anyway, not actively used). Captures becomes a primary mobile destination.

When Wave 6a Calendar ships and gets mobile parity, Calendar can return. For now, Captures earns the slot.

A small badge on the Captures tab shows the unprocessed count (8, 12, etc.).

### 3.4 Mobile task perspectives expansion

#### 3.4.1 Current state

`/m/tasks` shows Inbox / Today / Flagged chip filter. That's only 3 of the 8 desktop perspectives.

#### 3.4.2 Expanded chip filter

```
+---------------------------------------+
|  Tasks                            ⚙    |
|                                       |
|  ┌────────────────────────────────┐   |
|  │  Today (5) · Tomorrow (6) ·    │   |
|  │  Forecast · Inbox (8) ·         │   |
|  │  Flagged (3) · Someday ·       │   |
|  │  Waiting For (5) · Completed   │   |
|  └────────────────────────────────┘   |
|                                       |
|  ↑ horizontally scrollable            |
|                                       |
+---------------------------------------+
```

Chip filter is horizontally scrollable to fit all perspectives. Counts shown in parentheses where meaningful.

#### 3.4.3 Each perspective on mobile

- **Today**: tasks due today + flagged tasks (default landing for /m/tasks)
- **Tomorrow**: tasks due tomorrow
- **Forecast**: paginated list grouped by date (this week, then next week)
- **Inbox**: shows tasks in Inbox project + non-processed Captures (mixed view, with visual distinction)
- **Flagged**: flagged tasks regardless of project
- **Someday**: `is_someday = true` tasks
- **Waiting For**: tasks with `delegated_to_*` set, sorted by follow-up date
- **Completed**: tasks completed in past 30 days (older requires desktop)

For perspectives with many tasks (Forecast, Completed), implement pagination ("Load more" at bottom). Don't auto-infinite-scroll — keeps users oriented.

#### 3.4.4 Task list item enhancements

Current task list rows show: title, project (if any), due date.

Add (compact, only when relevant):
- Flagged indicator (small flag icon)
- Context (small chip)
- Tags (small chips, max 2 visible, "+N" if more)
- Defer indicator (subtle icon if deferred)
- Waiting-for indicator (clock + person icon if delegated)
- Parse-source badge (faint AI/local indicator)

Don't overwhelm. Show only what fits comfortably. Tapping the row goes to detail for full info.

### 3.5 Mobile task detail enhancements

#### 3.5.1 Current state

`/m/tasks/[taskId]` shows: title, notes, metadata rows, complete/reopen, contexts, tags.

#### 3.5.2 Add missing GTD fields

The current detail view is missing fields that are now part of the data model:

- **Defer date** — show with "Deferred until [date]" label and edit affordance
- **Someday flag** — toggle with "Someday/Maybe" label
- **Waiting For info** — when delegated, show "Waiting for [person] · Follow up [date]" with edit affordance
- **Estimated minutes** — show as compact label
- **Recurrence** — show recurrence rule in human-readable form ("Repeats every Tuesday") with edit affordance
- **Parse-source badge** — small indicator showing whether task originated from AI parse or local parse, with confidence score

#### 3.5.3 Edit interactions on mobile

For each editable field, tapping opens a bottom sheet picker:
- Date fields → calendar picker bottom sheet
- Project field → project picker (search + list)
- Context field → context picker
- Tags field → tag picker (multi-select)
- Person field (waiting for) → person picker (search People + free text fallback)
- Boolean fields (someday, flagged) → inline toggle, no sheet needed

#### 3.5.4 Quick actions row

At the top of detail view, prominent action buttons:

```
+---------------------------------------+
|  ← Back                       ⋯ More  |
|                                       |
|  Call dentist about cleaning          |
|                                       |
|  ┌───────┐ ┌───────┐ ┌───────┐         |
|  │   ✓    │ │   🚩  │ │  📋   │         |
|  │ Done   │ │ Flag  │ │ Edit  │         |
|  └───────┘ └───────┘ └───────┘         |
|                                       |
|  ─────                                |
|  ...
```

Tap "Done" → marks complete, returns to list (with undo snackbar).
Tap "Flag" → toggles flag.
Tap "Edit" → opens edit form (existing functionality).

### 3.6 "Switch to desktop" graceful affordances

#### 3.6.1 The pattern

When a user navigates to a mobile route that doesn't have full mobile support, show a "this is desktop-only" page rather than a broken or stubbed UI:

```
+---------------------------------------+
|  Tables                               |
|                                       |
|       📊                              |
|                                       |
|  Tables on mobile is read-only        |
|                                       |
|  Open in desktop to create or edit    |
|  table data.                          |
|                                       |
|  ─────                                |
|                                       |
|  Your tables:                         |
|  • Cash Register (10 rows)            |
|  • Books to read (5 rows)             |
|  • Subscriptions (5 rows)             |
|  • Q2 deliverables (6 rows)           |
|                                       |
|  ─────                                |
|                                       |
|  [Switch to desktop site]             |
|                                       |
+---------------------------------------+
```

Tap "Switch to desktop site" → sets `prefer-desktop` cookie, reloads to desktop version of the same URL.

#### 3.6.2 Routes that need this treatment

When user navigates to:
- `/m/tables/*` (or any tables URL on mobile) → desktop-only message + read-only summary list
- `/m/notes/[noteId]` for any operation beyond viewing → "Open in desktop to edit"
- `/m/projects/[projectId]/edit` → "Open in desktop to set up project details"
- `/m/vault` → "Vault is desktop-only"
- `/m/admin/*` → 404 (admin is hidden, doesn't get a friendly message)
- `/m/usage` → "Open in desktop to view AI usage charts"
- `/m/people/*` → "People on mobile coming soon" (until CR 2 ships)

#### 3.6.3 Notes on mobile (read-only baseline)

`/m/notes` doesn't get full editing in this CR (deferred to future advancement). But it CAN be enhanced beyond the current "coming soon" stub to:

- List notes with title, purpose, last-updated date
- Tap note → read-only viewer rendering TipTap content
- Search within notes
- "Edit in desktop" affordance prominent

This is light work and gives mobile users useful reference access without committing to mobile editing.

If scope is tight, this can be deferred — but it's small enough (1-2 days) to fit.

### 3.7 Polish details

#### 3.7.1 Pull-to-refresh

Lists should support pull-to-refresh:
- `/m/captures` — refresh capture list
- `/m/tasks` — refresh current perspective
- `/m/people` (when CR 2 ships) — refresh people list

Use a standard pull-to-refresh implementation (libraries available, or implement with touch handlers).

#### 3.7.2 Keyboard handling

When virtual keyboard opens:
- Input fields should auto-scroll into view if they'd be covered
- Bottom sheets should expand to give input room
- Bottom tab bar should hide when keyboard is open (otherwise it covers input)

#### 3.7.3 Loading states

- Lists show skeleton placeholders while loading (don't show empty state during loading)
- Detail views show skeleton shapes for known field positions
- Sheets show subtle progress indicator if operation takes >500ms

#### 3.7.4 Offline handling

If network drops:
- Toast: "You're offline. Changes will sync when reconnected."
- Captures created while offline → queue locally, sync when network returns
- Existing data continues to display from cache
- Edit operations show error: "Couldn't save while offline"

This requires service worker integration. If that's out of scope, simpler fallback: show "No connection" message and disable mutations.

For this CR, I'd recommend the simpler fallback. Service worker integration is its own concern.

---

## 4. tRPC procedures

No new procedures needed. All mobile flows reuse existing tRPC routers:
- `capture.*` for capture creation and listing
- `tasks.*` for task perspectives and operations
- `search.*` for search
- Capture processing dispositions use existing GTD Inbox endpoints

If anything is missing, surface it before implementing — better to add small tRPC additions than to build mobile-specific server logic that diverges from desktop.

---

## 5. File changes

```
/atlas
  /src
    /app
      /(app)
        /m
          /captures
            /page.tsx                    (NEW: mobile captures list)
            /process/page.tsx            (NEW: mobile processing mode)
          /tasks
            /page.tsx                    (UPDATED: expanded perspectives)
            /[taskId]/page.tsx           (UPDATED: full GTD fields)
          /notes
            /page.tsx                    (UPDATED: list + read-only viewer)
            /[noteId]/page.tsx           (NEW: read-only note viewer)
          /tables/page.tsx               (UPDATED: desktop-only message + summary list)
          /vault/page.tsx                (NEW: desktop-only message)
          /usage/page.tsx                (NEW: desktop-only message)
          /people/page.tsx               (NEW: "coming soon" until CR 2)
          /layout.tsx                    (UPDATED: bottom tab bar — Tasks/Captures/Notes/Settings)
    /components
      /mobile
        capture-sheet.tsx                (NEW: mobile-native capture sheet)
        search-sheet.tsx                 (NEW: mobile-native search overlay)
        capture-list-card.tsx            (NEW: mobile capture row)
        capture-process-card.tsx         (NEW: mobile processing card)
        capture-disposition-tile.tsx     (NEW: large grid tile)
        capture-disposition-sheet.tsx    (NEW: bottom sheet for disposition forms)
        task-perspective-chips.tsx       (UPDATED: expanded perspectives)
        task-list-row.tsx                (UPDATED: more compact metadata)
        task-detail-quick-actions.tsx    (NEW: Done/Flag/Edit buttons)
        task-detail-fields.tsx           (UPDATED: defer/someday/waiting-for fields)
        date-picker-sheet.tsx            (NEW: mobile date picker as bottom sheet)
        project-picker-sheet.tsx         (NEW)
        context-picker-sheet.tsx         (NEW)
        tag-picker-sheet.tsx             (NEW)
        desktop-only-page.tsx            (NEW: reusable "switch to desktop" UI)
        switch-to-desktop-button.tsx     (NEW: button that sets prefer-desktop cookie)
        pull-to-refresh.tsx              (NEW: shared pull-to-refresh wrapper)
      /shell
        mobile-top-bar.tsx               (UPDATED: capture button uses sheet, search button uses sheet)
        bottom-tab-bar.tsx               (UPDATED: tabs are Tasks/Captures/Notes/Settings)
    /lib
      /mobile
        sheet-helpers.ts                 (NEW: shared sheet animation/dismissal logic)
        keyboard-aware.ts                (NEW: handle virtual keyboard expansion)
```

The exact file paths may differ. Adapt to actual project structure.

---

## 6. Verification

### Mobile-native capture sheet
1. Open `/m/tasks` on a mobile device or mobile-emulated browser
2. Tap `+` button in top bar → bottom sheet slides up from bottom (not desktop modal)
3. Sheet covers ~60% of viewport
4. Input is autofocused; on-screen keyboard appears
5. Sheet expands when keyboard opens (input stays visible)
6. Type some text → save button enables
7. Tap save → capture created, sheet dismisses, success toast appears
8. Toast "View" action navigates to `/m/captures`
9. Drag handle down → confirmation if input non-empty; else dismisses
10. Tap outside sheet → same dismissal logic
11. Cancel button → same dismissal logic
12. Voice button (if browser supports Web Speech) → starts transcription on tap; hidden if unsupported
13. Photo button → opens camera with environment-facing camera selected
14. Attach button → opens file picker; selected file uploads as attachment
15. Up to 5 attachments allowed; 6th attempt shows error

### Mobile-native search
16. Tap search button in top bar → full-screen search overlay (not desktop CommandPalette)
17. Input autofocused
18. Type query → debounced (200ms) search request fires
19. Results grouped by entity type (Tasks, Notes, Projects, Captures, Tags)
20. Each group capped at ~5 results
21. Tap task result → navigates to `/m/tasks/[id]`
22. Tap note result → "switch to desktop" prompt (note doesn't have full mobile view)
23. Tap project result → "switch to desktop" prompt
24. Tap capture result → navigates to `/m/captures` with that capture pre-selected
25. Tap tag result → `/m/tasks?tag=...` (filtered task view)
26. Back arrow returns to previous mobile route

### Captures inbox
27. Navigate to `/m/captures` → list of unprocessed Captures shown
28. Each card shows raw text, time captured, parser hint
29. Long text truncates to ~3 lines with ellipsis
30. Bottom tab bar shows badge with unprocessed count
31. Pull-to-refresh updates list
32. Empty state shows when no captures

### Processing mode
33. Tap a capture card → enters processing mode
34. Or tap "Process all →" → enters processing mode at oldest capture
35. Processing mode shows: progress (1/8), capture text, parser hint, 7 disposition tiles
36. Tiles are large (120x80px+) and tappable
37. Tap "Task" tile → bottom sheet opens with pre-filled task form
38. Edit fields, tap "Save & next" → task created, advances to next capture
39. Tap "Note" → similar flow with note form
40. Tap "Project" → project picker, then form
41. Tap "Someday" → confirmation, marks task as someday
42. Tap "Waiting For" → person picker (free text), follow-up date
43. Tap "Did it (2 min)" → simple confirm, creates completed task
44. Tap "Trash" → confirms, captures marked trashed
45. Tap "Skip →" → moves to next without deciding
46. Cancel button exits processing mode, returns to list
47. Each disposition shows undo snackbar for 5 seconds
48. Undo within 5s reverses the disposition

### Swipe gestures (optional, verify if implemented)
49. Swipe left on capture card → quick disposition menu
50. Swipe right on card → expands to processing
51. Swipe down in processing → next capture
52. Swipe up in processing → previous capture

### Bottom tab bar
53. Bottom tabs are: Tasks, Captures, Notes, Settings (Calendar and Journals removed)
54. Captures tab shows badge with unprocessed count when >0
55. Active tab highlighted
56. Tab tap navigates immediately

### Task perspectives expansion
57. `/m/tasks` shows horizontally scrollable chip filter
58. Chips: Today, Tomorrow, Forecast, Inbox, Flagged, Someday, Waiting For, Completed
59. Counts in parens where applicable
60. Tap each perspective → list filters to show those tasks
61. Today is default landing
62. Forecast shows tasks grouped by date with pagination

### Task list item
63. Each row shows title, project (if any), due date
64. Flagged indicator visible if flagged
65. Context chip visible if assigned
66. Tag chips visible (max 2, +N if more)
67. Defer indicator if deferred
68. Waiting-for indicator if delegated
69. Tap row → detail view

### Task detail enhancements
70. Detail shows: title, notes, project, contexts, tags
71. Defer date shown with "Deferred until [date]" if set
72. Someday toggle if applicable
73. Waiting For info if delegated
74. Estimated minutes shown if set
75. Recurrence shown in human-readable form
76. Parse-source badge visible
77. Quick actions row: Done / Flag / Edit
78. Tap Done → marks complete, returns to list, undo snackbar
79. Tap Flag → toggles flag immediately
80. Tap Edit → opens edit form
81. Each editable field opens bottom sheet picker
82. Date picker, project picker, context picker, tag picker all work as bottom sheets

### Desktop-only graceful affordances
83. Navigate to `/m/tables/*` → desktop-only message with table summary list
84. Tables list is read-only (tap → "switch to desktop")
85. Navigate to `/m/notes/[id]` → read-only viewer renders TipTap content
86. Edit affordance on notes → "switch to desktop" prompt
87. Navigate to `/m/vault` → desktop-only message
88. Navigate to `/m/usage` → desktop-only message
89. Navigate to `/m/people` → "coming soon" message
90. Navigate to `/m/admin/*` → 404 (admin hidden)
91. Each desktop-only page has "Switch to desktop site" button
92. Tap button → sets prefer-desktop cookie, reloads to desktop URL

### Polish
93. Pull-to-refresh works on lists
94. Virtual keyboard doesn't cover input fields
95. Bottom tab bar hides when keyboard is open
96. Loading states show skeletons (not empty states)
97. Offline message shows when network drops
98. All touch targets are 44px minimum
99. Safe area insets respected (top notch, bottom home indicator)
100. No regressions on desktop functionality

When all 100 verification steps pass, this CR is complete.

---

## 7. Rules of engagement

### 7.1 Mobile is for capture, triage, reference

Don't try to build full editing on mobile. The deliberate philosophy is minimal — when in doubt, redirect to desktop. Adding mobile features beyond capture/triage/reference dilutes both surfaces.

### 7.2 Bottom sheets, not modals

Modal dialogs that pop in the middle of the screen are awkward on mobile. Use bottom sheets for: capture, search, action menus, pickers, processing forms. The pattern is consistent and one-handed-friendly.

### 7.3 Touch targets are 44px minimum

Existing convention. Any interactive element new to this CR must respect this. Larger is better for primary actions (the disposition tiles in processing mode are 120x80px for a reason).

### 7.4 Reuse desktop tRPC routers

Mobile shares all server logic with desktop. No mobile-specific tRPC procedures. If something seems to need a special mobile endpoint, that's probably a sign the desktop endpoint should be enhanced to serve both.

### 7.5 Don't break desktop

Every change to shared components (CaptureModal usage, CommandPalette usage, BottomTabBar) must verify desktop functionality is unchanged. Mobile gets new components; desktop keeps existing ones.

### 7.6 The "switch to desktop" escape hatch is valid UX

For features that don't fit mobile, "switch to desktop" is a legitimate answer. Don't apologize for it. The button exists; the feature works on desktop; mobile isn't trying to be everything.

### 7.7 Voice and camera are best-effort

Web Speech API support varies. Camera access works on iOS Safari and Android Chrome but with quirks. Test on real devices. If a feature doesn't work on a specific browser, hide it gracefully rather than showing a broken state.

### 7.8 Captures lifecycle is the same as desktop

The mobile processing mode uses the same dispositions as desktop's GTD Inbox CR processing mode (Task / Note / Project / Someday / Waiting For / 2-minute / Trash). The forms are simplified for mobile but the underlying entity transitions are identical. No mobile-specific Capture states.

### 7.9 Notes mobile is read-only in this CR

`/m/notes` gets list view + read-only viewer. Editing is desktop-only. Don't try to port the TipTap editor to mobile in this CR — that's a separate, large piece of work.

### 7.10 People mobile is deferred

The `/m/people` route shows "coming soon" until the next mobile CR (Mobile People + Scanning) ships after Wave 5a-ii.

---

## 8. Recommended Build Sequence

**Phase 1: Mobile capture sheet (3-4 days)**

1. Create `MobileCaptureSheet` component with bottom-sheet pattern
2. Implement drag-to-dismiss and outside-tap-to-dismiss
3. Voice button with Web Speech API integration (graceful fallback)
4. Photo and attachment buttons
5. Wire to existing `capture.create` tRPC procedure
6. Replace usage in `MobileTopBar`
7. Verify desktop CaptureModal still works

**Phase 2: Mobile search (2-3 days)**

8. Create `MobileSearchSheet` component (full-screen overlay)
9. Recent searches storage (LocalStorage)
10. Debounced search via existing `search` router
11. Result grouping and rendering
12. Tap-to-navigate handlers per entity type
13. Replace CommandPalette usage in `MobileTopBar`

**Phase 3: Captures inbox + processing (5-7 days)**

14. `/m/captures` list view
15. Capture card component
16. Bottom tab bar update (Captures replaces Calendar)
17. Processing mode page
18. Disposition tiles grid
19. Per-disposition forms as bottom sheets (Task, Note, Project, Someday, Waiting For, 2-min, Trash)
20. Skip and navigation
21. Undo snackbar
22. Optional: swipe gestures

**Phase 4: Task perspectives expansion (3-4 days)**

23. Update `MobileTasksPage` chip filter to show all 8 perspectives
24. Implement Tomorrow, Forecast, Someday, Waiting For, Completed views
25. Pagination for Forecast and Completed
26. Update task list row component for expanded metadata

**Phase 5: Task detail enhancements (2-3 days)**

27. Update `MobileTaskDetailPage` to show all GTD fields
28. Quick actions row (Done / Flag / Edit)
29. Date picker bottom sheet
30. Project picker bottom sheet
31. Context picker bottom sheet
32. Tag picker bottom sheet
33. Person picker for waiting-for (free text + People search if 5a-i shipped)

**Phase 6: Notes mobile (light) (2 days)**

34. `/m/notes` list view
35. `/m/notes/[noteId]` read-only viewer (renders TipTap content)
36. Search within notes
37. "Edit in desktop" affordance

**Phase 7: Desktop-only redirects (1-2 days)**

38. `DesktopOnlyPage` reusable component
39. Apply to `/m/tables/*`, `/m/vault`, `/m/usage`, `/m/people` (placeholder)
40. `/m/admin/*` returns 404
41. "Switch to desktop site" button setting prefer-desktop cookie

**Phase 8: Polish (2-3 days)**

42. Pull-to-refresh on lists
43. Keyboard-aware layouts
44. Loading state skeletons
45. Offline message
46. Verify all touch targets, safe areas

**Phase 9: Verification (2 days)**

47. All 100 verification steps
48. Real-device testing (iOS Safari, Android Chrome at minimum)

---

## 9. What is NOT in this CR

**Future Mobile People + Scanning CR:**
- `/m/people` list, detail, picker
- Manual person creation form
- QR code scanning (BarcodeDetector)
- AI vision scanning for business cards / signboards

**Future mobile advancements (out of scope, no specific CR planned yet):**
- Mobile Notes editing (TipTap on mobile, slash commands, block handles — significant scope)
- Mobile Tables (any editing)
- Mobile Calendar (when Wave 6a desktop ships)
- Mobile Journals (when Wave 7 ships)
- Photo-based event capture (snap a flyer, AI extracts event details)
- Service worker for true offline support
- Native app wrappers (Capacitor, React Native)

**Permanently desktop-only:**
- Admin panel
- Detailed Settings sections (Drive integration setup, AI configuration)
- File conversion (.docx import, .pdf export)
- Full Help Center with AI chat panel

If you find yourself building any of these, stop.

---

## 10. Final note

This CR closes the mobile capture experience to where it should have been from the start. The current state — desktop modal forced onto mobile screens, desktop CommandPalette as the search experience — works mechanically but feels wrong. After this CR, mobile feels like a deliberate, well-designed tool for the GTD-on-the-go use case it's meant to serve.

The minimal mobile philosophy is preserved. Heavy editing stays desktop. But within the capture/triage/reference scope, mobile becomes excellent. That's the right trade-off for Atlas's positioning as a personal command center.

Begin with section 8, Phase 1.
