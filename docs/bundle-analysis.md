# Bundle Analysis — Atlas Client-Side Chunks

**Date:** 2026-05-01  
**Build command:** `ANALYZE=true npm run build`  
**Tool:** `@next/bundle-analyzer` (webpack treemap)  
**Reports:** `.next/analyze/client.html` · `.next/analyze/nodejs.html` · `.next/analyze/edge.html`

---

## Overall Totals (Client Bundle)

| Metric                | Size           |
| --------------------- | -------------- |
| Stat (raw source)     | 5,081.6 kB     |
| **Parsed (minified)** | **1,693.6 kB** |
| **Gzip**              | **509.3 kB**   |
| Total chunks          | 94             |

---

## Top 5 Heaviest Client-Side Chunks

Sizes are **parsed (minified)** unless stated otherwise.

### 1. `framework-eb01910c14cf9a8b.js` — 185.3 kB (58.4 kB gzip)

React + scheduler runtime, bundled by Next.js as the shared framework chunk. Fully vendor-controlled; cannot be reduced without changing the React version. **No action available.**

### 2. `4bd1b696-182b6b13bdad92e3.js` — 169.0 kB (53.0 kB gzip)

React-DOM client-side render entry (`react-dom/cjs`). Ships alongside the framework chunk. **No action available.**

### 3. `1255-47f39d486ee86e84.js` — 168.6 kB (44.6 kB gzip)

Next.js router and navigation internals (165.0 kB of `next/dist`). Loaded on all routes. **No action available** without upgrading Next.js.

### 4. `main-136dc5f18fcbcd01.js` — 124.8 kB (36.2 kB gzip)

Next.js bootstrap/main chunk. Framework-managed. **No action available.**

### 5. `2041-10a38f4e1ef261c5.js` — **118.2 kB (31.3 kB gzip)** ⚠️ Optimization candidate

Clerk authentication library. This shared async chunk loads on every client navigation. The two largest sub-bundles are the Clerk React UI components and the shared Clerk runtime — neither is needed until the user interacts with auth UI.

| Sub-bundle                   | Size    |
| ---------------------------- | ------- |
| `@clerk/react/dist`          | 65.3 kB |
| `@clerk/shared/dist/runtime` | 52.7 kB |

**Opportunity:** If `<ClerkProvider>` or any Clerk hooks are imported at the root layout, all routes pay the full Clerk cost upfront. Moving auth-gating to server components and lazy-loading Clerk's UI-facing modules could reduce the initial load by ~65 kB.

---

## Top 5 Heaviest Named Route Chunks

These load only when a user visits that specific route.

| Rank | Route                        | Parsed  | Gzip    | Primary driver                                                       |
| ---- | ---------------------------- | ------- | ------- | -------------------------------------------------------------------- |
| 1    | `settings/page`              | 64.2 kB | 13.7 kB | `settings-client.tsx` + 6 concatenated modules (61.2 kB total)       |
| 2    | `(app)/layout`               | 42.1 kB | 11.2 kB | `app-shell-provider.tsx` + 15 modules (34.2 kB), sidebar UI (5.5 kB) |
| 3    | `media/page`                 | 31.5 kB | 8.7 kB  | Media components (20.7 kB) + attachments (4.2 kB)                    |
| 4    | `tasks/tags/manage/page`     | 24.3 kB | 6.2 kB  | `tag-management.tsx` (17.2 kB) + UI primitives (6.2 kB)              |
| 5    | `tasks/contexts/manage/page` | 15.6 kB | 4.5 kB  | Context management UI                                                |

---

## Other Notable Shared Chunks

### `340-938d13c7f442f31c.js` — **96.4 kB (22.1 kB gzip)** ⚠️ Biggest app-code opportunity

The largest chunk made entirely of application source code. It bundles the task shell and 19 other task components into a single concatenation group.

**Full module breakdown (80 kB concatenation group):**

