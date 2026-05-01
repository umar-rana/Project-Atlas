# Atlas — Wave 4a Phase 1: Schema & Infrastructure

## Overview
Atlas is a desktop-first personal productivity command center designed as a local-first capture intelligence system. It aims to efficiently process user input by prioritizing cost-effective local parsing methods (`chrono-node`, regex, `compromise.js`) and using more expensive AI services like Claude Haiku only as a fallback for ambiguous cases. This hybrid approach significantly reduces AI costs while maintaining high accuracy. The project features a comprehensive captures tRPC router for parsing, previewing, logging, and statistical analysis, alongside a re-engineered capture modal, email-to-inbox functionality, and a robust, authenticated application shell focused on user experience.

## User Preferences
I prefer iterative development with clear, concise communication. Before making major architectural changes or introducing new dependencies, please ask for approval. When implementing features, prioritize desktop-first experiences and ensure strict TypeScript compliance with zero errors. I value a clean codebase with consistent styling (Tailwind CSS driven by Stratum tokens) and well-tested utilities. Avoid making changes to `.github/workflows/ci.yml`.

## System Architecture
The application is built on Next.js 15 (App Router) + React 19 with TypeScript. Styling uses Tailwind CSS 3.4 and custom Stratum tokens, complemented by UI primitives from Radix UI, cmdk, vaul, and sonner. Dark mode is supported via `next-themes`.

**Core Architectural Decisions:**
- **Hybrid Parsing Pipeline**: Utilizes `chrono-node`, regex, and `compromise.js` for local-first input parsing, with Claude Haiku as a fallback for ambiguous cases to optimize AI costs.
- **tRPC API**: Provides a type-safe API layer for all backend interactions, including health checks, user management, drive integration, session management, AI calls, and capture processing.
- **Database**: PostgreSQL via Prisma, featuring a foundational schema for users (with `clerk_id` for Clerk linking), audit logs, integration tokens, and AI call logs. The `Session` model was removed in migration `20260428065736_add_clerk_id_remove_sessions`.
- **Authentication**: Clerk (`@clerk/nextjs` v7) handles all authentication. Users sign in with Google or email — no Replit account required. The middleware (`src/middleware.ts`) uses `clerkMiddleware` to protect all routes, with `/`, `/privacy`, and `/terms` marked as public routes. `src/lib/auth.ts` exposes `getOrCreateUserFromClerk()` which maps Clerk user IDs to Prisma `User` rows via `clerk_id`. The old `Session` table and all HMAC session code have been removed.
- **Marketing Pages**: A public-facing marketing homepage at `/` shows Atlas's positioning, module descriptions, and CTAs for unauthenticated visitors. Authenticated users visiting `/` are redirected to `/tasks`. `/privacy` and `/terms` are public pages for the privacy policy and terms of use.
- **Application Shell**: An authenticated shell featuring a `TwoPaneLayout`, `ModuleSwitcher`, `TopBar`, `CommandPalette` (`⌘K`), and `KeyboardShortcutsOverlay` (`⌘/`).
- **Capture Modals**: A re-engineered `CaptureModal` (`⌘⇧I`) for efficient input capture.
- **Settings and Configuration**: A comprehensive settings section with a `TwoPaneLayout` for managing profile, appearance, capture preferences (including email filters and blocklists), integrations, AI, backups, data, and account.
- **Email-to-Inbox**: Integration of email parsing (`mailparser`) with Resend inbound webhooks for capturing information directly from emails, including attachment handling and user-configurable filtering (auto-replies, calendar invites, blocklists).
- **Date Handling**: Timezone-aware date utilities using `date-fns-tz`.
- **Session Management**: DB-backed sessions with opportunistic and cron-based cleanup of expired sessions, and a UI for users to view and revoke active sessions. (Note: Session model removed in favor of Clerk).
- **Google Drive Integration**: Utilizes the Google Drive API for linking and encrypting Drive tokens, featuring a 4-step wizard for OAuth.
- **Queueing**: A priority-aware in-memory dispatch queue with DB-backed rate limiting. pg-boss (v10) provides a durable scheduled-job runner initialized via Next.js instrumentation (`src/instrumentation.ts`). Five cron jobs registered: `drive-sync-notes`, `drive-sync-tables`, `session-cleanup`, `trash-retention`, `attachment-cleanup`.
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
- **@clerk/nextjs**: Authentication service (replaces Replit OIDC)
- **PostgreSQL**: Database
- **Prisma**: ORM for database interaction
- **tRPC**: Type-safe API layer
- **Anthropic Claude**: AI service via Replit integration
- **Cloudflare R2**: Cloud storage for file attachments via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Files served through `atlas.insightive.io` using 1-hour signed URLs. Provider abstraction at `src/core/storage/` supports `r2` (active) and `replit` (rollback stub), selected via `STORAGE_PROVIDER` env var.
- **Pino + pino-pretty**: Logging
- **Node.js crypto**: AES-256-GCM for encryption
- **Google Drive API (googleapis)**: For Google Drive integration
- **date-fns-tz**: Date and time utilities
- **mailparser**: For parsing email content
- **Resend**: Email service for inbound webhooks and outbound verification emails
- **chrono-node, compromise.js**: For local-first capture parsing
- **pg-boss**: PostgreSQL-backed durable job queue and scheduler (v10)

