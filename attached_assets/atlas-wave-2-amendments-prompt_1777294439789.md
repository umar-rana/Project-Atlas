# Replit Agent Prompt — Wave 2 Amendments

## Read this entire prompt before taking any action.

---

## 1. Context

Wave 2 (app shell) is built and functional. After reviewing it in the live app, several refinements are needed before Wave 3a (Tasks module) begins. These are shell-level changes that affect every future module — fixing them now means Wave 3a inherits correct names and patterns from line one.

This is **not a new wave**. It's a focused amendment to Wave 2. Estimated scope: 1-2 days of work. Do not expand scope beyond what's listed here.

---

## 2. Required changes

### 2.1 Remove Next.js dev indicator

The Next.js dev tools indicator (the small "N" icon visible at bottom-left of the screen during development) is not part of Atlas. It's a Next.js framework injection.

**Fix:** In `next.config.ts`, disable the dev indicator. The exact configuration depends on Next.js version, but the option is `devIndicators` set to `false` (or the appropriate granular configuration to disable the build activity indicator).

**Verify:** After change, no "N" icon appears in development mode. The module switcher rail's bottom section shows only the intended icons (theme toggle, health, trash, theme indicator).

### 2.2 Center-align the search bar

Currently the search input is left-aligned in the top bar. It should be center-aligned.

**Specifications:**
- Search input is horizontally centered in the top bar
- Max width: 520px
- Min width: 320px (collapses gracefully at narrower viewports)
- The page context (e.g., "CRM" / "Tasks" / "Calendar" — the small text showing which module is active) moves to a more subtle position. Recommended: small text on the left side of the top bar, below or beside the active module's icon. Or remove it entirely since the active module is already visually indicated by the highlighted icon in the rail.

**Pattern reference:** Linear, Superhuman, Arc — search/command bar is the visual anchor of the top chrome.

### 2.3 Replace and reposition the capture button

The current capture affordance uses a drive/save icon and is positioned far from the primary action surfaces. This is wrong on both counts.

**New specifications:**

- **Icon:** Plus icon (`+`) from Lucide (`Plus` or `PlusCircle` — pick whichever reads cleaner at the chosen size)
- **Style:** Primary button styling (filled with accent color, not ghost/secondary)
- **Position:** Immediately to the right of the search input, visually paired or attached. The "find or create" duo becomes the visual centerpiece of the top bar.
- **Size:** Matches search input height; squarer aspect ratio than text buttons
- **Tooltip:** "Quick capture (⌘⇧I)" on hover
- **Behavior:** Same as before — opens the global capture modal

**Visual relationship:** Search and capture should feel like one unit. Two reasonable approaches:

*Approach A (attached):* The capture button is attached to the right edge of the search input, sharing a border. Single visual unit.

*Approach B (paired):* Search input and capture button are separate but adjacent (8-12px gap), clearly grouped.

Pick whichever renders better in the design system; I lean toward Approach B (paired) since it's cleaner with the current Stratum input styles, but defer to whichever your component primitives support most naturally.

### 2.4 Rename modules

Several module names need updating throughout the codebase. Update everywhere they appear: route paths, navigation labels, tooltips, page titles, command palette entries, keyboard shortcut descriptions, breadcrumbs, settings sections, and the route folder structure if it currently uses old names.

| Old name | New name | Notes |
|---|---|---|
| CRM | People | Replaces commercial-CRM connotation |
| Notes | Notes | Unchanged (but see 2.5 for new Documents module) |
| Journal | Journals | Plural — anticipates multi-journal support in future |

**Route changes:**
- `/crm` → `/people`
- `/journal` → `/journals` (note the plural)
- `/notes` → unchanged

**Module switcher icons:**
- People uses `Users` from Lucide (already correct, just renamed)
- Journals uses `BookOpen` from Lucide (already correct, just renamed)

**Schema implications (for future waves):**
- The eventual Contact entity (Wave 6) will live in a "people" namespace, not "crm"
- The eventual JournalEntry entity (Wave 7) will belong to a Journal container; for Wave 2 amendments, no schema changes needed yet, but the rename anticipates this

### 2.5 Add Documents module placeholder

Add a sixth module to the navigation rail: **Documents**. This is a placeholder for Phase 2; it's not built in Phase 1 but the slot exists in the rail and routing.

