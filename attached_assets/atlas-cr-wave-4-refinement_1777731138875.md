# Atlas CR — Wave 4 Refinement: Notes Editor, Tables UI, Error Handling

## Read this entire CR before taking any action.

---

## 1. Overview

Wave 4a (Notes) and Wave 4b (Tables) shipped, but real use has surfaced significant UX gaps and reliability issues. The infrastructure is in place — entities save, data persists, basic operations work — but the user-facing surfaces feel unfinished. Users see error toasts with raw JSON parse messages, the Notes editor has no visible formatting affordances, the Tables grid is sparse and confusing, and creating a note or table sometimes fails on first attempt and succeeds on retry.

This CR fixes the user-facing problems comprehensively. It does not add new features. The goal is to take Notes and Tables from "technically works" to "genuinely usable."

**The work:**

1. **Notes editor — Notion-style affordances** — floating toolbar on text selection, slash menu for block insertion, block handles on hover for reorder/block-menu
2. **Notes editor — error fixes** — Cmd+B side-effect error, attachment upload failure, reference picker verification
3. **Tables grid — proper rendering** — visible cell borders, clear selection state, footer aggregations, fixed column header layout
4. **Cross-cutting — error handling** — server 500s never reach the user as JSON parse errors; all toast messages are friendly
5. **Cross-cutting — entity creation race condition** — create note / create table no longer fails on first attempt
6. **Drive sync verification** — confirm hourly Drive sync of notes is actually running and producing valid output

**Pre-requisites:**

- Wave 4a (Notes) and Wave 4b (Tables) are shipped
- TipTap is installed and the editor renders
- Notes and Tables data persists in the database
- The polymorphic Attachment infrastructure from the Media wave exists

**Estimated scope:** 2-3 weeks of focused work.

**Severity:** High. Notes and Tables are central to Atlas's value proposition. Until this CR ships, users (you, family, friends) will avoid using these modules due to the friction.

---

## 2. The diagnostic principle

Before fixing anything, understand it. Several issues in this CR have surface-level symptoms with deeper root causes. Don't just patch the symptom — find the underlying issue and fix it properly.

For each issue spec'd below, the prompt provides:
- **Symptom** — what the user sees
- **Likely root cause** — what's probably wrong (verify before assuming)
- **Fix** — what the corrected behavior should be

If the actual root cause differs from what's described, fix the actual cause and document the deviation.

---

## 3. Detailed deliverables

### 3.1 Notes editor — Notion-style affordances

#### 3.1.1 The principle

Most users are familiar with Notion's editor pattern. Atlas should adopt the same conventions because the learning cost is zero for those users and the discoverability is high for those unfamiliar.

The Notion pattern is:
- **Floating toolbar** appears when text is selected (formatting actions)
- **Slash menu** opens when typing `/` at the start of an empty line (insert blocks)
- **Block handles** appear on hover at the left of each block (drag to reorder, open block menu)
- **Markdown shortcuts** still work for power users (`**bold**`, `# heading`, etc.)

The current editor has only the markdown shortcuts. This CR adds the other three.

#### 3.1.2 Floating toolbar on text selection

When the user selects text in the editor, a floating toolbar appears just above the selection.

**Visual:**

```
                          ┌──────────────────────────────┐
                          │ B  I  U  S  </>  ⌘  •  ⛓     │
                          └──────────────────────────────┘
                          
   This is some text the user has selected within their note.
```

**Buttons (left to right):**

- **B** — Bold (Cmd+B)
- **I** — Italic (Cmd+I)
- **U** — Underline (Cmd+U)
- **S** — Strikethrough (Cmd+Shift+X)
- **</>**  — Inline code (Cmd+E)
- **⌘** — Block type dropdown (Paragraph, H1, H2, H3, Bullet list, Numbered list, Code block, Quote)
- **•** — Color/highlight (small palette popover)
- **⛓** — Link (Cmd+K)

**Behavior:**

- Toolbar appears on `mouseup` after selection, or after Shift+arrow selection via keyboard
- Toolbar disappears when selection clears or user clicks outside
- Toolbar floats above the selection by default; falls back to below if there's no room above
- Toolbar respects scroll — if the page scrolls, toolbar repositions with the selection
- All buttons show their keyboard shortcut on hover tooltip
- Active formatting (e.g., the selection is already bold) shows the button in active state