## End-to-End Tests
Playwright-based scripts in `e2e/` run against a live server. Shared auth/browser helpers live in `e2e/helpers.mjs`. Each scenario is a standalone `.e2e.mjs` file:
- `task-list.e2e.mjs` — create task → edit title in inspector → reload → persist
- `task-complete.e2e.mjs` — create task → complete via checkbox → verify in completed list
- `quick-capture.e2e.mjs` — open capture modal → submit task → verify in inbox
- `project-context.e2e.mjs` — create project and context via sidebar
- `sign-out.e2e.mjs` — sign out via user menu → verify redirect to sign-in
- `forecast.e2e.mjs` — visit forecast view → verify day columns rendered

## Auth Flow
1. `/sign-in` → User logs in via Clerk (Google/Email).
2. Middleware (`src/middleware.ts`) protects routes using `clerkMiddleware`.
3. `getOrCreateUserFromClerk()` maps Clerk user to Prisma `User` via `clerk_id`.
4. Sign-out via `useClerk().signOut()`.

## Development
- Dev server: port 5000 bound to `0.0.0.0` (Replit iframe)
- `Start application` workflow: `npm run dev`
- Storybook workflow: `npm run storybook` (port 6000)
- Type check: `npx tsc --noEmit` (zero errors)
- Unit + component tests: `npx vitest run` (jsdom; 36 tests — date utilities, `TaskInspector` and `TaskListItem` smoke tests including a `React.memo` regression check, and the `/api/auth/test-login` route guards)
- E2E happy-path: `npm run test:e2e`. CI uses `E2E_AUTH_SECRET` to mint Clerk sign-in tokens for `e2e@atlas.test`.
- CI: `.github/workflows/ci.yml` has two jobs:
  1. `verify` — `npm run lint`, `npm run type-check`, `npm run test` on every push and PR to `main` (Node 20, npm cache).
  2. `e2e` — needs `verify`. Spins up Postgres 16 service, generates Prisma client, applies migrations, builds Next, starts `npm start`, waits for `/api/health`, installs Playwright Chromium, then runs `npm run test:e2e` against `http://localhost:5000`.

## Test-only Auth Bypass (`/api/auth/test-login`)
- Route at `src/app/api/auth/test-login/route.ts`. Provisions a deterministic `e2e@atlas.test` user and mints a Clerk sign-in token.
- **Disabled by default** with two-layer guard: returns 404 unless `E2E_AUTH_SECRET` is set with length ≥ 32, AND (when `NODE_ENV=production`) `E2E_ALLOW_IN_PRODUCTION=1` is also set.
- When enabled, callers must present `Authorization: Bearer <secret>`. Used by the CI e2e job and the e2e script.

## Replit-Specific Setup
- Binds to `0.0.0.0:5000` for proxy iframe compatibility
- `allowedDevOrigins: ['*']` in `next.config.mjs`
- Object Storage bucket configured via `DEFAULT_OBJECT_STORAGE_BUCKET_ID` secret