| Module                                                                    | Size    |
| ------------------------------------------------------------------------- | ------- |
| `task-inspector.tsx`                                                      | 18.3 kB |
| `inbox-processing-suggestions.tsx`                                        | 15.2 kB |
| `tasks-sidebar.tsx`                                                       | 6.3 kB  |
| `recurrence-form.tsx`                                                     | 6.3 kB  |
| `hierarchy-audit-banner.tsx`                                              | 6.0 kB  |
| `task-inspector-attachments.tsx`                                          | 5.8 kB  |
| `checklist-section.tsx`                                                   | 3.5 kB  |
| `task-inspector-activity-tab.tsx`                                         | 3.3 kB  |
| `worklog-entry.tsx`                                                       | 2.2 kB  |
| `subtask-row.tsx`                                                         | 2.0 kB  |
| `subtask-section.tsx`                                                     | 1.6 kB  |
| `worklog-create-form.tsx`                                                 | 1.5 kB  |
| `context-add-form.tsx`                                                    | 1.1 kB  |
| sidebar components (`tags-section`, `section-header`, `contexts-section`) | 3.8 kB  |

**Opportunity:** The task inspector (18.3 kB), inbox suggestions panel (15.2 kB), recurrence form (6.3 kB), and hierarchy audit banner (6.0 kB) are only shown after user interaction. Wrapping them with `next/dynamic` would split ~46 kB out of this shared chunk into smaller on-demand pieces.

### `9914-cb237a982171df8d.js` — 77.9 kB (21.8 kB gzip)

tRPC + TanStack Query runtime. Core data-fetching infrastructure paid on every route.

| Sub-bundle                    | Size    |
| ----------------------------- | ------- |
| `@trpc/react-query`           | 34.2 kB |
| `@trpc/client`                | 20.7 kB |
| `@tanstack/query-core`        | 18.6 kB |
| `@trpc/server` (shared types) | 3.8 kB  |

**No meaningful action** — these are essential infrastructure libraries. Newer versions of tRPC v11 and TanStack Query v5 are already in use.

### `5516-51edbaab904fe884.js` — **54.3 kB (16.4 kB gzip)** ⚠️ Quick win

| Package                    | Size    | Notes                                                         |
| -------------------------- | ------- | ------------------------------------------------------------- |
| `rrule`                    | 43.7 kB | Recurrence rule engine — only needed in the recurrence editor |
| `lucide-react` icons       | 5.9 kB  | 25 icons pulled into a shared chunk (see below)               |
| `@radix-ui/react-checkbox` | 3.4 kB  |                                                               |
| `date-fns`                 | 1.1 kB  |                                                               |

**rrule opportunity:** `rrule` (43.7 kB) is needed only when a user opens the recurrence editor. It is currently imported in `recurrence-form.tsx` which is statically bundled. Wrapping `RecurrenceForm` with `next/dynamic` (or dynamically importing `rrule` inside the form) would remove 43.7 kB from every initial load — the single largest quick win in the bundle.

**Lucide icons opportunity:** 25 icons appear in this shared chunk, suggesting a component that is co-located with the `rrule`/`rrule-helpers` import is pulling in icon imports. The 25 icons totalling 5.9 kB landed here because `optimizePackageImports` for `lucide-react` is configured, but a barrel import somewhere is defeating the tree-shaking. The icons are: `palette`, `sparkles`, `sunrise`, `grip-vertical`, `tag`, `zoom-in`, `paperclip`, `hash`, `folder-open`, `download`, `eye`, `triangle-alert`, `zoom-out`, `upload`, `settings-2`, `circle-alert`, `rotate-ccw`, `clock`, `loader-circle`, `chevron-right/left/down/up`, `check`, `minus`. Tracing which component imports these alongside `rrule` or `rrule-helpers.ts` and converting to named imports would fix the placement.

### `886-d19cf874c2d4dae0.js` — 44.3 kB (13.6 kB gzip)

