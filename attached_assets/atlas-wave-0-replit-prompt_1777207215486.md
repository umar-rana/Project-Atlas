# Replit Agent Prompt — Wave 0: Atlas Project Bootstrap & Design System

## Read this entire prompt before taking any action. Do not start coding until you have read all sections including the Rules of Engagement.

---

## 1. Project Overview

You are bootstrapping **Atlas**, a personal productivity command center web application. This prompt covers **Wave 0** only — project setup, infrastructure, and the complete design system / component library. **No product features will be built in this wave.**

The output of Wave 0 is a fully configured Next.js project with a complete, themeable component library, ready for subsequent waves to build features on top of.

---

## 2. Hard Stack Requirements (non-negotiable)

You will use **exactly** the following stack. Do not substitute alternatives, do not suggest "simpler" options, do not start with React + Express defaults:

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 14+ with App Router** | Not Pages Router. Not Create React App. Not Vite. |
| Language | **TypeScript** | Strict mode enabled |
| Styling | **Tailwind CSS** | With CSS variables for design tokens |
| Component base | **shadcn/ui** | Copy-paste components, not a dependency |
| State (server) | **TanStack Query (React Query) v5** | |
| State (client) | **Zustand** | |
| API layer | **tRPC v11** | With Zod for validation |
| ORM | **Prisma** | (configured in Wave 0, schema in Wave 1) |
| Database | **Postgres on Neon** | Connection string via env var |
| Auth | **Auth.js (NextAuth) v5** | (installed in Wave 0, configured in Wave 1) |
| Forms | **React Hook Form + Zod** | |
| Icons | **Lucide React** | |
| Date library | **date-fns + date-fns-tz** | Not Moment. Not Day.js. |
| Logging | **Pino** | Structured JSON logs |
| Component dev | **Storybook 8+** | With Next.js integration |
| Testing | **Vitest + React Testing Library** | (foundational only in Wave 0) |

If Replit's default project template uses different choices, **override them**. Do not start with React + Express. Do not start with Vite. Start with `npx create-next-app@latest` using the App Router.

---

## 3. Wave 0 Deliverables

The wave is complete when ALL of the following exist and work:

### 3.1 Project bootstrap
- Next.js 14+ project initialized with App Router and TypeScript (strict)
- Tailwind CSS configured with custom theme extending design tokens
- ESLint + Prettier configured
- `package.json` scripts: `dev`, `build`, `start`, `lint`, `type-check`, `storybook`, `build-storybook`
- `.env.example` file with all expected environment variables documented
- `.gitignore` correctly excluding `.env`, `node_modules`, `.next`, build artifacts
- README.md with project setup instructions

### 3.2 Design tokens implementation

Implement the complete design token system in `app/globals.css` and `tailwind.config.ts`. Tokens are CSS variables; Tailwind references them.

**Required token categories** (every token must exist for both dark and light themes):

#### Surface tokens
```
--surface-base
--surface-raised
--surface-overlay
--surface-sunken
--surface-hover
--surface-active
--surface-selected
--surface-selected-hover
```

#### Border tokens
```
--border-subtle
--border-default
--border-strong
--border-focus
--border-error
```

#### Text tokens
```
--text-primary
--text-secondary
--text-tertiary
--text-disabled
--text-on-accent
--text-on-emphasis
--text-link
--text-link-hover
```

#### Accent tokens (semantic)
```
--accent-primary
--accent-primary-hover
--accent-primary-active
--accent-primary-muted
--accent-primary-subtle
--accent-success
--accent-success-muted
--accent-warning
--accent-warning-muted
--accent-danger
--accent-danger-muted
--accent-info
--accent-info-muted
--accent-neutral
--accent-neutral-muted
```

#### Data visualization palette
8 perceptually distinct hues, each with light/default/strong shades, working in both themes.

#### Tag/pill color families
Three distinct visual families (Format / Purpose / Tags) with different visual treatments.

#### Calendar event colors
12 distinct calendar colors with filled, soft, and border variants.

#### Status tokens
```
--status-active
--status-pending
--status-on-hold
--status-blocked
--status-complete
--status-cancelled
--status-archived
```

**Color values:**
Use **OKLCH color space** for all definitions to ensure perceptual lightness consistency. Document the OKLCH values in comments alongside hex fallbacks.

