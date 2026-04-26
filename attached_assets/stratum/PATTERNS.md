# Cross-cutting patterns

These are not components — they are the *behaviors* the system commits to. When you build a screen, you're picking primitives off the shelf (preview/) and assembling them according to the patterns below. Skip these and the surface stops feeling like Stratum.

---

## Keyboard-first

Every interactive surface has a shortcut, and every shortcut is **visible** — never hidden behind a help menu.

- **Tooltip on hover** shows the kbd hint (`.s-kbd`) right of the label.
- **Hint bar** floats centered at the bottom of every primary screen — `⌘K Command · J K Navigate · ⌫ Delete` — what's actionable in *this context*, not a global cheat sheet.
- **Cmd-palette (⌘K)** is the universal entry point. Anything reachable by click is reachable here, with the same kbd hint shown right-aligned in the row.
- Focus ring is **always visible on tab** — never `outline: none` without a replacement `box-shadow: var(--ring-focus)`.

## Sync & connection state

The app is data-backed; the user must always know whether what they see is current.

- **Sync chip** in the top-bar: `● Synced · 2m ago` (green dot) → `◐ Syncing…` (warning, animated) → `○ Offline · 4 changes pending` (tertiary text).
- A **subtle dot** in the corner of any unsaved item; converts to nothing on save (no toast for normal saves).
- Network errors get a **`s-status-strip is-error`** at the top of the affected pane — "Couldn't reach calendar — retrying in 30s." With retry count; no spinner.

## Saves are silent. Destructive actions are loud.

- Auto-save: no toast. Maybe a 600 ms shimmer of the sync chip.
- Delete: confirm dialog only when **>1 item** or item has descendants. Single-item delete is **always undoable** via `s-toast` with countdown.
- Toast lifetime: 6s default, 12s for destructive, sticky for "couldn't" errors.

## Empty states

- One short sentence. No illustration. No call-to-action button unless the action is the *only* sensible next step.
- "Inbox empty." not "🎉 You're all caught up!" The user *knows* it's good.
- Examples: "Nothing scheduled tonight." "No matches for `oct stand`." "0 items in trash."

## Loading states

- **Skeleton, not spinner**, for first-paint of structured data (lists, tables, kanban). Use `.s-skel` matching the row's eventual height.
- **Spinner** only for explicit user-triggered async (button submitting, palette searching).
- Never both.
- After **300 ms** without resolution, fade the skeleton in; before that, nothing — most loads should never show a state at all.

## Drag & drop

- **Drop indicator** is `.s-drop-indicator` — a 2 px primary-color line with a soft halo. Never a placeholder card.
- The dragged element keeps its position with `opacity: 0.6` (use `.is-dragging` modifier) — the user sees the path, not just a phantom.
- Drop zones don't get a flashy hover state. The line tells you everything.
- Cancel: ESC mid-drag. Tab and arrow keys must replicate any drag operation (kanban: `Shift+→` to move column).

## Selection

- **Single-click selects.** Double-click opens. Cmd-click adds. Shift-click range-selects.
- Selection state lives on the row (`.is-selected` — left rule + tinted background); never on a checkbox alone.
- When >0 items are selected, the **bulk-action bar** (`.s-bulk-bar`) replaces the table toolbar. It shows count, primary verbs, and `⎋ Clear`.

## Inline editing

- **Hover reveals affordance** (cursor: text, faint underline on title). **Click to edit.** Enter to commit, Esc to cancel.
- The editing field uses **`.is-editing`** — same line-height/padding as the read state so the row doesn't reflow.
- Multi-line edits use a flush expansion downward. Width never changes.

## Autocomplete & ref chips

This is the system's signature interaction.

- Type `@` → person picker. Type `#` → tag/project picker. Type `/` (in editors) → block menu.
- The **chip is committed** when the user picks; it becomes a `.s-mention` or `.s-tag` and is no longer text.
- Backspace on the chip selects it (highlight ring); second backspace deletes it. No double-confirms.
- The dropdown is `.s-cmdk` — same component as the global palette. Same row grammar everywhere.

## Focus mode

Reading or writing surfaces support `⌘.` to enter focus mode.

- All chrome dims to `opacity: 0.15` (or removes via `display:none` for app-shell rails).
- A small **`.s-focus-chrome__pill`** floats at top center: timer, "Focus · 24:18" — and an exit button.
- Esc exits. The chrome state is restored exactly as it was.

## Toasts

- Bottom-right stack, max 3 visible. New toasts push older ones up; oldest exits with a 120 ms fade.
- A toast has: **icon · sentence · undo or dismiss**. Never two actions. Never a close + an undo.
- Success toasts auto-dismiss. Error toasts persist until clicked.

## Confirms

- Modal dialogs are **rare**. Reserve for irreversible + multi-item operations.
- The destructive verb is the **left** button (primary danger), Cancel is right and outlined. This inverts platform convention deliberately — destructive actions are the focus, and `Enter` should not commit a delete by default.
- Title is the question, body is the consequence, button labels are verbs: `Delete 4 projects` / `Cancel`. Never `Yes` / `No`.

## Kbd shortcut display

- **`.s-kbd`** for single keys: ⌘ ⇧ ⌃ ⌥ ⏎ ⌫ ⎋ ⇥ — Unicode glyphs, never `Cmd+K` text.
- Combos are **separated by hair-spaces**, not `+`: `⌘ K`, not `⌘+K`.
- Sequences use a middle dot: `g · i` (go to inbox).
- In tooltips, kbd sits right of the label with 8 px gap. In menus, it floats right and is right-aligned in its column.

## Density & breakpoints

- **Desktop-first.** Below 1280 px, the layout adapts (rails collapse, sidebars hide), but density does not relax — row heights stay 26–32 px.
- Touch is a secondary citizen. We don't ship for phones; if it must run on a phone, the productivity kit collapses to a single-column drill-down with the same row heights and chips.

## Theming

- Theme swap = `<html data-theme="light">`. Nothing else changes.
- Components must reference tokens, never raw OKLCH or hex. Test every new component in both themes before merging.