Radix UI dropdown menu + floating UI + scroll lock utilities. These load whenever any dropdown is rendered. Shared across the app — not a splitting candidate.

| Sub-bundle                                     | Size    |
| ---------------------------------------------- | ------- |
| `@radix-ui/react-dropdown-menu` + `react-menu` | 28.9 kB |
| `react-remove-scroll` + deps                   | 9.9 kB  |
| `@radix-ui/react-focus-scope`                  | 3.2 kB  |

### `8720-1a27e2f69afa3d88.js` — 32.4 kB (9.0 kB gzip)

`sonner` toast library (32.3 kB). Loaded globally since toast notifications can appear on any route. Reasonable size for a notification library; no splitting opportunity.

### `74-5e9dcdfe8fa23d5b.js` — 30.5 kB (11.4 kB gzip)

Radix UI popover positioning (floating-ui core + dom + react-dom = 21.9 kB) + dismissable layer. Used by popovers, tooltips, and selects across the app. Shared infrastructure — not a splitting candidate.

### `3162-b55aed26eadcf81e.js` — 25.4 kB (6.8 kB gzip)

Task list item UI — `task-list-item.tsx` (9.5 kB), `task-row-quick-actions.tsx` (10.6 kB), and `recurrence-quick-popover.tsx` (2.5 kB). Loaded as soon as any task list is shown. Reasonable.

### `8997-bf3df993f110105f.js` — 21.6 kB (6.3 kB gzip)

`date-fns` formatting and locale data (20.5 kB). Shared across the app wherever dates are displayed. Not a splitting candidate.

### `4909-60c88923efbb24ad.js` — 19.7 kB (6.2 kB gzip)

`tailwind-merge` utility (19.2 kB). Used in every component via `cn()`. Not reducible.

---

## Code-Splitting Opportunities (Prioritized)

| Priority   | Opportunity                                                                                                     | Target file(s)                                                                        | Est. saving                 |
| ---------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------- |
| **High**   | Lazy-load `RecurrenceForm` with `next/dynamic` to move `rrule` (43.7 kB) out of the shared chunk                | `src/components/tasks/recurrence-form.tsx`, `src/components/tasks/task-inspector.tsx` | ~44 kB from shared chunk    |
| **High**   | Lazy-load `TaskInspector` (18.3 kB) and `InboxProcessingSuggestions` (15.2 kB) — both only shown on interaction | `src/components/tasks/tasks-shell.tsx`                                                | ~33 kB from shared chunk    |
| **High**   | Lazy-load `HierarchyAuditBanner` (6.0 kB) and `TaskInspectorAttachments` (5.8 kB)                               | `src/components/tasks/tasks-shell.tsx`                                                | ~12 kB from shared chunk    |
| **Medium** | Audit Clerk loading — defer `@clerk/react` client bundle until auth UI is needed                                | Root layout / `ClerkProvider` usage                                                   | ~65 kB on initial load      |
| **Medium** | Trace which component co-locates 25 lucide icon imports alongside `rrule-helpers.ts` and fix barrel imports     | Likely `src/components/tasks/recurrence-form.tsx` or nearby                           | ~6 kB misplacement          |
| **Low**    | Split `settings-client.tsx` (61.2 kB) by settings section using tabs + `next/dynamic`                           | `src/app/(app)/settings/settings-client.tsx`                                          | ~30–40 kB on settings entry |

---

## Methodology

- All sizes are **parsed (minified)** from webpack stats. Gzip shown separately.
- Shared async chunks (numbered hashes like `340-...`) load on-demand when any route that imports those modules is first visited, then are cached.
- Route-specific page chunks (named `app/(app)/...`) load only when that route is visited.
- Full interactive treemaps are in `.next/analyze/client.html`, `nodejs.html`, `edge.html` — open in a browser to explore.
- Re-run `ANALYZE=true npm run build` after each optimization and update this file with before/after deltas.