**Implementation:**

Use TipTap's `BubbleMenu` extension. It handles positioning and visibility. Configure with the buttons listed above.

```typescript
import { BubbleMenu } from '@tiptap/react'

<BubbleMenu editor={editor}>
  <button onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
  // ... etc
</BubbleMenu>
```

#### 3.1.3 Slash menu for block insertion

When the user types `/` at the start of an empty line (or after pressing Enter on an empty line), a menu appears showing block types they can insert.

**Visual:**

```
/
┌──────────────────────────────────────┐
│ 🔍 Search blocks...                   │
│                                       │
│ BASIC BLOCKS                          │
│   Text                                │
│   Heading 1                           │
│   Heading 2                           │
│   Heading 3                           │
│   Bullet list                         │
│   Numbered list                       │
│   To-do list                          │
│   Quote                               │
│   Divider                             │
│   Code block                          │
│                                       │
│ MEDIA                                 │
│   Image                               │
│   Attachment                          │
│                                       │
│ REFERENCES                            │
│   Mention task                        │
│   Mention note                        │
│   Mention project                     │
│                                       │
└──────────────────────────────────────┘
```

**Behavior:**

- `/` at start of empty line opens the menu
- Typing characters after `/` filters the list (e.g., `/head` shows only Heading options)
- Arrow keys navigate the list
- Enter selects the highlighted item
- Escape closes the menu
- Clicking outside closes
- Selecting an item replaces the line with the chosen block type

**Mention items:**

The "Mention task / note / project" items at the bottom are a shortcut for the `[[` reference syntax. Selecting "Mention task" opens the reference picker with the task type pre-filtered. This makes the cross-module reference feature discoverable from the slash menu.

**Implementation:**

Use TipTap's slash command extension or a custom approach with `Suggestion` utility. Several open-source examples exist (TipTap's own examples, Novel editor, etc.).

#### 3.1.4 Block handles on hover

When the user hovers over a block, a handle appears on the left margin.

**Visual:**

```
   ⋮⋮ This is a paragraph.
      
   ⋮⋮ # This is a heading
   
   ⋮⋮ • Bullet list item
       Another bullet
```

The `⋮⋮` (six-dot grip icon) is the block handle.

**Interactions:**

- **Drag the handle**: drag the entire block up or down to reorder
- **Click the handle**: opens a small menu

```
┌─────────────────┐
│ Turn into ▶     │  (submenu: Paragraph, H1, H2, H3, List, Quote, etc.)
│ ─────           │
│ Duplicate       │
│ Delete          │
│ ─────           │
│ Color ▶         │  (submenu of color options)
└─────────────────┘
```

**Implementation:**

TipTap has a `DragHandle` extension in their Pro tier, but free alternatives exist (e.g., `tiptap-pro/extension-drag-handle` is paid; `tiptap-extension-global-drag-handle` is community-maintained free). Use the free one or implement the minimal version needed.

#### 3.1.5 Markdown shortcuts continue to work

The existing markdown shortcuts (`**bold**`, `# heading`, `- list`, etc.) must continue to function alongside the new affordances. Power users should be able to type fluently without touching the toolbar.

