# Atlas — Wave 2 Signed-In App Shell

## Overview
Atlas is a desktop-first personal productivity command center. **Wave 2** ships
the signed-in app shell — the chrome every product module lives inside. Built on
the Wave 0/1 foundation (design system + backend infrastructure).

## Tech Stack
- **Framework**: Next.js 15 (App Router) + React 19
- **Language**: TypeScript (strict, zero errors)
- **Styling**: Tailwind CSS 3.4 driven by Stratum tokens
- **UI primitives**: Radix UI, cmdk, vaul, sonner
- **Theming**: next-themes (`attribute="data-theme"`, default dark)
- **Storybook**: 9 on port 6000
- **Auth**: Replit OIDC (openid-client v6) — no Auth.js/next-auth
- **Database**: PostgreSQL via Prisma (Wave 1 schema migrated)
- **Sessions**: DB-backed sessions + iron-session cookie (`atlas_sess`)
- **API**: tRPC v11 (health, user, drive routers)
- **AI**: Anthropic Claude via Replit integration
- **Storage**: Replit Object Storage (`@replit/object-storage`)
- **Logging**: Pino + pino-pretty
- **Crypto**: Node.js built-in AES-256-GCM (for Drive token encryption)
- **Drive**: Google Drive API via `googleapis`
- **Queue**: Priority-aware in-memory dispatch queue with DB-backed rate limiting (`src/core/queue/`)
- **Dates**: date-fns-tz utilities with per-user prefs (14 passing unit tests)

## Key Environment Variables
- `SESSION_SECRET` — iron-session encryption key (set as Replit secret)
- `DATABASE_URL` — PostgreSQL connection string (Replit DB)
- `TOKEN_ENCRYPTION_KEY` — 64-char hex, 32-byte AES key for Drive tokens
- `LOG_LEVEL` — pino log level (default: `info`)
- `REPL_ID` — Replit app ID (auto-provided by Replit)
- `REPLIT_DEV_DOMAIN` — auto-provided by Replit
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` — needed for Drive OAuth (not yet configured)
- `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` — Anthropic credentials (Replit blueprint)
- `CRON_SECRET` — Bearer secret for `POST /api/cron/cleanup-sessions`; **required in production** (endpoint returns 503 if unset outside dev)

## Project Structure
```
src/
├── app/
│   ├── (app)/              Route group — all authenticated app routes
│   │   ├── layout.tsx      Server component: auth guard → AppShellProvider
│   │   ├── tasks/          Module placeholder (Wave 3)
│   │   ├── calendar/       Module placeholder (Wave 4)
│   │   ├── crm/            Module placeholder (Wave 5)
│   │   ├── notes/          Module placeholder (Wave 4)
│   │   ├── journal/        Module placeholder (Wave 5)
│   │   ├── trash/          Trash placeholder
│   │   ├── admin/health/   Health dashboard (uses AppShell)
│   │   └── settings/       Settings (TwoPaneLayout, 8 sections) + DriveWizard
│   ├── api/auth/           login, callback, logout routes (Replit OIDC)
│   ├── api/drive/connect/  Drive OAuth initiator
│   ├── api/drive/oauth-callback/  Drive OAuth callback
│   ├── api/trpc/           tRPC handler
│   ├── sign-in/            Sign-in page
│   ├── globals.css
│   ├── layout.tsx          TRPCProvider + ThemeProvider + Toaster
│   └── page.tsx            Root redirect → /tasks (auth-gated)
├── components/
│   ├── shell/              Wave 2 wired shell components
│   │   ├── app-shell-provider.tsx    Main shell orchestrator + Zustand + registries
│   │   ├── module-switcher-wired.tsx Rail with ⌘1-5 shortcuts + theme toggle
│   │   ├── top-bar-wired.tsx         Search → command palette, capture, user menu
│   │   ├── user-menu.tsx             Avatar dropdown
│   │   ├── command-palette-wired.tsx ⌘K palette with command registry
│   │   ├── keyboard-shortcuts-overlay.tsx ⌘/ cheat sheet
│   │   ├── sync-status.tsx           Dot + popover with real health states
│   │   └── capture-modal.tsx         ⌘⇧I capture modal → toast
│   ├── layout/             AppShell, ModuleSwitcher, TopBar, TwoPaneLayout, etc. (primitives)
│   ├── composed/           CommandPalette, InspectorPanel, EmptyState
│   └── ui/                 Atomic components (Stratum)
├── core/
│   ├── commands/registry.tsx  Context-based command registry
│   ├── shortcuts/registry.tsx Context-based shortcuts registry
│   ├── ai/                 Anthropic abstraction (complete + queue)
│   ├── audit/              Audit logging
│   ├── auth/               replit-oidc.ts, session.ts
│   ├── dates/              Timezone-aware date utils (14 unit tests)
│   ├── db/                 Prisma client singleton
│   ├── drive/              Google Drive client, primitives, linking, encrypt
│   ├── logging/            Pino logger factory
│   ├── queue/              Rate-limit in-memory queue
│   └── storage/            Replit Object Storage wrapper
├── lib/
│   ├── shell/store.ts      Zustand store for shell modal state
│   ├── toast.ts            Re-export sonner toast
│   ├── auth.ts             Re-exports getServerSession
│   ├── db.ts               Re-exports Prisma client
│   ├── logger.ts           Re-exports createLogger
│   └── trpc/               client.ts + server.ts re-exports
├── middleware.ts            Auth middleware + structured HTTP request logging
└── server/
    ├── trpc.ts             tRPC init + context (auth context)
    └── routers/            _app.ts, health.ts, user.ts, drive.ts, session.ts, ai.ts, capture.ts
prisma/
├── schema.prisma           Wave 1 full schema (migrated: 20260427043022_wave1_foundation)
└── migrations/
```

## Prisma Models (Wave 1)
User, Session, AuditLog, IntegrationToken, SyncState, RateLimitTracker, AICallLog, Attachment, DriveConfig

## Configuration Files
- `tailwind.config.ts` — Stratum tokens + animations
- `next.config.mjs` — `allowedDevOrigins: ['*']`, dev cache disabled
- `tsconfig.json` — strict mode, `noUncheckedIndexedAccess`, path aliases
- `prisma/schema.prisma` — Wave 1 full schema

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
- Unit tests: `npx vitest run` (14 date utility tests pass)

## Replit-Specific Setup
- Binds to `0.0.0.0:5000` for proxy iframe compatibility
- `allowedDevOrigins: ['*']` in `next.config.mjs`
- Object Storage bucket configured via `DEFAULT_OBJECT_STORAGE_BUCKET_ID` secret
- Replit Auth uses `REPL_ID` for OIDC client ID

## Session Cleanup
Expired sessions are purged in two ways:
1. **Opportunistic (automatic)**: ~5% of session validations trigger a background `purgeExpiredSessions()` call (non-blocking, fire-and-forget).
2. **Explicit (cron)**: `POST /api/cron/cleanup-sessions` deletes all expired rows and returns `{ ok: true, purged: N }`. Requires `Authorization: Bearer $CRON_SECRET`. Set up a daily external scheduler (e.g. GitHub Actions, Render cron, or Replit deployments schedule) pointing at this endpoint. In production the endpoint returns `503` if `CRON_SECRET` is not configured.

## Recent Changes
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