**Theme switching:**
Dark mode is default. Light mode must be a single CSS class swap on `<html>` (e.g., `class="light"` overrides defaults). No JavaScript required for theme to render correctly on first paint.

### 3.3 Typography system

Configure in `tailwind.config.ts` and provide typography classes:

**Fonts:**
- UI: Inter (variable font from Google Fonts via `next/font`)
- Reading: Source Serif 4 or Newsreader (loaded via `next/font`)
- Mono: JetBrains Mono (loaded via `next/font`)

**Type scale** — exact specifications:
| Token | Size | Line height | Letter spacing | Weight |
|---|---|---|---|---|
| text-2xs | 11px | 1.4 | 0.01em | 400 |
| text-xs | 12px | 1.4 | 0.005em | 400 |
| text-sm | 13px | 1.5 | 0 | 400 (DEFAULT BODY) |
| text-base | 14px | 1.5 | 0 | 400 |
| text-md | 15px | 1.5 | 0 | 500 |
| text-lg | 17px | 1.4 | -0.005em | 600 |
| text-xl | 20px | 1.3 | -0.01em | 600 |
| text-2xl | 24px | 1.3 | -0.015em | 600 |
| text-3xl | 32px | 1.2 | -0.02em | 700 |

**Reading mode scale** (for long-form content):
| Token | Size | Line height |
|---|---|---|
| reading-body | 16px | 1.7 |
| reading-h1 | 28px | 1.3 |
| reading-h2 | 22px | 1.35 |
| reading-h3 | 18px | 1.4 |

**Tabular numerics:** define a `.tabular-nums` utility class using `font-feature-settings: "tnum"`.

### 3.4 Spacing, radius, elevation, motion tokens

Implement all of:
- **Spacing scale** (8-point grid with half-steps): 0, 1, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96 (in pixels) — exposed via Tailwind
- **Radius scale**: none, xs (2), sm (4), md (6), lg (8), xl (12), 2xl (16), full (9999)
- **Elevation system**: 6 levels (0-5) with shadow definitions for both themes
- **Motion durations**: instant (80ms), fast (120ms), medium (180ms), slow (280ms), deliberate (400ms)
- **Motion easings**: standard, out, in, spring (with cubic-bezier values from system spec)

All as Tailwind utilities AND CSS variables.

### 3.5 Component library

Build the following components in `/components/ui/`. Each must:
- Use design tokens, never hardcoded colors or sizes
- Be fully keyboard-accessible (proper focus management, ARIA attributes)
- Have a Storybook story demonstrating all variants and states
- Be typed with TypeScript (no `any` types)
- Support both themes without code changes

**Foundational primitives** (build these first, in this order):

1. **Button** — variants: primary, secondary, ghost, destructive; sizes: sm, md, lg; states: default, hover, active, focus, disabled, loading
2. **IconButton** — variants and sizes matching Button; with required `aria-label`
3. **Input** — text input with optional left icon, right icon/action, prefix, suffix; sizes sm/md; states including error
4. **Textarea** — auto-grow variant
5. **Label** — form label primitive
6. **Checkbox** — sm/md
7. **Radio** + RadioGroup
8. **Switch** — toggle
9. **Select** — single-select dropdown
10. **Avatar** — sizes xs/sm/md/lg/xl with image and initials fallback, status dot variant
11. **AvatarStack** — overlapping avatars with overflow count
12. **Badge** — count badge and dot indicator
13. **Tag** — three families (Format / Purpose / FreeFormTag) with distinct visual treatments; removable variant
14. **StatusPill** — colored pill mapped to status tokens
15. **Card** — default and interactive (hoverable), with header/body/footer slots
16. **Separator** — horizontal and vertical, with optional label
17. **Skeleton** — loading placeholders for text, card, avatar, list patterns
18. **Spinner** — sizes sm/md/lg
19. **Progress** — bar (determinate/indeterminate) and ring
20. **Tooltip** — with optional shortcut hint, configurable delay
21. **KeyboardShortcut** — keycap-style display for `Cmd+K`-style shortcuts

**Overlay primitives:**

22. **Popover**
23. **DropdownMenu** — with sections, dividers, icons, keyboard shortcuts shown
24. **ContextMenu** — right-click menu
25. **Dialog** (modal) — sizes sm/md/lg/xl
26. **AlertDialog** — for destructive confirmations
27. **Drawer** — slide-in panel from right or left, with pin/unpin
28. **Toast / Sonner** — info/success/warning/error variants

