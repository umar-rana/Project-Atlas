# Atlas

A desktop-first personal productivity command center. **Wave 0** ships only the
project skeleton, the **Stratum** design token system, the theme switcher, the
Storybook workshop, and the foundational primitive / composed / layout
components. No product features are included yet — those land in subsequent
waves.

- **Next.js 15** App Router (React 19)
- **TypeScript** in strict mode
- **Tailwind CSS** wired to the Stratum CSS-variable token contract
- **shadcn/ui** primitives (Radix-powered) extended with Atlas-specific tokens
- **Lucide** icons
- **Storybook v9** workshop for every Atlas component

## Getting Started

The development server is configured to run on port `5000`. The Replit
`Start application` workflow runs the same command.

```bash
npm run dev
```

The home page lives at `src/app/page.tsx`.

## Storybook (component workshop)

Storybook is the source of truth for the design system. Run it locally on port
`6006`:

```bash
npm run storybook        # interactive workshop
npm run build-storybook  # static export -> ./storybook-static
```

Every primitive, composed, and layout component has a `*.stories.tsx` file
exercising its variants, sizes, and edge cases.

## Theme

Theme is controlled by a `data-theme` attribute on `<html>` with three modes:

- `dark` (default)
- `light`
- `system` (follows `prefers-color-scheme`)

Toggle it from the UI via `<ThemeSwitcher />`
(`src/components/theme-switcher.tsx`) or programmatically via the
`useTheme()` hook from `next-themes`. The provider wrapper lives in
`src/components/providers/theme-provider.tsx`.

## Project Structure

```
src/
├── app/
│   ├── globals.css         # Imports tokens.css + base reset
│   ├── layout.tsx
│   └── page.tsx
├── styles/
│   └── tokens.css          # Stratum CSS variables (the design contract)
├── components/
│   ├── ui/                 # 28 primitives (button, input, dialog, ...)
│   ├── composed/           # 7 composed widgets (command-palette, ...)
│   ├── layout/             # 6 layout shells (app-shell, top-bar, ...)
│   ├── providers/          # ThemeProvider (next-themes wrapper)
│   └── theme-switcher.tsx  # Dark / Light / System toggle
└── lib/
    └── utils.ts            # cn() helper
```

## Configuration Files

- `tailwind.config.ts` — Tailwind extended to map every utility back to a
  Stratum CSS variable. Components must use these tokens; arbitrary values
  (`text-[10px]`, `z-[91]`, `bg-black/45`, etc.) are forbidden.
- `components.json` — shadcn/ui CLI configuration.
- `.storybook/` — Storybook v9 + `@storybook/nextjs` builder.
- `next.config.mjs` — Next.js configuration.
- `tsconfig.json` — strict TypeScript with `@/*` path alias.

See [`docs/design-system.md`](docs/design-system.md) for the full Stratum
contract: token taxonomy, component inventory, and the rules contributors must
follow.

## Scripts

```bash
npm run dev               # Next.js dev server on :5000
npm run build             # Production build
npm run start             # Run production build
npm run lint              # eslint . (zero warnings allowed)
npm run type-check        # tsc --noEmit (strict)
npm run test              # Vitest (unit + component tests, jsdom)
npm run test:watch        # Vitest in watch mode
npm run test:e2e          # Playwright happy-path against a running app (see below)
npm run storybook         # Storybook on :6006
npm run build-storybook   # Static Storybook export
```

## Tests

- **Unit + component tests** — `npm run test` runs Vitest in a jsdom
  environment. Covers core date utilities (`src/core/dates/dates.test.ts`)
  and component smoke tests for the task list:
  - `src/components/tasks/__tests__/task-list-item.test.tsx` — renders the
    row and proves `React.memo` skips re-renders when props are referentially
    stable. Will fail loudly if `TaskListItem` ever loses memoization.
  - `src/components/tasks/__tests__/task-inspector.test.tsx` — renders the
    inspector, switches between the Details / Activity tabs, and asserts the
    `tasks.update` mutation fires with the expected payload when the title is
    edited and blurred.
- **End-to-end happy-path** — `npm run test:e2e` runs `e2e/task-list.e2e.mjs`
  via `playwright-core`. It is **not** automated yet because Atlas is gated
  behind Replit OIDC; sign in via your browser, copy the `atlas_session`
  cookie, and run:

  ```bash
  APP_URL=https://<your-repl>.replit.dev \
  ATLAS_SESSION_COOKIE=<session cookie value> \
  npm run test:e2e
  ```

  The script creates a task via the quick-add input, opens the inspector,
  edits the title, reloads, and asserts the new title persists. Exit code
  `0` on success, `1` on failure.

## Deployment

Production URL: **<https://atlas.insightive.io>** (custom domain)
Replit fallback: `https://atlas.<your-replit-handle>.replit.app` — assigned
automatically on first publish.

Atlas Wave 0 deploys as a Replit **Autoscale** deployment.

### One-time setup

1. Open this Repl on Replit and click **Publish** (top-right of the workspace).
2. Choose deployment type **Autoscale**.
3. Build command: `npm run build`
4. Run command: `npm start`
5. Machine: 1 vCPU / 2 GiB is sufficient for Wave 0.
6. Click **Publish** — Replit will assign a default `*.replit.app` URL.

### Custom domain (`atlas.insightive.io`)

In the deployment's **Settings → Domains** tab:

1. Click **Link a domain** and enter `atlas.insightive.io`.
2. Replit will display two DNS records to add at your DNS provider for
   `insightive.io` (the apex domain manager):

   | Type    | Name    | Value                                          |
   | ------- | ------- | ---------------------------------------------- |
   | `A`     | `atlas` | (IPv4 address shown in the Replit dialog)      |
   | `TXT`   | `atlas` | `replit-verify=<verification token>`           |

   Replit shows the exact values — copy them verbatim.
3. Save the records and click **Verify** in Replit. Propagation usually takes a
   few minutes; certificate provisioning (Let's Encrypt) follows automatically
   once verification succeeds.
4. Once the domain shows **Verified + Active**, `https://atlas.insightive.io`
   serves the deployed Next.js app.

### Redeploys

Each push to the deployed branch (or each manual **Redeploy** in the Replit
deployments pane) rebuilds and rolls out Atlas. Health checks run against `/`.

## Wave 0 boundaries

Wave 0 is intentionally **scaffolding-only**:

- ✅ Stratum tokens (color, type, space, motion, z, sizing, shadow, ring)
- ✅ Theme system (`data-theme` dark / light / system)
- ✅ 28 UI primitives + 7 composed widgets + 6 layout shells (= 41 components)
- ✅ Storybook coverage for every component
- ❌ No persistence layer, no auth, no API, no product modules

Product features arrive in Wave 1+.