Verify after implementation:
- Type `# ` at start of line → becomes H1
- Type `## ` → H2; `### ` → H3
- Type `**word**` → word becomes bold
- Type `*word*` → word becomes italic
- Type `~~word~~` → strikethrough
- Type `` `word` `` → inline code
- Type `- ` at start of line → bullet list
- Type `1. ` at start of line → numbered list
- Type `- [ ] ` → task list checkbox
- Type `> ` at start of line → blockquote
- Type ` ``` ` (three backticks) → code block

#### 3.1.6 Reference picker verification

The `[[`, `#`, `@` triggers should open the reference picker.

**Verify each works:**

- `[[` → picker shows notes, tasks, projects, tables. Filters as user types. Enter inserts reference.
- `#` → picker shows existing tags only (per the Tag architecture from refinement v2 — no auto-create from `#`). Type to filter. Enter inserts tag reference. If user types a tag name that doesn't exist, "Create tag #X" option appears at the bottom.
- `@` → picker shows contexts and (when People module ships) people. Type to filter.

**If any of these don't work currently:**

This is a regression from Wave 4a's spec. Diagnose:
- Is the TipTap extension wired up?
- Does the picker component render at all when the trigger fires?
- Does the resolution query (search across Note, Task, Project, Tag, Context) return results?
- Does inserting a result properly create a TipTap node with the target_type/target_id attributes?

Fix whatever's broken. Reference picker is foundational — without it, cross-module references don't work, which means Wave 4c's tracker tables and Project view aggregation also won't work properly.

### 3.2 Notes editor — error fixes

#### 3.2.1 Cmd+B side-effect error

**Symptom:** Pressing Cmd+B applies bold formatting (correctly) but also shows an error toast.

**Likely root causes:**

a) The auto-save mutation is failing for some reason after formatting. Check: does the save endpoint accept the new TipTap JSON shape with formatting marks?

b) The toolbar position calculation is throwing an error after Cmd+B (toolbar should appear because text is selected after the operation). Check: does the BubbleMenu render? Is there a null reference somewhere in its positioning logic?

c) An audit log entry is being created (formatting changes the body, body change should log) and the audit logger is failing on the metadata shape.

**Fix:** trace the actual error in browser dev tools. The toast shows a JSON parse error which means the server returned an HTML error page. Check the network tab for the failing request, look at the response, identify which endpoint failed and why. Fix at the source.

The frontend should also handle 500 responses gracefully (see 3.4) so that even if a save fails, the user gets a useful message rather than "Unexpected token 'I', 'Internal S'... is not valid JSON".

#### 3.2.2 Attachment upload failure

**Symptom:** Dragging a file onto a note shows "Failed to upload [filename]".

**Likely root causes:**

a) The upload endpoint doesn't accept `parent_type='note'`. The Media wave set up polymorphic attachments primarily for tasks; the note path may not have been wired up. Check: does the upload tRPC procedure validate parent_type against an allow-list, and is `note` in that list?

b) The R2 path generation fails for note attachments. The path pattern is `users/{user_id}/attachments/{attachment_id}/{filename}` — should work for any parent type, but verify.

c) The signed URL generation fails because the note attachment record isn't linkable. Check: is the Attachment row created successfully? Does the signed URL generation succeed?

d) The frontend uploader is calling a wrong endpoint. Check the network call when dragging a file on a note vs. a task.

**Fix:** trace the actual server error. The Media wave's verification should have included note attachments in scope; if not, this is a gap that's being filled now.

After fix, verify:
- Drag image onto note → uploads successfully, thumbnail appears in Attachments section of metadata panel
- Drag PDF onto note → uploads successfully, generic icon shown
- Click attachment in note metadata → opens preview/download as appropriate
- Detach attachment → orphan goes to Media inbox (per Media wave spec)

### 3.3 Tables grid — proper rendering

The current Tables grid is sparse and confusing. Looking at the screenshot:

- Empty rows look like placeholders but it's unclear which is real data vs. a "Add row" hint
- Column header has confusing layout: "Name ↑ Add ✕"
- No visible cell borders
- No selected/active cell state
- No footer aggregations
- Sort and Filter buttons exist but active state unclear

This section fixes the grid rendering comprehensively.

#### 3.3.1 Cell rendering

Every cell in the grid renders with:

- Visible top and bottom border (thin, low-contrast)
- Right border (separates columns)
- Padding inside cell so content doesn't touch borders
- Default minimum height for empty cells (consistent visual rhythm)

Selected cell renders with:
- Distinct border color (theme accent)
- Slightly elevated background
- Cursor visibility for keyboard navigation

Cell in editing mode renders with:
- Input field inline
- More distinct border (active state)
- Type-appropriate input (date picker for date column, dropdown for select, etc.)

The grid should feel like a spreadsheet — clear cell boundaries, clear selection state, clear edit state. Reference: how Airtable or Notion's database view handles this.

