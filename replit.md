# Atlas — Wave 1 Foundation Layer

## Overview
Atlas is a desktop-first personal productivity command center. **Wave 1** ships
the complete backend infrastructure layer on top of the Wave 0 design system.

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

## Project Structure
```
src/
├── app/
│   ├── api/auth/           login, callback, logout routes (Replit OIDC)
│   ├── api/drive/connect/  Drive OAuth initiator (generates+signs nonce cookie, redirects to Google)
│   ├── api/drive/oauth-callback/  Drive OAuth callback (validates nonce HMAC, exchanges code)
│   ├── api/trpc/           tRPC handler
│   ├── admin/health/       System health dashboard
│   ├── settings/           Settings page + Drive wizard + settings client
│   ├── sign-in/            Sign-in page
│   ├── globals.css
│   ├── layout.tsx          TRPCProvider + ThemeProvider + Toaster
│   └── page.tsx            Home (auth-gated)
├── components/             Wave 0 design system (41 components)
├── core/
│   ├── ai/                 Anthropic abstraction (complete + queue)
│   ├── audit/              Audit logging (AuditLog table)
│   ├── auth/               replit-oidc.ts, session.ts
│   ├── dates/              Timezone-aware date utils (14 unit tests)
│   ├── db/                 Prisma client singleton
│   ├── drive/              Google Drive client, primitives, linking, encrypt
│   ├── logging/            Pino logger factory
│   ├── queue/              Rate-limit in-memory queue
│   └── storage/            Replit Object Storage wrapper
├── lib/
│   ├── auth.ts             Re-exports getServerSession
│   ├── db.ts               Re-exports Prisma client
│   ├── logger.ts           Re-exports createLogger
│   └── trpc/               client.ts + server.ts re-exports
├── middleware.ts            Auth middleware + structured HTTP request logging (requestId, method, path, ms)
└── server/
    ├── trpc.ts             tRPC init + context (auth context)
    └── routers/            _app.ts, health.ts, user.ts, drive.ts
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

## Recent Changes
- 2026-04-27: Wave 1 Foundation Layer complete:
  - Removed next-auth; implemented Replit OIDC auth
  - Prisma Wave 1 schema (9 models) migrated to PostgreSQL
  - Core modules: logging, dates (14 tests), db, audit, storage, queue, ai, drive
  - tRPC routers: health, user, drive
  - Pages: /, /sign-in, /settings, /admin/health
  - Drive linking wizard (4-step UI)
  - All TypeScript errors resolved (zero TS errors)