**Composed components** (build in `/components/composed/`):

29. **CommandPalette** — `Cmd+K` palette with categorized results, keyboard navigation, recent items section
30. **ReferenceAutocomplete** — generic autocomplete primitive (used for `@`, `#`, `[[`, `/` triggers); accepts a `triggerChar` prop and `searchFn` callback
31. **MentionPill** — inline display of `@person` references in rendered text
32. **TagPill** — inline display of `#tag` references
33. **EntityLink** — inline display of `[[entity]]` references
34. **EmptyState** — three variants: first-run, filtered-empty, error-empty
35. **InspectorPanel** — slide-in right panel with header, content area, footer; pinnable

**Layout primitives** (build in `/components/layout/`):

36. **AppShell** — top-level layout with module switcher, top bar slot, main slot, optional inspector slot
37. **ModuleSwitcher** — fixed left rail, vertical icon-only navigation with tooltips
38. **TopBar** — global header with search, capture, sync status, user menu slots
39. **ThreePaneLayout** — sidebar / main / inspector with resizable splitters
40. **TwoPaneLayout** — sidebar / main with resizable splitter
41. **PageHeader** — title, optional subtitle, breadcrumb, action slot

**Note: data tables, calendar grids, kanban, charts, and editor primitives are deferred to the wave that needs them** to keep Wave 0 scoped. They will reference the same design tokens when built.

### 3.6 Theme switcher

Implement a working theme switcher in Settings (or temporarily in the Storybook header). Must support: dark, light, system (follows OS preference). Must persist to localStorage. Must apply without flash on page load (use the standard `next-themes` library).

### 3.7 Storybook

Storybook 8+ configured for Next.js, with:
- A story file for every component (`.stories.tsx`)
- Each story demonstrates all variants, sizes, and states
- Theme toolbar showing components in both dark and light themes
- Stories organized by category: Primitives, Composed, Layout
- Runs via `npm run storybook`
- Builds to static via `npm run build-storybook`

### 3.8 Type system

- TypeScript strict mode in `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`
- No `any` types anywhere in design system code
- All component props typed via interfaces (not `type` aliases for props specifically)
- Path aliases configured: `@/components/*`, `@/lib/*`, `@/styles/*`

### 3.9 Documentation

Create `/docs/design-system.md` with:
- Token system overview
- Component usage examples
- Theme customization guide
- "How to add a new component" workflow

---

## 4. File Structure

The project must follow this exact structure by end of Wave 0:

```
/atlas
  /app
    /globals.css                  # Design tokens as CSS variables
    /layout.tsx                   # Root layout with theme provider
    /page.tsx                     # Placeholder home page (will be replaced)
  /components
    /ui                           # Primitives
      button.tsx
      input.tsx
      ... (all primitives)
    /composed                     # Composed components
      command-palette.tsx
      reference-autocomplete.tsx
      ... (all composed)
    /layout                       # Layout primitives
      app-shell.tsx
      module-switcher.tsx
      ... (all layout)
  /lib
    /utils.ts                     # cn() helper, common utilities
  /styles
    /tokens.css                   # Token definitions (imported by globals.css)
  /stories                        # Storybook stories
    /primitives
    /composed
    /layout
  /docs
    /design-system.md
  /public
  /.storybook
    main.ts
    preview.tsx
  package.json
  tsconfig.json
  tailwind.config.ts
  next.config.js
  README.md
  .env.example
  .gitignore
```

---

## 5. Rules of Engagement (read carefully — these are absolute)

These rules apply to Wave 0 and all subsequent waves. Violating them creates technical debt that will compound through the project.

### 5.1 Do not invent

- Do not invent components not in this prompt's component list
- Do not invent design tokens not in the token system
- Do not invent file locations not in the structure above
- Do not add libraries not in the stack list without explicit approval

### 5.2 Do not hardcode

- No hardcoded colors anywhere — always reference tokens
- No hardcoded font sizes outside the type scale
- No hardcoded spacing values outside the spacing scale
- No hardcoded radius values outside the radius scale
- If you find yourself writing a hex value, stop and use a token instead

### 5.3 Do not deviate from the stack

- If a default Next.js install includes Pages Router, switch to App Router
- If you instinctively reach for Express, stop — use Next.js API routes / tRPC
- If you instinctively reach for Vite, stop — Next.js handles its own bundling
- Do not add styled-components, emotion, or any CSS-in-JS library
- Do not add Bootstrap, MUI, Chakra, Mantine, or any UI kit other than shadcn/ui