**Specifications:**
- New module entry at the bottom of the active modules section in the rail (so order is: Tasks, Calendar, People, Notes, Journals, Documents). Documents lives at the end because it's an archive destination — content flows *into* it from Notes and other modules and lives there permanently. It's not an active working module like the others.
- Icon: `FolderArchive` from Lucide (visually distinguishes from Notes' `FileText` and signals archive nature)
- Keyboard shortcut: `⌘6`
- Route: `/documents`
- Page is a placeholder with EmptyState:
  - Icon: same as rail icon
  - Headline: "Documents — coming in Phase 2"
  - Body: "Personal document archive — receipts, contracts, IDs, and important files. Documents created in Notes and other modules will flow here for long-term storage. Coming in Phase 2."
  - No action button

**Updated keyboard shortcuts:**

| Shortcut | Module |
|---|---|
| ⌘1 | Tasks |
| ⌘2 | Calendar |
| ⌘3 | People |
| ⌘4 | Notes |
| ⌘5 | Journals |
| ⌘6 | Documents |

Update the keyboard shortcut cheat sheet to reflect these.

### 2.6 Improve theme toggle clarity

The theme toggle at the bottom of the module switcher rail currently shows generic icons. Improve discoverability:

- Use clearer Lucide icons: `Sun` for light, `Moon` for dark, `Monitor` for system
- Show the *active* theme as the visible icon (when in dark mode, show Moon; clicking cycles to next)
- Tooltip on hover: "Theme: Dark (click to cycle)" — text dynamically reflects current theme
- Consider showing all three icons in a small segmented control instead of a single toggle, if rail width permits — explicit selection is clearer than cycling

**Recommendation:** Single-icon cycling toggle is fine; the improved icons + dynamic tooltip make it clear enough. A segmented control would take more rail space.

### 2.7 Verify sync status indicator behavior

Current behavior shows "Checking..." persistently. The indicator should:

- Show "Synced" with green dot when all integrations are healthy and last check was recent (<60s ago)
- Show "Syncing" with amber pulsing dot during active sync
- Show "Checking" only briefly during the 30-second-interval refresh
- Show "Issue" with red dot when an integration has an error
- Hover over indicator: shows last successful sync time per integration

**Verify:** The "Checking..." text shouldn't be the persistent state; "Synced" should be the default after initial check completes.

---

## 3. Codebase consistency check

After the renames, do a global search for these old terms and update them:

- `CRM` (uppercase or any case) → `People`
- `crm` (in routes, file names, type names) → `people`
- `Journal` (when used as the module name, not as a generic English word) → `Journals`
- `journal` (in routes, file names) → `journals`

Watch for these locations specifically:
- Module switcher component
- Command palette navigation actions
- Keyboard shortcut registry
- Settings page section labels (if any reference modules)
- Breadcrumbs
- Page titles in browser tabs
- Comments in code (less critical but worth catching)
- README and any documentation

Do NOT rename:
- The word "journal" when it appears in a generic context (e.g., "log journal entries" as a verb-like usage)
- Database column names that aren't yet created (no schema migration needed for Wave 2 amendments since no module entities exist yet)

---

## 4. Verification

The amendments are complete when:

1. The "N" Next.js dev indicator is gone
2. Search bar is center-aligned in the top bar
3. Capture button uses a Plus icon, sits adjacent to search, primary action styling
4. Clicking capture (or `⌘⇧I`) opens the modal as before
5. Module rail shows 6 icons in order: Tasks, Calendar, People, Notes, Journals, Documents
6. All keyboard shortcuts work: ⌘1 Tasks, ⌘2 Calendar, ⌘3 People, ⌘4 Notes, ⌘5 Journals, ⌘6 Documents
7. Routes work: `/tasks`, `/calendar`, `/people`, `/notes`, `/documents`, `/journals`, `/settings`
8. Old routes (`/crm`, `/journal`) redirect to new routes OR no longer exist (developer's choice; redirects are kinder)
9. Documents module shows the placeholder EmptyState
10. Theme toggle uses clear Sun/Moon/Monitor icons with dynamic tooltip
11. Sync status indicator shows "Synced" with green dot in normal state, not persistent "Checking..."
12. Command palette shows the correct module names ("Go to People" not "Go to CRM"; "Go to Journals" not "Go to Journal")
13. Keyboard shortcut cheat sheet (`⌘/`) shows updated shortcuts and module names
14. No TypeScript errors, ESLint passes
15. No leftover "CRM" or "Journal" (singular, as module name) references anywhere in user-visible UI

---

## 5. Out of scope

These amendments do NOT include:

- Building the Documents module (Phase 2)
- Building the Notes module (Wave 4)
- Adding multiple journals support (Phase 2 — Wave 7 ships with single default journal)
- Schema changes for People/Contact entity (Wave 6)
- Capture pipeline implementation (Wave 3a)
- Any product feature work

If you find yourself building any of these, stop. This is a focused amendment, not a new wave.

---

## 6. Final note

These changes are small individually but high-leverage cumulatively. They lock in the names and visual hierarchy that every future wave inherits. After this amendment, the shell is locked and Wave 3a can begin building Tasks against a stable foundation.

Begin with section 2.1.