#### 3.3.2 Column header layout

Current header is confusing. New layout:

```
┌──────────────────────────────────────────────────────────┐
│ Name        Text  ↑                                  ⋯   │
└──────────────────────────────────────────────────────────┘
```

Elements:
- **Column name** on the left (bold)
- **Type label** next to name (smaller, dimmed) — "Text", "Number", "Date", etc.
- **Sort indicator** (↑ or ↓) only when this column is being sorted
- **More menu** (⋯) on the right — opens column settings (rename, change footer aggregation, delete column)

The "Add" button that's currently on each column header is wrong. Adding a new column happens via the **+** button at the rightmost end of the column row, separate from any specific column.

```
┌────────────┬────────────┬────────────┬─────┐
│ Name  Text │ Date  Date │ Amount …   │  +  │
└────────────┴────────────┴────────────┴─────┘
```

Click `+` → opens column type picker → adds new column to right.

The `✕` button to delete a column lives in the column's "⋯" menu, not in the header directly. This prevents accidental deletion when the user just meant to interact with the column.

#### 3.3.3 Row rendering

Rows render as horizontal lines of cells with consistent height. The drag handle (≡) on the left should:

- Appear on row hover (not always visible — keeps the grid clean)
- Show a clear grip cursor
- Be clickable to select the row
- Be draggable to reorder

There should not be visible empty rows below the data — the "+ Add row" affordance is a single button at the bottom of the data, not multiple empty placeholder rows.

#### 3.3.4 Footer row with aggregations

A persistent footer row at the bottom of the grid shows aggregations for columns that have `footer_aggregation` configured.

```
┌────────────┬────────────┬─────────────┬────────────┐
│ Name       │ Date       │ Amount      │ Category   │
├────────────┼────────────┼─────────────┼────────────┤
│ ...row data                                         │
├────────────┼────────────┼─────────────┼────────────┤
│            │ Count: 47  │ Sum: ₨ 19k  │            │
└────────────┴────────────┴─────────────┴────────────┘
```

Behavior:
- Footer row sticks to bottom on scroll (sticky positioning)
- Each cell shows the aggregation type and value (e.g., "Sum: ₨ 19,750.00")
- Empty cells in footer when no aggregation is set
- For Checkbox columns, footer always shows "X / Y" format
- Number/Currency columns default to Sum
- Aggregation respects active filters (filtered subset only)

#### 3.3.5 Sort indicator

When a sort is active, the column being sorted shows ↑ (ascending) or ↓ (descending) next to the type label.

The "Sort: Name" pill at the top of the grid (currently visible) should remain — it's a useful affordance to clear the sort.

When clicked, the pill opens the sort dropdown (allowing change to a different column or sort direction). When the dropdown shows "None (manual order)", clicking applies it and the column header indicator disappears.

#### 3.3.6 Filter indicator

When a filter is active, the Filter button at the top should:
- Show as filled / active state
- Display the filter summary (e.g., "Filter: Category = Food")
- Clicking opens the filter panel

When no filter, button shows neutral state with just "Filter" label.

#### 3.3.7 Empty state

When a table has no rows yet:

```
┌──────────┬──────────┬──────────┐
│ Name     │ Date     │ Amount   │
├──────────┼──────────┼──────────┤
│                                 │
│   No rows yet                   │
│   [+ Add row]                   │
│                                 │
└──────────┴──────────┴──────────┘
```

Single centered prompt with the add-row button. No empty placeholder rows.

When a filter is active and produces no results:

```
│   No rows match the current filter   │
│   [Clear filter]                      │
```

### 3.4 Cross-cutting — error handling

#### 3.4.1 The principle

Users should never see raw JSON parse errors, raw HTTP status codes, or technical jargon in error toasts. Every error surfaced to the user is:

- Phrased in plain language
- Specific enough to be actionable
- Suggests a next step when possible

Internal logging (console, server logs) preserves the technical detail for debugging.

#### 3.4.2 Frontend error boundary

When a tRPC call fails, the frontend should not attempt to JSON.parse() an HTML error response. The current "Unexpected token 'I', 'Internal S'... is not valid JSON" toast is a frontend bug — it's parsing the error response as JSON when the server returned HTML.

