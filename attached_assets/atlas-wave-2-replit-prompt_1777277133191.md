# Replit Agent Prompt — Wave 2: Atlas App Shell

## Read this entire prompt before taking any action. Do not start coding until you have read all sections including the Rules of Engagement.

---

## 1. Wave 2 Overview

Wave 0 shipped the Stratum design system (41 components in Storybook). Wave 1 built the foundation layer (auth, database, Drive integration, AI abstraction, Object Storage, health dashboard).

**Wave 2 builds the signed-in app shell** — the actual UI a user sees when they sign in to Atlas. This is the chrome that every product module will sit inside. No product features are built in this wave; the goal is to get the shell architecturally right before any module is built on top of it.

**By end of Wave 2, signing in lands the user in a real-feeling Atlas application** — module switcher on the left, top bar with working controls, all 5 modules visible (4 as "Coming Soon" placeholders), settings working, command palette opens, theme switching works in the live app.

The user must be able to verify by clicking through the entire shell without seeing anything broken, missing, or fake-looking.

---

## 2. Stack (continuing from Waves 0-1)

No new dependencies expected. Wave 2 composes existing primitives:

- Stratum design system components (Wave 0)
- Auth, database, tRPC, Drive integration (Wave 1)
- Theme system via `next-themes`
- TanStack Query for server state
- Zustand for client state (introduce in this wave for command palette state, modal state, etc.)

If a new dependency seems needed, stop and ask before installing.

---

## 3. Wave 2 Deliverables

The wave is complete when ALL of the following exist and work:

### 3.1 Real app shell with routing

Replace the placeholder home page with the actual Atlas app shell. The structure when a user is signed in:

```
+-----+-------------------------------------------------------+
|  M  |  TOP BAR: search | capture | sync | user menu        |
|  o  +-------------------------------------------------------+
|  d  |                                                       |
|  u  |                                                       |
|  l  |              MODULE CONTENT AREA                      |
|  e  |                                                       |
|     |              (changes per active module)              |
|  s  |                                                       |
|  w  |                                                       |
|  i  |                                                       |
|  t  |                                                       |
|  c  |                                                       |
|  h  |                                                       |
|  e  |                                                       |
|  r  |                                                       |
|     |                                                       |
+-----+-------------------------------------------------------+
```

Routes to implement:
- `/` — redirects to `/tasks` (or last-visited module from a future preference)
- `/tasks` — Tasks module placeholder
- `/calendar` — Calendar module placeholder
- `/crm` — CRM module placeholder
- `/notes` — Notes module placeholder
- `/journal` — Journal module placeholder
- `/settings` — Settings (already exists from Wave 1, expand per 3.7)
- `/admin/health` — Health dashboard (already exists from Wave 1)

Use Next.js App Router with a `(app)` route group containing the AppShell layout. The shell is rendered once and persists across module navigation.

### 3.2 ModuleSwitcher (left rail, fixed)

Implement the ModuleSwitcher composed component from Stratum, wired to navigation:

- Vertical icon-only rail at left edge (~50px wide)
- 5 module icons (use Lucide icons): Tasks (`CheckSquare`), Calendar (`Calendar`), CRM (`Users`), Notes (`FileText`), Journal (`BookOpen`)
- Active module shows the active state per Stratum (likely a colored bar or filled background)
- Tooltip on hover shows module name + keyboard shortcut
- Keyboard shortcuts: `⌘1` Tasks, `⌘2` Calendar, `⌘3` CRM, `⌘4` Notes, `⌘5` Journal
- Below the modules, a small section divider, then: Settings icon (`Settings`) and Health icon (`Activity`) with their own tooltips/shortcuts
- Bottom of rail: theme toggle (sun/moon/system icons) — small affordance for quick theme switching without going to Settings

The ModuleSwitcher reads the current pathname to determine active state. Navigation uses Next.js `Link` (no full page reloads).

### 3.3 TopBar (top, full width minus rail)

Implement the TopBar:

- **Left section: page context** — shows current module name and current view name (e.g., "Tasks → Inbox"). Updates per module's internal state.
- **Center section: global search** — search input with `⌘K` indicator. Clicking opens the CommandPalette. Width caps around 400-500px so it doesn't dominate.
- **Right section, in order:**
  - Capture button (primary action, prominent) — opens a global capture modal (see 3.5)
  - Sync status indicator (see 3.4)
  - User menu (avatar with dropdown)

