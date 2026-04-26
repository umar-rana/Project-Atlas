# Atlas — Wave 0

## Overview
Atlas is a desktop‑first personal productivity command center. **Wave 0** ships
only the foundation: design tokens, theming, Storybook, and 41 design‑system
components. No product features yet (no tasks, projects, calendar, AI, editor).

The design language is **Stratum**, sourced from `colors_and_type.css` and
locked in `.local/tasks/task-1.md`. See `docs/design-system.md` for the full
build contract (tokens, components, patterns, accessibility, how‑to‑add).

## Tech Stack
- **Framework**: Next.js 15 (App Router) + React 19
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS 3.4 driven by Stratum tokens
- **UI primitives**: Radix UI, cmdk, vaul, sonner
- **Theming**: next-themes (`attribute="data-theme"`, default dark)
- **Storybook**: 8 (`@storybook/nextjs`) on port 6006
- **Forms / state**: react-hook-form + zod, @tanstack/react-query, zustand
- **Backend stubs (placeholders only)**: tRPC, Prisma, NextAuth v5 beta, pino

## Project Structure
```
src/
├── app/
│   ├── globals.css           Tailwind base + tokens.css import + .tabular-nums
│   ├── layout.tsx            next/font wiring + ThemeProvider + Toaster
│   └── page.tsx              Wave 0 placeholder home
├── components/
│   ├── theme/                ThemeProvider + ThemeSwitcher
│   ├── ui/                   28 primitives + stories
│   ├── composed/             7 composed components + stories
│   └── layout/               6 layout primitives + stories
├── styles/
│   └── tokens.css            Stratum tokens (single source of truth)
└── lib/                      utils.ts, plus empty stubs (auth, db, trpc, logger)
.storybook/                   main.ts + preview.tsx with theme toolbar
docs/design-system.md         Token + component + pattern reference
prisma/schema.prisma          Empty placeholder for later waves
```

## Configuration Files
- `tailwind.config.ts` — exposes every Stratum token (surfaces, borders, text,
  accents, viz/cal palettes, status, spacing incl. half‑steps and pixel‑precise
  component heights, radius, type scale + tracking, motion durations + easings,
  shadows, fontFamily from next/font CSS vars).
- `next.config.mjs` — `allowedDevOrigins: ['*']` for Replit iframe preview;
  cache headers disabled in dev only.
- `tsconfig.json` — strict mode, expanded path aliases (`@/components`,
  `@/lib`, `@/styles`, etc.).
- `.eslintrc.json` — `next/core-web-vitals` + `prettier` +
  `plugin:storybook/recommended` with `@typescript-eslint` parser/plugin.

## Development
- Dev server: port 5000 bound to 0.0.0.0 (Replit iframe).
- Workflow: `Start application` runs `npm run dev`.
- Storybook: `npm run storybook` (port 6006).
- Verification: `npm run type-check`, `npm run lint`, `npm run build` — all
  required to be clean before review.

## Replit-Specific Setup
- Server binds to `0.0.0.0:5000` for proxy iframe compatibility.
- `allowedDevOrigins: ['*']` in `next.config.mjs` allows the proxied preview.

## Out of Scope for Wave 0
Kanban boards, data tables, calendar grids, task/project rows, AI surfaces,
rich‑text editor primitives, bulk‑action bars. These land in later waves and
must reuse the Wave 0 primitives — no new ad‑hoc components in product code.

## Recent Changes
- 2026‑04‑26: Bootstrapped Wave 0 — token port, Tailwind config, theme
  provider/switcher, Storybook, all 41 components, design‑system docs.