Fix the response handling:

```typescript
// In tRPC client error handler:
async function handleTrpcError(error: unknown): string {
  if (error instanceof TRPCClientError) {
    return error.message  // Already formatted
  }
  if (error instanceof Error) {
    // Network error, parse error, etc.
    if (error.message.includes('Internal Server Error') || error.message.includes('Failed to fetch')) {
      return 'Something went wrong on our end. Please try again.'
    }
    return error.message
  }
  return 'An unexpected error occurred. Please try again.'
}
```

The principle: if the response isn't valid JSON, don't try to extract structured info from it. Show a generic friendly message.

#### 3.4.3 Toast message audit

Audit all toast messages currently in use across the app. For each:
- Is it phrased in plain language?
- Is it actionable?
- Does it expose technical detail?

Common offenders to look for:
- Raw HTTP error codes
- Stack traces
- "undefined" or "null" in messages
- JSON parse error syntax
- Internal field names ("validation failed on attribute X")

Replace each with a friendly equivalent.

Examples:

| Bad | Good |
|---|---|
| "Unexpected token 'I', 'Internal S'... is not valid JSON" | "Something went wrong. Please try again." |
| "Failed to upload ans_walker01.JPG" | "Couldn't upload [filename]. Try again, or check the file size (max 100MB)." |
| "ValidationError: title required" | "This needs a title before it can be saved." |
| "Network request failed" | "Lost connection. Check your internet and try again." |

#### 3.4.4 Server-side error responses

When the server throws an error, the response should be structured JSON, not an HTML error page. Verify all tRPC procedures return proper JSON errors:

```typescript
// In tRPC procedure
throw new TRPCError({
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Couldn't save the note. Please try again.',
  cause: originalError,  // Logged server-side, not surfaced
})
```

If any unhandled exceptions are bubbling up as 500 responses with HTML bodies, wrap them in proper TRPCError handling.

### 3.5 Entity creation race condition

#### 3.5.1 Symptom

Creating a note or table fails on the first attempt with an error, then succeeds on the second attempt without changes. This pattern strongly suggests a race condition or initial-state issue.

#### 3.5.2 Likely root causes

a) **Frontend submits before user/auth context is ready.** The create call fires before the user object is fully resolved, server returns "user not found" or similar. Second attempt works because by then the auth context is ready.

b) **Optimistic UI conflicts with the actual server response.** The frontend optimistically adds the entity to local state, then the server response either confirms or contradicts. If the response handling has a bug, the local state and server state diverge.

c) **Database transaction conflict.** If creating the entity involves multiple table inserts (e.g., creating a Note also creates an entry in Link table for any references in the body), and these aren't wrapped in a transaction, partial creation can fail.

d) **Drive sync hook.** If creating a note also triggers a Drive sync registration, and that registration fails on first attempt (network blip, OAuth refresh needed), the whole create might fail.

#### 3.5.3 Diagnostic approach

Open browser dev tools, network tab. Try creating a note. Note exactly:
- Which request fires
- What the response is on the failed first attempt
- What's different on the successful second attempt

The diagnosis tells you the fix. Common patterns:

- If the first attempt 500s and the second 200s: there's a server-side initialization issue
- If the first attempt is in flight when the second starts: there's a frontend double-submit issue
- If both attempts send identical requests but get different responses: there's server-side state changing between attempts

#### 3.5.4 Fix

Whatever the root cause, the fix should:

1. Make the create operation idempotent and atomic where possible
2. Wrap multi-step creates in a transaction
3. Handle auth context properly before submitting
4. Retry transient failures automatically with exponential backoff (up to 2 retries) before showing an error to the user

### 3.6 Drive sync verification

#### 3.6.1 The check

Open Settings → System → Jobs. Look at "Drive sync — Notes":

- Is it Active or Paused?
- When did it last run?
- Did it succeed?
- How many files were synced?

If the job hasn't run in the past 2 hours, or has been failing, fix the underlying issue.

#### 3.6.2 Verify Drive output

Check the user's Google Drive:

- Is there an `Atlas/Notes/` folder?
- Are there subfolders for each Purpose (Meeting Note, Project Brief, etc.)?
- Are .md files appearing with correct names?
- Do .md files contain valid frontmatter and body content?

If any of this is missing or wrong, fix the Drive sync logic. The hourly job exists; it just needs to actually work.

#### 3.6.3 Common Drive sync failures

- OAuth token expired and not refreshed
- Drive API quota exceeded
- Folder creation failing silently
- File creation succeeding but `drive_file_id` not stored on the Note record
- Subsequent syncs creating duplicate files because the prior file ID wasn't tracked

### 3.7 Verification this CR doesn't break Wave 4a/4b functionality

After fixes, verify all Wave 4a and 4b core functionality still works:

- Notes save and load correctly
- Folders organize notes
- Project attachment works
- Brief designation works
- Tables save and load correctly
- Six column types all work
- Cell editing works
- Sort and filter work
- All existing keyboard shortcuts work

Don't fix one thing and break another.

---

## 4. tRPC procedures

No new procedures. Existing procedures may need fixes:

- `notes.create` — verify race condition fix
- `tables.create` — verify race condition fix
- `attachments.upload` — verify accepts parent_type='note'
- All procedures — ensure errors thrown as TRPCError, not bubbled as HTML

---

## 5. File changes

```
/atlas
  /src
    /components
      /notes
        note-editor.tsx                    (UPDATED: BubbleMenu, slash menu, drag handles)
        editor-bubble-menu.tsx             (NEW: floating toolbar component)
        editor-slash-menu.tsx              (NEW: slash command menu)
        editor-block-handle.tsx            (NEW: per-block hover affordance)
        editor-block-menu.tsx              (NEW: menu shown when block handle clicked)
      /tables
        table-grid.tsx                     (UPDATED: cell borders, selection state, footer)
        table-cell.tsx                     (UPDATED: clear states for idle/selected/editing)
        table-column-header.tsx            (UPDATED: name + type label + sort + ⋯ menu)
        table-add-column-button.tsx        (NEW: separate from column headers)
        table-footer-row.tsx               (NEW: sticky aggregations row)
        table-empty-state.tsx              (UPDATED: single centered prompt)
      /errors
        error-toast.tsx                    (UPDATED: friendly messages)
    /core
      /errors
        error-handler.ts                   (NEW: centralized error message translation)
        trpc-error-boundary.ts             (NEW: handle non-JSON responses)
      /editor
        tiptap-config.ts                   (UPDATED: enable BubbleMenu, slash extension)
        slash-commands.ts                  (NEW: command list and handlers)
    /server
      /routers
        attachments.ts                     (UPDATED: ensure note parent_type works)
        notes.ts                           (UPDATED: create idempotency, transaction wrapping)
        tables.ts                          (UPDATED: create idempotency)
```

---

## 6. Verification

### Notes editor — formatting toolbar
1. Select text in a note → floating toolbar appears above selection
2. Toolbar shows: B, I, U, S, code, block-type, color, link
3. Click B → bold applied, no error toast
4. Cmd+B → bold applied, no error toast
5. Click block-type dropdown → can change paragraph to heading
6. Click link → input for URL appears, Enter creates link
7. Toolbar disappears when selection clears
8. Active formatting (e.g., already bold) shows button in active state

### Notes editor — slash menu
9. Type `/` at start of empty line → slash menu opens
10. Menu shows Basic Blocks, Media, References sections
11. Type `/head` → list filters to heading options
12. Arrow keys navigate; Enter selects
13. Selecting "Heading 1" replaces line with H1 block
14. Escape closes menu without action
15. `/` not at start of line → no menu (prevents triggering during normal typing)

### Notes editor — block handles
16. Hover over any block → ⋮⋮ handle appears at left
17. Drag handle → block reorders
18. Click handle → menu opens with Turn into / Duplicate / Delete / Color
19. "Turn into" submenu lets user change block type
20. Duplicate creates copy below
21. Delete removes block

