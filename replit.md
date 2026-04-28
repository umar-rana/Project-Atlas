# Atlas — Wave 3c Capture Intelligence

## Overview
Atlas is a desktop-first personal productivity command center. Its primary purpose is to provide a local-first capture intelligence system that efficiently processes user input. The system prioritizes cost-effective local parsing using technologies like `chrono-node`, regex, and `compromise.js` for the majority of captures, reserving more expensive AI services like Claude Haiku as a fallback for ambiguous cases. This hybrid approach aims to significantly reduce AI costs while maintaining high accuracy.

The project integrates a comprehensive captures tRPC router for managing various aspects of capture intelligence, including parsing, previewing, logging, and statistical analysis. Key capabilities include a re-engineered capture modal, email-to-inbox functionality for seamless capture from emails, and a robust, authenticated application shell with a focus on user experience and productivity. Future ambitions include modules for tasks, calendar, CRM, notes, and journaling, transforming Atlas into a complete personal productivity hub.

## User Preferences
I prefer iterative development with clear, concise communication. Before making major architectural changes or introducing new dependencies, please ask for approval. When implementing features, prioritize desktop-first experiences and ensure strict TypeScript compliance with zero errors. I value a clean codebase with consistent styling (Tailwind CSS driven by Stratum tokens) and well-tested utilities. Avoid making changes to `.github/workflows/ci.yml`.

## System Architecture
The application is built on Next.js 15 (App Router) + React 19, utilizing TypeScript for strict type checking. Styling is managed with Tailwind CSS 3.4 and custom Stratum tokens, complemented by UI primitives from Radix UI, cmdk, vaul, and sonner. Theming supports dark mode via `next-themes`.

Core architectural decisions include:
- **Hybrid Parsing Pipeline**: A local-first capture intelligence system where `chrono-node`, regex, and `compromise.js` handle the majority of input parsing. Claude Haiku is used as a fallback for ambiguous input (~20-30%), optimizing AI costs.
- **tRPC API**: A type-safe API layer for all backend interactions, including health checks, user management, drive integration, session management, AI calls, and capture processing.
- **Database**: PostgreSQL via Prisma, with a foundational schema (Wave 1) that includes models for users, sessions, audit logs, integration tokens, and AI call logs.
- **Authentication**: Replit OIDC (openid-client v6) for secure user authentication and session management using DB-backed sessions and an `iron-session` cookie.
- **Application Shell**: A robust, authenticated application shell featuring a `TwoPaneLayout` for settings, a `ModuleSwitcher` with keyboard shortcuts, a `TopBar` for search and user actions, a `CommandPalette` (`⌘K`) for quick access, and a `KeyboardShortcutsOverlay` (`⌘/`).
- **Capture Modals**: A re-engineered `CaptureModal` (`⌘⇧I`) for efficient input capture.
- **Settings and Configuration**: A comprehensive settings section with a `TwoPaneLayout` for managing profile, appearance, capture preferences (including email filters and blocklists), integrations, AI, backups, data, and account.
- **Email-to-Inbox**: Integration of email parsing (`mailparser`) with Resend inbound webhooks for capturing information directly from emails, including attachment handling and user-configurable filtering (auto-replies, calendar invites, blocklists).
- **Date Handling**: Timezone-aware date utilities using `date-fns-tz`.
- **Session Management**: DB-backed sessions with opportunistic and cron-based cleanup of expired sessions, and a UI for users to view and revoke active sessions.
- **Google Drive Integration**: Utilizes the Google Drive API for linking and encrypting Drive tokens, featuring a 4-step wizard for OAuth.
- **Queueing**: A priority-aware in-memory dispatch queue with DB-backed rate limiting.
- **Error Handling & Logging**: Comprehensive audit logging and Pino for structured logging.
- **Extensible Command and Shortcut Registries**: Context-based registries for managing application commands and keyboard shortcuts.
- **UI/UX Decisions**:
    - Desktop-first design.
    - Component splitting (e.g., `task-inspector`, `tasks-sidebar`) for better maintainability and performance.
    - `React.memo` for performance optimization in list items.
    - Narrowed Prisma `select` statements to retrieve only necessary fields, reducing wire payload and improving type inference.