## Session Cleanup
- Sessions are now managed by Clerk. Legacy session cleanup (`/api/cron/cleanup-sessions`) is now a no-op.

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

## Tasks — Checklist & Subtasks
Added split between lightweight checklist items and full subtask Tasks (Task #123):
- **ChecklistItem model** (`prisma/schema.prisma`): id, user_id, task_id, title, completed_at?, position Decimal, timestamps, soft-delete. Indexed on `[task_id, position]`.
- **Checklist tRPC router** (`src/server/routers/checklist.ts`): list, create, update, delete, reorder (fractional indexing), migrateSubtasksToChecklist.
- **ChecklistSection component** (`src/components/tasks/checklist-section.tsx`): inline-edit on click, drag-to-reorder, checkbox toggle, hover-delete, "+ Add item" button.
- **SubtaskSection + SubtaskRow** (`src/components/tasks/subtask-section.tsx`, `subtask-row.tsx`): full Task rows with due date (color-coded), flag toggle, inline title edit, ">" chevron to navigate inspector with breadcrumb.
- **Task inspector** updated: breadcrumb navigation, complete-all-subtasks confirmation dialog, data migration prompt for old-style simple subtasks.
- **Task list item** updated: checklist progress badge "X/Y", collapse/expand chevron for parents in project view, "↳ from [parent]" reference line in Today/Flagged for subtasks.
- **Task list** updated: expanded subtask rows render inline under parents in project view. Zustand store extended with `expandedParentIds` and `inspectorBreadcrumb`.
- **Depth enforcement**: `tasks.create` and `tasks.update` reject `parent_id` if the parent itself has a `parent_id` (max 1-level deep).
- **Cascades**: `tasks.delete` soft-deletes child Tasks + ChecklistItems; `tasks.restore` restores them; `tasks.update` propagates `project_id` changes to children.
- **TASK_INCLUDE** extended: includes `parent`, richer `subtasks` (due_date, flagged, estimated_minutes), and `checklist_items`.
- Inbox shows only top-level tasks (`parent_id = null AND project_id = null`).

## Wave 4a Phase 1 Changes (2026-05-01)
- **Note & NotesFolder models**: Full schema with self-referential `FolderHierarchy`, partial unique index for `is_project_brief` (raw SQL), Drive sync fields, word_count, pinned. Tables: `Note`, `NotesFolder`.
- **Link model**: Generic link graph table (`source_type/id`, `target_type/id`, `relation`) with composite unique index and source/target indexes. Table: `Link`.
- **Project enhancements**: Added `type` (default 'project'), `target_date` (optional), and the `note_refs` back-relation. New index on `user_id, type`.
- **User locale fields**: Added `locale_preset` (default 'pakistan'), `currency_code` (default 'PKR'), `currency_symbol` (default '₨'), `number_format` (default '1,234.56'). Updated `date_format` default to 'dd-mm-yyyy' and `time_format` to '12h'.
- **pg-boss job runner**: `src/core/jobs/runner.ts` — pg-boss v10 instance initialized via Next.js instrumentation (`src/instrumentation.ts`). `src/core/jobs/registry.ts` — five cron jobs with stub handlers in `src/core/jobs/handlers/`.
- **Migration**: `prisma/migrations/20260501100000_wave4a_notes_link_locale_project/` — applied via `prisma db execute` + `prisma migrate resolve`.

## Recent Changes
- 2026-05-01: Wave 4a Phase 1 — Notes/Link schema, Project/User enhancements, pg-boss job runner (Task #255).
- 2026-04-29: Checklist & subtask split (Task #123).
- 2026-04-28: Migrated auth from Replit OIDC to Clerk (Task #74).
- 2026-04-28: Linter migration to direct ESLint CLI (Task #73).
- 2026-04-28: End-to-end code review pass (Task #69).
- 2026-04-27: Wave 3c Part 2 — Email-to-inbox (Task #44).
- 2026-04-27: Wave 2 Signed-In App Shell (Task #25).
- 2026-04-27: Session cleanup + active sessions UI (Task #8).
- 2026-04-27: Wave 1 Foundation Layer complete.