### 5.4 Stop and ask before

- Adding any dependency not listed in the stack
- Changing folder structure
- Modifying type scale, spacing scale, or any design system foundation
- Implementing features beyond Wave 0 scope

### 5.5 Build incrementally

- Build foundation first (tokens, theme system) before any components
- Build primitives before composed components
- Build composed components before layout primitives
- Verify each component in Storybook before moving to the next
- Do not batch 20 components in one commit; commit per component

### 5.6 Verify before marking complete

- Every component renders correctly in Storybook in both themes
- Every component has all states (hover, focus, disabled) demonstrated
- Theme switcher works without flash on page reload
- TypeScript compiles with zero errors and zero warnings
- ESLint passes
- The placeholder home page at `/` renders without errors

### 5.7 Communicate clearly

- After each major step, summarize what was built and ask for verification
- If a design decision is ambiguous, ask before implementing
- If a token value isn't specified, ask — don't guess
- If you encounter a technical limitation, raise it immediately

---

## 6. Recommended Build Sequence

Build in this order. Do not skip ahead.

1. **Project initialization** — Next.js + TypeScript + Tailwind + ESLint + Prettier
2. **Token system** — `globals.css`, `tailwind.config.ts`, theme provider
3. **Theme switcher** — verify dark/light/system works without flash
4. **Storybook setup** — basic configuration, theme toolbar
5. **Foundational primitives** — Button, IconButton, Input, Label, Textarea (these are used by everything else)
6. **Display primitives** — Avatar, Badge, Tag, StatusPill, Card, Separator, Skeleton, Spinner, Progress
7. **Form primitives** — Checkbox, Radio, Switch, Select
8. **Feedback primitives** — Tooltip, KeyboardShortcut
9. **Overlay primitives** — Popover, DropdownMenu, ContextMenu, Dialog, AlertDialog, Drawer, Toast
10. **Composed components** — ReferenceAutocomplete, CommandPalette, MentionPill, TagPill, EntityLink, EmptyState, InspectorPanel
11. **Layout primitives** — AppShell, ModuleSwitcher, TopBar, ThreePaneLayout, TwoPaneLayout, PageHeader
12. **Documentation** — design-system.md
13. **Final verification** — full Storybook review, theme switching, type-check, lint

---

## 7. Definition of Done for Wave 0

Wave 0 is complete when:

- [ ] All deliverables in section 3 are built and verified
- [ ] All 41 components exist with Storybook stories
- [ ] Both dark and light themes render every component correctly
- [ ] Theme switcher works without flash
- [ ] `npm run dev` starts without errors
- [ ] `npm run build` completes without errors
- [ ] `npm run type-check` passes with zero errors
- [ ] `npm run lint` passes
- [ ] `npm run storybook` opens with all stories visible
- [ ] No hardcoded colors, sizes, or spacing values exist anywhere
- [ ] Repository pushed to GitHub
- [ ] README.md documents how to run the project
- [ ] Domain `atlas.insightive.io` points to the deployed app

When all boxes are checked, summarize:
- What was built (component count, token count)
- What deviated from spec (if anything) and why
- What questions or issues arose
- Recommended starting point for Wave 1

---

## 8. What is NOT in Wave 0

Do not build any of the following in Wave 0:

- Database schema (Wave 1)
- Authentication flows (Wave 1)
- tRPC routers (Wave 2)
- Any product modules (Tasks, Calendar, CRM, Notes, Journal — Waves 3+)
- AI integrations (Wave 1 sets up abstraction; first feature in Wave 3)
- Google integrations (Wave 5+)
- Email integration (Wave 3)
- Data tables, calendar grids, charts, kanban, editor primitives (built when first needed)

If you are tempted to build any of these, stop. Wave 0 is foundation only.

---

## 9. Final note

This is a long-term project that I will use daily for years. The foundation built in Wave 0 will be touched by every subsequent wave and feature. Quality and discipline here pays compounding dividends. Speed at the cost of correctness here costs 10x to fix later.

When in doubt: **ask, don't guess.**

When the prompt says "do not" or "must": **treat it as absolute, not a suggestion.**

When you finish a step: **show me what you built before moving on.**

Begin with section 6, step 1.