## External Dependencies
- **Next.js**: Application framework
- **React**: UI library
- **TypeScript**: Programming language
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI, cmdk, vaul, sonner**: UI component primitives
- **next-themes**: Theming solution
- **Replit OIDC (openid-client)**: Authentication service
- **PostgreSQL**: Database
- **Prisma**: ORM for database interaction
- **tRPC**: Type-safe API layer
- **Anthropic Claude**: AI service via Replit integration
- **Replit Object Storage**: Cloud storage for attachments
- **Pino + pino-pretty**: Logging
- **Node.js crypto**: AES-256-GCM for encryption
- **Google Drive API (googleapis)**: For Google Drive integration
- **date-fns-tz**: Date and time utilities
- **mailparser**: For parsing email content
- **Resend**: Email service for inbound webhooks and outbound verification emails

## End-to-End Tests
Playwright-based scripts in `e2e/` run against a live server. Shared auth/browser helpers live in `e2e/helpers.mjs`. Each scenario is a standalone `.e2e.mjs` file:
- `task-list.e2e.mjs` — create task → edit title in inspector → reload → persist
- `task-complete.e2e.mjs` — create task → complete via checkbox → verify in completed list
- `quick-capture.e2e.mjs` — open capture modal → submit task → verify in inbox
- `project-context.e2e.mjs` — create project and context via sidebar
- `sign-out.e2e.mjs` — sign out via user menu → verify redirect to sign-in
- `forecast.e2e.mjs` — visit forecast view → verify day columns rendered

## Auth Flow
1. `/sign-in` → user clicks → `/api/auth/login` → Replit OIDC → `/api/auth/callback`
2. Callback: upsert User, create Session row, set `atlas_sess` cookie (7-day)
3. Middleware checks cookie on all protected routes, redirects to `/sign-in?from=...`
4. `/api/auth/logout` deletes session row + clears cookie

## Development
- Dev server: port 5000 bound to `0.0.0.0` (Replit iframe)
- `Start application` workflow: `npm run dev`
- Storybook workflow: `npm run storybook` (port 6000)
- Type check: `npx tsc --noEmit` (zero errors)
- Unit + component tests: `npx vitest run` (jsdom; 36 tests — date utilities, `TaskInspector` and `TaskListItem` smoke tests including a `React.memo` regression check, and the `/api/auth/test-login` route guards)
- E2E happy-path: `npm run test:e2e`. Two auth modes: (a) **CI mode** with `E2E_AUTH_SECRET` (POSTs `/api/auth/test-login` to mint a session for `e2e@atlas.test`); (b) **Manual mode** with `ATLAS_SESSION_COOKIE` (browser-copied). See README "Tests".
- CI: `.github/workflows/ci.yml` has two jobs:
  1. `verify` — `npm run lint`, `npm run type-check`, `npm run test` on every push and PR to `main` (Node 20, npm cache).
  2. `e2e` — needs `verify`. Spins up Postgres 16 service, generates Prisma client, applies migrations, builds Next, starts `npm start`, waits for `/api/health`, installs Playwright Chromium, then runs `npm run test:e2e` against `http://localhost:5000` using `E2E_AUTH_SECRET`. A failing run blocks the PR.
  Status badge in README links to the latest run.