### Notes editor — markdown shortcuts still work
22. Type `# ` at start of line → becomes H1
23. Type `**word**` → bold
24. Type `- ` → bullet list
25. Type ` ``` ` → code block
26. All shortcuts function alongside the new affordances

### Notes editor — references
27. Type `[[` → reference picker opens
28. Type characters → list filters to matching notes/tasks/projects/tables
29. Pick result → reference inserted as styled link
30. Click reference → navigates to target
31. Type `#` → tag picker opens (existing tags only)
32. Type `@` → context picker opens

### Notes editor — error fixes
33. Cmd+B → no error toast appears (just the formatting)
34. Drag image onto note → uploads successfully
35. Image appears in Attachments section of metadata panel
36. Click attached image → opens preview
37. Drag PDF onto note → uploads with generic icon
38. Multiple attachments → all visible, can detach individually

### Tables grid — cell rendering
39. Open a table → grid shows clear cell borders
40. Empty cells have consistent height with proper padding
41. Click a cell → selection state visible (border, slight elevation)
42. Double-click or Enter → editing state with type-appropriate input
43. Tab moves selection right; Enter moves selection down
44. Escape exits editing without saving

### Tables grid — column headers
45. Header shows: column name (bold), type label (dimmed), sort indicator (when active), ⋯ menu
46. No "Add" button on individual column headers
47. Click ⋯ → settings popover (rename, footer aggregation, delete)
48. + button at right of column row adds new column

### Tables grid — rows
49. Drag handle (≡) appears on row hover only
50. No empty placeholder rows visible
51. "+ Add row" is single button at bottom of data
52. Drag-reorder rows works (when sort is None)
53. Drag-reorder disabled with tooltip when sort is active

### Tables grid — footer
54. Footer row sticks to bottom of grid
55. Number column: shows "Sum: ₨ X" by default
56. Currency column: same
57. Checkbox column: shows "X / Y"
58. Date column: shows count
59. Footer recomputes when filter is applied

### Tables grid — empty states
60. New table with no rows: centered "No rows yet" message
61. Filter producing zero results: "No rows match the current filter" with [Clear filter] button

### Cross-cutting — error handling
62. Trigger a server error (e.g., disconnect network momentarily) → friendly toast, no JSON parse text
63. Failed save shows actionable message
64. Failed upload shows clear reason and next step
65. All error toasts use plain language; no technical jargon

### Entity creation race condition
66. Create a new note → succeeds on first attempt
67. Create a new table → succeeds on first attempt
68. Create new note immediately after page load → succeeds
69. Create multiple notes in rapid succession → all succeed

### Drive sync verification
70. Settings → System → Jobs shows Drive sync — Notes as Active
71. Last run timestamp is within past 2 hours
72. Last run status is success
73. Click "Run now" → triggers immediate sync, success message
74. Check Drive: `Atlas/Notes/[Purpose]/` folders exist with .md files
75. .md files have valid frontmatter
76. Edit a note in Atlas → wait for next sync (or run now) → Drive file updates

### No regressions
77. All Wave 4a Notes verification still passes
78. All Wave 4b Tables verification still passes
79. All previous waves' functionality still works

When all 79 verification steps pass, this CR is complete.

---

## 7. Rules of engagement

### 7.1 Diagnose before fixing

Several issues in this CR have surface symptoms. Don't guess at causes — verify in browser dev tools, network tab, server logs. The fix you write should address the actual root cause. Document any deviation from the "likely root cause" descriptions in this CR.

### 7.2 Notion is the reference, not the implementation

The editor adopts Notion's patterns (floating toolbar, slash menu, block handles) because they're familiar to users. Don't try to clone Notion exactly — implement the pattern in a way that fits Atlas's existing visual language. The goal is recognition, not replication.

### 7.3 No new features

This CR is fixes only. Do not add task templates, tags on notes, inbox processing UX, or any other feature. Those are Wave 4c (or later) territory. If you find yourself wanting to "improve" something beyond the spec, stop — that's scope creep.

### 7.4 Errors are a UX surface

Every error message a user sees is a UX touchpoint. Treat error messaging with the same care as primary UI. Plain language, actionable suggestions, no technical jargon. The goal: when something fails, the user knows what happened and what to do.

### 7.5 Test the actual user experience

After implementation, sit down and use Notes for 30 minutes. Write a real note with formatting, attachments, references. Create a table, add columns and rows. Notice every place where something feels rough — and fix those before declaring done. Verification steps catch most issues but not all.

### 7.6 Drive sync is critical infrastructure

If Drive sync isn't working reliably, fix that as priority. Users may not notice immediately, but losing weeks of notes because the backup wasn't running is the worst kind of trust failure. Verify it works end-to-end before shipping this CR.

### 7.7 Race conditions are sneaky

The "fails first time, works second time" pattern can have many causes. The fix isn't always obvious from the symptom. Use the diagnostic approach in 3.5.3 — observe the actual failing request, identify what's different on the retry, and fix the underlying cause. Don't paper over with "always retry once" unless that's genuinely the right fix.

---

## 8. Recommended Build Sequence

**Phase 1: Diagnosis (1-2 days)**

1. Reproduce each issue (Cmd+B error, attachment failure, race condition, etc.)
2. Open dev tools, capture exact errors and request/response details
3. For each issue, identify the root cause; document deviations from this CR's "likely root cause" descriptions
4. Verify Drive sync status — is it actually running?

**Phase 2: Cross-cutting error handling (2-3 days)**

5. Centralize tRPC error handler with friendly message translation
6. Audit all toast messages; replace technical strings with plain-language equivalents
7. Ensure all server errors throw proper TRPCError, not bubble as HTML
8. Frontend error boundary handles non-JSON responses gracefully

**Phase 3: Entity creation race condition (1-2 days)**

9. Apply diagnosis from Phase 1 to fix the create-note and create-table race
10. Wrap multi-step creates in transactions
11. Handle auth context properly before submission
12. Add automatic retry for transient failures

**Phase 4: Notes editor enhancements (5-7 days)**

13. Floating toolbar (BubbleMenu)
14. Slash menu (custom or extension)
15. Block handles (free extension or custom)
16. Verify all markdown shortcuts still work
17. Verify reference picker works
18. Fix Cmd+B side-effect error
19. Fix attachment upload for notes

**Phase 5: Tables grid rendering (4-5 days)**

20. Cell rendering with clear borders and selection state
21. Column header layout fix
22. Add column button placement
23. Row hover affordances
24. Footer row with aggregations
25. Empty states
26. Sort and filter indicators

**Phase 6: Drive sync verification and fix (1-2 days)**

27. Verify job runs and produces output
28. Fix any underlying issues (OAuth, file ID tracking, etc.)
29. End-to-end test: edit note in Atlas → see update in Drive

**Phase 7: Verification (2-3 days)**

30. All 79 verification steps
31. Sit-and-use test (30 minutes of real Notes/Tables use)

---

## 9. What is NOT in this CR

**Wave 4c territory:**
- Task templates
- Better Inbox processing UX
- Tags on notes
- Quick capture purpose detection
- Note versioning, public sharing, embed types
- Multi-select, formula, relation columns
- CSV import for tables
- Tracker tables / Project header progress
- Unified Project view

**Phase 2 territory:**
- Visual knowledge graph
- Collaborative editing
- User-defined templates
- Custom perspectives
- Multi-currency support

**Permanently excluded:**
- Two-way Drive sync
- Notion clone (we adopt patterns, not implementation)

If you find yourself building any of these, stop.

---

## 10. Final note

Notes and Tables are core to Atlas's value proposition. Until this CR ships, both modules feel half-done — the data persists but the UX is rough enough that you won't trust either as a daily driver.

The fixes here are unglamorous. There's no new capability being added. But the difference between "Notes works technically" and "Notes feels good to use" is exactly what this CR closes. After it ships, you'll actually want to take notes in Atlas instead of avoiding it.

Same for Tables — the screenshot showed a grid that doesn't communicate clearly what's happening. After this CR, the grid feels like a spreadsheet you can trust.

The Notion-style editor patterns are the right call. They're familiar, they're proven, and they make the editor self-explanatory. Apple Notes minimalism is appealing in theory but underestimates the discovery problem — users who don't know keyboard shortcuts will think the editor "doesn't have features" when really they just can't find them.

Begin with section 8, Phase 1.