Top bar is 48-52px tall, sticky at top, uses `surface-raised` background.

### 3.4 Sync status indicator

Implement the sync status pattern from Stratum:

- Small dot (8-10px) with one of four states: synced (green), syncing (amber, animated pulse), idle (neutral gray), error (red)
- Click opens a popover showing:
  - Per-integration status: Drive (connected/syncing/error), AI (responsive/error), database (always synced if app is running)
  - Last sync time per integration
  - "Sync now" action that triggers manual sync
  - Recent errors if any (read from logs or a sync_events table — for Wave 2, can be a simple in-memory list reset on app restart; persistent sync event log is Wave 4 concern)
- For Wave 2: real sync activity is limited (no module data yet). The indicator should reflect actual states it can detect: Drive token validity, AI test endpoint reachability, database connectivity.
- Auto-refreshes every 30 seconds via TanStack Query

### 3.5 Capture button and global capture modal

The capture button in the top bar opens a global capture modal:

- Triggered by button click OR `⌘⇧I` keyboard shortcut anywhere in the app
- Modal is small, centered, with a single text input and a textarea-like grow behavior
- Header: "Quick capture"
- Hint text below: "Capture anything. We'll route it to the right place."
- For Wave 2: the modal exists, accepts text, and on submit shows a toast "Captured to inbox (will be processed in Wave 3)" — does NOT yet write to a real Inbox table because Tasks module doesn't exist
- The modal uses the Stratum Dialog primitive
- `Esc` closes; `⌘Enter` submits; tab order is correct

The capture pipeline (route to actual inbox, AI parse, etc.) is Wave 3 work. Wave 2 builds the entry point only.

### 3.6 CommandPalette wired globally

The CommandPalette composed component from Stratum is wired to open globally:

- `⌘K` from anywhere opens it
- It searches a registry of registered actions and entities
- For Wave 2, the registry contains:
  - **Navigation actions**: "Go to Tasks", "Go to Calendar", "Go to CRM", "Go to Notes", "Go to Journal", "Go to Settings", "Go to Health"
  - **App actions**: "Sign out", "Switch theme", "New capture", "View keyboard shortcuts"
  - **Search results**: empty for Wave 2 (no entities to search yet); show "Search results will appear here once you have content"
- Recent items section appears empty in Wave 2 with placeholder "Your recent items will appear here"
- The registry must be designed as a pluggable system — modules in future waves register their own actions and search providers without modifying the palette code

This last point is critical: the registry pattern needs to be extensible. Implement it as a context-based registry where modules call `registerCommands([...])` and `registerSearchProvider({ id, search: async (query) => ... })`. Wave 3+ will plug into this.

### 3.7 Settings page expansion

Wave 1 created a basic Settings page. Expand it now to its full Phase 1 structure:

- **Profile** (already built in Wave 1)
  - Name, email (read-only), timezone, date format, time format, week start
- **Appearance** (new)
  - Theme: dark / light / system
  - (Future: density, font preferences — placeholder section noted "Coming in future updates")
- **Capture** (new)
  - Email-to-inbox address (placeholder for now: "Available in Wave 3")
  - Default inbox project (placeholder)