## Test-only Auth Bypass (`/api/auth/test-login`)
- Route at `src/app/api/auth/test-login/route.ts`. Provisions a deterministic `e2e@atlas.test` user and mints a normal `atlas_session` cookie via `createSession`.
- **Disabled by default** with two-layer guard: returns 404 unless `E2E_AUTH_SECRET` is set with length ≥ 32, AND (when `NODE_ENV=production`) `E2E_ALLOW_IN_PRODUCTION=1` is also set. CI sets both because `next start` forces `NODE_ENV=production`. **Neither var must EVER be set in production.**
- When enabled, callers must present `Authorization: Bearer <secret>` (constant-time compared). Used by the CI e2e job and the e2e script.
- Listed in `PUBLIC_PATHS` in `src/middleware.ts` so unauthenticated callers can reach it.

## Replit-Specific Setup
- Binds to `0.0.0.0:5000` for proxy iframe compatibility
- `allowedDevOrigins: ['*']` in `next.config.mjs`
- Object Storage bucket configured via `DEFAULT_OBJECT_STORAGE_BUCKET_ID` secret
- Replit Auth uses `REPL_ID` for OIDC client ID

## Session Cleanup
Expired sessions are purged in two ways:
1. **Opportunistic (automatic)**: ~5% of session validations trigger a background `purgeExpiredSessions()` call (non-blocking, fire-and-forget).
2. **Explicit (cron)**: `POST /api/cron/cleanup-sessions` deletes all expired rows and returns `{ ok: true, purged: N }`. Requires `Authorization: Bearer $CRON_SECRET`. Set up a daily external scheduler (e.g. GitHub Actions, Render cron, or Replit deployments schedule) pointing at this endpoint. In production the endpoint returns `503` if `CRON_SECRET` is not configured.

## Deferred Major Upgrades
The following major-version upgrades were intentionally **not** applied during the
2026-04-28 lint/cleanup pass (Task #69). Each one is a known-breaking jump that
needs its own dedicated migration task with a reproducible verification plan.
Apply them in isolation, not bundled together.

- **Prisma 5 → 7**: schema/connection-URL changes; `prisma migrate` semantics shift; some types renamed.
- **Next.js 15 → 16**: router/cache defaults change. (`next lint` migration to direct ESLint CLI was completed in Task #73.)
- **Tailwind 3 → 4**: new engine + config format (`@theme` directive), full design-token migration required.
- **Zod 3 → 4**: new error format, `safeParse` shape changes, deprecated APIs removed — touches every router input schema.
- **Vitest 2 → 4** (and the chained `@vitest/*` packages): config file shape and reporter API moved.
- **TypeScript 5 → 6**: stricter checks; needs a full `tsc --noEmit` audit + `tsconfig` revisit.
- **lucide-react 0.469 → 1.x**: tree-shaking and icon naming overhaul; affects imports across the app shell and tasks UI.
- **sonner 1 → 2**: API change for `toast.*` variants and the `<Toaster />` provider.

Safe patch updates **were** applied in #69: `openid-client→6.8.4`, `@typescript-eslint/{eslint-plugin,parser}→8.59.1`, `postcss→8.5.12`.

## Recent Changes
- 2026-04-28: Linter migration to direct ESLint CLI (Task #73):
  - Ran `npx @next/codemod@canary next-lint-to-eslint-cli .` and finished the migration manually:
    - `package.json` script `lint`: `next lint` → `eslint .` (no more deprecation banner; future-proof for Next.js 16 which removes `next lint`).
    - Replaced `.eslintrc.json` with flat config `eslint.config.mjs` (uses `@eslint/eslintrc` `FlatCompat` to keep loading legacy `next/core-web-vitals`, `prettier`, and `plugin:storybook/recommended` configs since `eslint-config-next@15` is still legacy; v16 will ship native flat config).
    - Preserved the existing `@typescript-eslint/no-unused-vars` override (warn, `^_` ignore pattern) verbatim.
    - Added `linterOptions.reportUnusedDisableDirectives: "off"` to match the legacy ESLint default — flat-config v9 defaults this to `"warn"`, which would have introduced 4 brand-new warnings purely from the migration (`src/core/capture/parser/tier-1-local.ts`, `src/core/commands/registry.tsx`, `src/core/shortcuts/registry.tsx`).
    - Added `ignores` for `.next/`, `node_modules/`, `storybook-static/`, `public/` (compiled storybook bundles), `scripts/`, `.local/` (skill scaffolding), `.replit_integration_files/`, `.storybook/`, and `next-env.d.ts` to mirror what `next lint` actually scanned (it only walked `src/`, `app/`, `pages/`, `components/`, `lib/`).
  - README updated (`npm run lint` comment now says `eslint .`); replit.md "Deferred Major Upgrades" entry for Next.js 16 no longer warns about `next lint` removal.
  - Verification: `npm run lint` exits clean (0 errors, 0 warnings, no deprecation banner).

- 2026-04-28: End-to-end code review pass (Task #69):
  - Patch updates: `openid-client→6.8.4`, `@typescript-eslint/{eslint-plugin,parser}→8.59.1`, `postcss→8.5.12` (no breaking changes).
  - Cleared all 10 ESLint warnings (unused vars in sign-in, capture-modal, health, forecast-view, review-session; missing-dep effects in folder-detail-view + review-session); resolved a TS2589 ("excessively deep") error in `forecast-view.tsx` by depending on a scalar derived from `meData` rather than the full query object.
  - **Component splits**:
    - `task-inspector.tsx` (709 LOC) → split into `task-inspector.tsx` (~525), `task-inspector-attachments.tsx`, `task-inspector-activity-tab.tsx`, `task-inspector-subtasks.tsx`. Each subcomponent owns its own queries/mutations so the parent stops re-rendering them.
    - `tasks-sidebar.tsx` (619 LOC) → extracted the recursive folder/project tree (`FolderTreeNode`, `FolderNode`, `DragItem`, `colorDotClass`) into `folder-tree-node.tsx`. Sidebar is now ~435 LOC.
  - **Perf pass**:
    - `TaskListItem` wrapped in `React.memo`; refactored `TaskListItemProps.onSelect` / `onMultiToggle` to take `(task, e)` so the parent passes one stable callback per kind. `task-list.tsx` callbacks are now `useCallback`-stable, with a `tasksRef` ladder so `handleMultiToggle`/`handleDrop` read live state without invalidating identity.
    - Narrowed `TASK_INCLUDE` in `src/server/routers/tasks.ts` to `select` only the fields the UI actually reads (`project: id/title/color`; `subtasks: id/status/title`; nested `tag/context: id/name`). Smaller wire payload + flatter Prisma return types (helps tsc avoid TS2589 in inspector consumers).
  - Verification: `tsc --noEmit` clean, `next lint` reports zero warnings/zero errors.

- 2026-04-27: Wave 3c Part 2 — Email-to-inbox (Task #44):
  - `src/core/capture/email-parser.ts` — mailparser wrapper: extracts plain-text/HTML body, subject, from, attachments; detects auto-replies (Auto-Submitted header), calendar invites (.ics, text/calendar), and Fwd: prefix; truncates body to 10k chars
  - `src/app/api/email/inbound/route.ts` — Resend inbound webhook handler: validates Resend/svix signature (HMAC-SHA256); extracts user_id from `inbox+{userId}@atlas.insightive.io`; applies blocklist + filter settings; creates EmailCapture; calls captureAndCreate with source="email"; uploads attachments to Object Storage; writes audit log `email_capture_received`
  - `src/server/routers/emails.ts` — tRPC router: `emails.list` (paginated, 10 per page), `emails.byId`, `emails.discardCapture`
  - `src/server/routers/_app.ts` — added `emails` router
  - `src/server/routers/user.ts` — `updatePreferences` extended with `email_filter_auto_replies`, `email_filter_calendar`, `email_blocklist` fields (stored in tasks_prefs JSON)
  - `src/core/audit/index.ts` — added "EmailCapture" to audited entities
  - `src/app/(app)/settings/settings-client.tsx` — Capture section fully implemented: inbox address display + copy button, filter toggles (auto-replies, calendar), sender blocklist textarea, recent emails table (from, subject, status, task link); Integrations section updated to show Resend as "Active"
  - New env var: `RESEND_WEBHOOK_SECRET` — set in Replit secrets; used for Resend/svix webhook signature validation (optional in dev, required in production)
  - Package added: `mailparser`, `@types/mailparser`

- 2026-04-27: Wave 2 Signed-In App Shell (Task #25):
  - `(app)` route group with shared AppShellProvider layout (auth guard + shell)
  - AppShell wired with Zustand store for modal state (command palette, shortcuts overlay, capture modal, inspector)
  - ModuleSwitcherWired: 5 modules with ⌘1-5 keyboard shortcuts, Settings/Health/Trash icons, theme toggle
  - TopBarWired: module breadcrumb, search → command palette, capture button, sync status dot, user menu
  - UserMenu: avatar dropdown with name/email/Settings/Health/Shortcuts/Sign out
  - CommandPaletteWired: ⌘K, context-based command registry with Wave 2 navigation/app/theme/account commands
  - KeyboardShortcutsOverlay: ⌘/ cheat sheet with search, grouped shortcuts, keycap display
  - SyncStatus: real health state dot + popover with per-integration status, 30s auto-refresh, Sync now
  - CaptureModal: ⌘⇧I, textarea, ⌘⏎ submit → toast "Captured to inbox (will be processed in Wave 3)"
  - InspectorPanel slot in AppShell with pinning behavior
  - Settings refactored to TwoPaneLayout with 8 sections: Profile, Appearance, Capture, Integrations, AI, Backups, Data, Account
  - Module placeholder pages: /tasks, /calendar, /crm, /notes, /journal, /trash (EmptyState)
  - Root / now redirects to /tasks
  - Health page moved into (app) group, uses AppShell
  - core/commands/registry.tsx + core/shortcuts/registry.tsx: plugin registries
  - lib/shell/store.ts: Zustand shell state; lib/toast.ts: sonner re-export
  - TypeScript: zero errors; ESLint: zero new errors
- 2026-04-27: Session cleanup + active sessions UI (Task #8):
  - `purgeExpiredSessions()` in `src/core/auth/session.ts`; shared `resolveSession()` internal helper
  - `POST /api/cron/cleanup-sessions` cleanup endpoint (CRON_SECRET-protected in production)
  - tRPC `session` router: `list`, `revoke`, `revokeAll`
  - Settings page "Active Sessions" section with per-session revoke and "Revoke all others"
  - `TRPCContext` extended with `sessionId`
- 2026-04-27: Wave 1 Foundation Layer complete:
  - Removed next-auth; implemented Replit OIDC auth
  - Prisma Wave 1 schema (9 models) migrated to PostgreSQL
  - Core modules: logging, dates (14 tests), db, audit, storage, queue, ai, drive
  - tRPC routers: health, user, drive
  - Drive linking wizard (4-step UI)
  - All TypeScript errors resolved (zero TS errors)

## External Dependencies
- **Anthropic Claude**: Used for AI-driven fallback parsing via Replit integration.
- **Google Drive API**: Integrated via `googleapis` for drive linking, storage, and token encryption.
- **Replit Object Storage**: Utilized for storing attachments and other large objects.
- **Resend**: For inbound email processing via webhooks (`/api/email/inbound`) and outbound email sending (e.g., verification emails).
- **PostgreSQL**: The primary database, accessed through Prisma.
- **Prisma**: ORM for database interactions.
- **openid-client**: For Replit OIDC authentication.
- **chrono-node, compromise.js**: Libraries for local-first capture parsing.
- **mailparser**: For parsing inbound emails.
- **date-fns-tz**: For timezone-aware date utilities.