- **Integrations** (extend Wave 1's basic Drive section)
  - Google Drive: linked status, folder path, change folder, unlink
  - Google Calendar: "Coming in Wave 5" placeholder
  - Google Contacts: "Coming in Wave 6" placeholder
  - Resend (email-to-inbox): "Coming in Wave 3" placeholder
- **AI** (new)
  - AI features: master toggle (default on)
  - Show recent AI calls: link to a small AI activity view
  - Estimated monthly cost: simple aggregate from AICallLog (sum of `estimated_cost_usd` this month)
  - Per-task model overrides: "Available in future updates" placeholder
- **Backups** (new)
  - Last database backup time (read from backup log — for Wave 2, may be "No backups yet" until Wave 4 sets up the runner)
  - Drive backup folder path (read from DriveConfig)
  - Manual backup button (placeholder, disabled until Wave 4)
- **Data** (new)
  - Export all data (placeholder, disabled until Wave 8)
  - Trash (link to global Trash view — for Wave 2, this is a placeholder page)
- **Account** (new)
  - Sign out
  - (Future: delete account)

Use a left-side sub-navigation within the Settings page (vertical sidebar listing the sections, content area showing the active section). This is a common settings pattern; Stratum's TwoPaneLayout component supports it.

### 3.8 User menu

Top-right user menu (DropdownMenu from Stratum):

- Trigger: avatar (or initials fallback) showing the signed-in user
- Menu contents:
  - Header section: name, email
  - "Settings" → navigates to /settings
  - "Health" → navigates to /admin/health
  - "Keyboard shortcuts" → opens the cheat sheet overlay (3.9)
  - Separator
  - "Sign out" → signs out, redirects to /sign-in

### 3.9 Keyboard shortcut cheat sheet

`⌘/` opens a global overlay showing all registered keyboard shortcuts:

- Modal/Dialog with a search input at top
- Sections grouped by category: Navigation, Actions, Modules, Editing
- Each shortcut shown with the action label and the keycap-style display (Stratum's KeyboardShortcut component)
- For Wave 2, populate with these:
  - `⌘K` — Open command palette
  - `⌘/` — Show keyboard shortcuts (this overlay)
  - `⌘1` through `⌘5` — Switch modules
  - `⌘,` — Open Settings
  - `⌘⇧I` — Quick capture
  - `Esc` — Close current overlay/modal
- Future waves register more shortcuts; the system is designed so adding shortcuts to the cheat sheet is automatic when registered

### 3.10 Toast notification system wired globally

Use Stratum's Toast component, integrated app-wide:

- Position: bottom-right
- Stack with newest on top, max 3 visible
- Variants: info, success, warning, error
- Default duration 4s, hover to pause
- Toasts triggered from anywhere in the app via a `useToast()` hook or similar

For Wave 2, toasts surface for:
- Sign-in success ("Welcome back, [name]")
- Sign-out success
- Theme changes
- Capture submission ("Captured to inbox")
- Drive sync status changes
- Errors from any tRPC procedure

### 3.11 Inspector panel pattern available globally

Stratum's InspectorPanel component is available as a slot in the AppShell:

- Right-side slide-in panel
- For Wave 2, no module uses it yet (no entities to inspect), but the slot exists and is properly architected
- A test affordance can exist temporarily on the placeholder pages: a button that opens an inspector with placeholder content "Inspector will show entity details here" — confirms the slot works
- Pinning behavior implemented (pinned panel stays open across navigation)

### 3.12 Theme switching in the live app

Wave 0 set up Storybook theming. Wave 2 ensures it works in the live app:

- Theme toggle in the bottom of ModuleSwitcher
- Theme toggle in Settings → Appearance
- Theme toggle in user menu
- All three control the same state (next-themes)
- No flash on page load
- System theme correctly follows OS preference when selected

### 3.13 Module placeholder pages

For Tasks, Calendar, CRM, Notes, Journal — build a placeholder page each:

- Uses the AppShell layout
- Page header with module name and Lucide icon
- Centered empty state component (Stratum EmptyState):
  - Icon
  - Headline: "[Module name] — coming in Wave [X]"
  - Body: brief description of what the module will do
  - No action button (or a disabled "Notify me" button as visual placeholder)

These pages are intentionally minimal. Their job is to confirm navigation works, the shell renders correctly, and nothing breaks. They will be fully replaced in their respective module waves.

### 3.14 Trash placeholder page

`/settings/trash` (or `/trash` accessible from Settings → Data → Trash):

- Page header "Trash"
- Empty state: "Deleted items will appear here for 30 days before permanent removal"
- For Wave 2, no entities exist to trash, so this is a structural placeholder

### 3.15 Health dashboard refresh

The `/admin/health` page from Wave 1 should now use the proper AppShell layout (it was previously standalone). Adapt it to fit inside the shell while keeping all its existing functionality.

---

## 4. File Structure (additions to Wave 1)

```
/atlas
  /app
    /(app)
      /layout.tsx                       # AppShell layout
      /tasks/page.tsx                   # Placeholder
      /calendar/page.tsx                # Placeholder
      /crm/page.tsx                     # Placeholder
      /notes/page.tsx                   # Placeholder
      /journal/page.tsx                 # Placeholder
      /settings
        /page.tsx                       # Settings shell with sub-nav
        /profile/page.tsx
        /appearance/page.tsx
        /capture/page.tsx
        /integrations/page.tsx
        /ai/page.tsx
        /backups/page.tsx
        /data/page.tsx
        /account/page.tsx
      /trash/page.tsx
      /admin/health/page.tsx            # Refreshed to use AppShell
  /components
    /shell
      app-shell.tsx                     # Root shell layout
      module-switcher-wired.tsx         # Wired version of Stratum's ModuleSwitcher
      top-bar.tsx                       # Composed top bar
      user-menu.tsx                     # User menu dropdown
      capture-modal.tsx                 # Quick capture modal
      command-palette-wired.tsx         # Wired version of Stratum's CommandPalette
      sync-status.tsx                   # Sync status indicator + popover
      keyboard-shortcuts-overlay.tsx    # ⌘/ cheat sheet
  /core
    /commands                           # Command registry system
      registry.ts
      types.ts
      hooks.ts
    /shortcuts                          # Keyboard shortcuts registry
      registry.ts
      hooks.ts
    /toast                              # Toast manager (if not already provided by Stratum)
  /lib
    /navigation.ts                      # Module list, paths, icons, shortcuts
```

---

## 5. Verification (Definition of Done)

Wave 2 is complete when the user can perform this verification flow:

1. Sign in to Atlas
2. Land on `/tasks` (or wherever default redirect points)
3. See the AppShell: ModuleSwitcher on left, TopBar at top, content area showing "Tasks — coming in Wave 3" placeholder
4. Click Calendar icon (or press `⌘2`) → navigates to /calendar without page reload, shell persists
5. Click each other module → confirm all 5 modules load and shell stays consistent
6. Click Settings icon (or press `⌘,`) → Settings page opens with sub-nav showing all sections
7. Navigate through each Settings section → no broken pages
8. Toggle theme via ModuleSwitcher bottom toggle → theme switches without flash
9. Toggle theme via Settings → Appearance → confirms same state
10. Press `⌘K` → CommandPalette opens with navigation actions visible
11. Type "calendar" in palette → "Go to Calendar" appears
12. Press Enter → navigates to Calendar
13. Press `⌘/` → keyboard shortcut cheat sheet appears with all registered shortcuts
14. Click capture button (or press `⌘⇧I`) → capture modal opens
15. Type something, press `⌘Enter` → toast appears "Captured to inbox (will be processed in Wave 3)"
16. Click sync status indicator → popover shows Drive (connected), AI (responsive), database (connected)
17. Click user menu → see name, email, Settings/Health/Shortcuts/Sign out
18. Click "Sign out" → signs out, lands on /sign-in
19. Sign in again → lands back in app, theme preference persisted
20. Open `/admin/health` → renders inside AppShell, all green checks (from Wave 1)

When all 20 steps pass, Wave 2 is complete.

---

## 6. Rules of Engagement (continued from Waves 0-1)

All previous rules continue to apply. Adding for Wave 2:

### 6.1 Don't reinvent Stratum components

The 41 components from Wave 0 are the source of truth for visual primitives. Wave 2 *composes* and *wires* them, never re-implements them. If you need a button, import from `/components/ui/button`. If you find yourself styling a button from scratch in shell code, stop — you're working against the design system.

### 6.2 Composed shell components live in /components/shell

Distinct from `/components/ui` (Stratum primitives) and `/components/composed` (Stratum composed components). Shell components are the *wired-to-app* versions: ModuleSwitcher knows about modules, TopBar knows about sync state, etc. The Stratum versions are pure UI; the shell versions are connected.

### 6.3 Registry patterns must be extensible

The command registry (3.6) and keyboard shortcuts registry (3.9) must be designed as plugin systems. Future modules will register their own commands and shortcuts. The registry's API should be: register on mount, unregister on unmount, query for active items. Hard-coding everything in Wave 2 means future waves break encapsulation.

### 6.4 No product entities in Wave 2

Do not create database tables for Task, Project, Note, JournalEntry, Contact, etc. Those come in their respective module waves. Capture modal does NOT write to a real Inbox table. Search returns empty. Autocomplete has no data. This is intentional — Wave 2 is shell only.

### 6.5 Placeholder discipline

Placeholder pages are placeholders, not partial implementations. Don't accidentally start building the Tasks module. The placeholder shows EmptyState with "Coming in Wave 3" — that's it. If you find yourself adding fields, lists, or features to a placeholder page, stop.

### 6.6 Keyboard navigation matters

Every interactive element added in Wave 2 must be reachable by keyboard. Tab order must be logical. Modals must trap focus. Esc must close. Enter must activate. This is non-negotiable shell behavior; bad keyboard UX in the shell poisons every module.

### 6.7 Performance budgets apply

Module switching must be sub-200ms perceived. CommandPalette must open in under 100ms. Theme toggle must be instant. If something feels sluggish, fix it before claiming done.

### 6.8 Mobile responsiveness check

The shell must remain usable on a tablet-width viewport (iPad, ~768px). Mobile-specific optimizations (bottom tab bar, full-screen modals, etc.) are Phase 2, but the shell shouldn't break at smaller widths. Test by resizing browser; nothing should overlap or become unreadable.

---

## 7. Recommended Build Sequence

Build in this order:

1. **Routing structure** — set up `(app)` route group, layout file, all 5 module placeholder pages, updated /admin/health
2. **AppShell layout** — basic frame with module rail slot and top bar slot, content area
3. **ModuleSwitcher (wired)** — full nav working, keyboard shortcuts, active states
4. **TopBar** — basic structure with all four sections (left context, center search, right actions)
5. **User menu** — dropdown wired to auth, theme toggle inline
6. **Theme switching** — ensure works in live app, no flash, three control points consistent
7. **Toast system** — global provider, hook, success/error variants tested
8. **Command registry + CommandPalette** — registry pattern, navigation actions, search shell (empty results)
9. **Keyboard shortcuts registry + cheat sheet** — registry pattern, ⌘/ overlay
10. **Sync status indicator** — popover, real status checks
11. **Capture modal** — global trigger, modal UI, fake submission with toast
12. **Inspector panel slot** — available in AppShell, demonstrated on placeholder
13. **Settings page expansion** — all sections, sub-nav, real and placeholder content per spec
14. **Trash placeholder page**
15. **Final verification** — walk through all 20 steps in section 5

Each step concludes with the user being able to verify it works.

---

## 8. Definition of Done

Wave 2 is complete when:

- [ ] Routing structure with /tasks, /calendar, /crm, /notes, /journal, /settings, /trash, /admin/health
- [ ] AppShell renders consistently across all routes
- [ ] ModuleSwitcher works with click and keyboard shortcuts
- [ ] TopBar shows context, search, capture, sync, user menu
- [ ] Theme switching works in 3 places (rail, settings, user menu) with consistent state
- [ ] Theme persists across sign-out/sign-in
- [ ] CommandPalette opens with ⌘K, navigation actions work
- [ ] Command registry is extensible (register/unregister API)
- [ ] Keyboard shortcuts cheat sheet opens with ⌘/
- [ ] Shortcut registry is extensible
- [ ] Capture modal opens, submits, shows toast
- [ ] Sync status indicator shows real states
- [ ] User menu shows name, email, navigation, sign-out
- [ ] All 5 module placeholders render with EmptyState
- [ ] Settings page has all 8 sections with proper content/placeholders
- [ ] Trash placeholder page exists
- [ ] Inspector panel slot demonstrated working
- [ ] Toast system globally available
- [ ] /admin/health uses AppShell
- [ ] No TypeScript errors, ESLint passes
- [ ] All 20 verification steps pass
- [ ] No product entities created in this wave
- [ ] Tablet-width (768px) renders without breakage

---

## 9. What is NOT in Wave 2

Do not build any of the following:

- Task, Project, Note, JournalEntry, Contact entities or features
- Real capture pipeline (just the entry point modal)
- Real search (just empty state in command palette)
- Real autocomplete data for @, #, [[
- Email-to-inbox endpoint (Wave 3)
- Calendar Google sync (Wave 5)
- Contacts Google sync (Wave 6)
- Markdown editor (Wave 4)
- Knowledge graph (Wave 4)
- Backup runner (Wave 4)
- Mobile-specific UI (Phase 2)
- Onboarding flow (Wave 8 polish)

---

## 10. Final note

Wave 2 is the chrome that everything else lives inside. If the shell feels right, modules feel right. If the shell is awkward, every module inherits the awkwardness.

Take time on the small details: keyboard navigation, focus management, theme persistence, sync indicator behavior, command palette responsiveness. These are 80% of perceived app quality.

When in doubt: **ask before assuming. Verify before declaring done.**

Begin with section 7, step 1.
