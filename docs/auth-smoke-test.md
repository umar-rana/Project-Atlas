# Auth Login Flow — Smoke Test Results

Verified: 2026-05-01 against live Replit dev domain.

## Test Environment

- App URL: `https://<repl-id>.sisko.replit.dev`
- Auth provider: Clerk (`@clerk/nextjs`)
- Database: PostgreSQL (Replit-managed), migrations applied

## How Auth Works (Clerk)

Authentication is handled entirely by Clerk. There are no manual OIDC state cookies, no token-exchange callbacks, and no custom session writes. The flow is:

1. **Sign-in / Sign-up** — Clerk's hosted UI is embedded at `/sign-in` and `/sign-up`. All credential handling (password, OAuth, magic link, etc.) happens inside Clerk's component.
2. **Session management** — Clerk sets its own secure, HttpOnly session cookie after a successful sign-in. The app never touches this cookie directly.
3. **Middleware protection** — `src/middleware.ts` runs `clerkMiddleware` on every request (excluding `_next/static`, `_next/image`, `favicon.ico`, and `storybook`). For any route that is not in the public allow-list, the middleware calls `auth()` to retrieve the Clerk `userId`. If `userId` is absent, the request is redirected to `/sign-in?from=<original-path>`.
4. **User record sync** — When a server component or API route needs the app's own `User` row, it calls `getOrCreateUserFromClerk()` (`src/lib/auth.ts`). This function calls Clerk's `currentUser()`, then either finds an existing `User` by `clerk_id`, links an existing `User` by email and stamps `clerk_id` onto it, or creates a new `User` row.

### Public routes (no auth required)

| Path pattern | Reason |
|---|---|
| `/` | Landing / welcome page |
| `/welcome(.*)` | Onboarding flow |
| `/privacy(.*)` | Legal |
| `/terms(.*)` | Legal |
| `/sign-in(.*)` | Clerk sign-in widget |
| `/sign-up(.*)` | Clerk sign-up widget |
| `/api/auth/test-login(.*)` | Dev-only test helper |
| `/api/drive/connect(.*)` | Google Drive OAuth initiation |
| `/api/drive/oauth-callback(.*)` | Google Drive OAuth callback |
| `/api/health(.*)` | Health check |
| `/api/trpc/health.ping(.*)` | tRPC health ping |
| `/api/trpc/waitlist.submit(.*)` | Waitlist submission |
| `/api/cron/(.*)` | Cron job endpoints |

All other routes are protected and redirect unauthenticated users to `/sign-in`.

## Smoke Test Results

| # | Route | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 1 | `GET /sign-in` | HTTP 200, renders Clerk sign-in widget | HTTP 200 | PASS |
| 2 | `GET /` (no session) | HTTP 200 (public route, no redirect) | HTTP 200 | PASS |
| 3 | `GET /tasks` (no session) | HTTP 307 → `/sign-in?from=%2Ftasks` | HTTP 307 → `/sign-in?from=%2Ftasks` | PASS |
| 4 | `GET /settings` (no session) | HTTP 307 → `/sign-in?from=%2Fsettings` | HTTP 307 → `/sign-in?from=%2Fsettings` | PASS |
| 5 | `GET /admin/health` (no session) | HTTP 307 → `/sign-in?from=%2Fadmin%2Fhealth` | HTTP 307 → `/sign-in?from=%2Fadmin%2Fhealth` | PASS |
| 6 | `GET /api/health` (no session) | HTTP 200 (public route) | HTTP 200 | PASS |
| 7 | `GET /api/cron/nightly-cleanup` (no session) | HTTP 200 (public route) | HTTP 200 | PASS |

## Notes

- Tests 3–5 confirm that `clerkMiddleware` correctly blocks unauthenticated access to protected routes and preserves the `from` redirect parameter so the user lands back on the right page after signing in.
- Tests 2, 6, and 7 confirm that routes in the `isPublicRoute` allow-list pass through without any auth check.
- The `from` parameter on the redirect URL is set from `req.nextUrl.pathname` (not the full URL) to avoid leaking query strings into the sign-in page.

## What requires a live browser session to verify

The full Clerk sign-in loop (credential entry → Clerk session cookie set → redirect back to app → `userId` present in middleware → access granted) must be verified in a real browser. Clerk's session token is an HttpOnly cookie that cannot be fabricated in a headless curl test.

The user-sync path (`getOrCreateUserFromClerk()` in `src/lib/auth.ts`) was verified by code review:
- `currentUser()` retrieves the authenticated Clerk user (lines 7–8)
- Primary lookup is by `clerk_id` (line 13)
- Fallback lookup by email links legacy records and stamps `clerk_id` (lines 18–28)
- New users are created with sensible defaults and an audit log entry (lines 30–52)

## Fixes applied during this verification

1. **Migrated auth from Replit OIDC to Clerk** — Removed `openid-client`, state cookies, `/api/auth/callback`, and custom session handling. Replaced with `@clerk/nextjs` (`clerkMiddleware`, `currentUser`).
2. **Updated `src/middleware.ts`** to use `clerkMiddleware` and `createRouteMatcher` for the public route allow-list.
3. **Updated `src/lib/auth.ts`** to use `currentUser()` from Clerk and sync the result into the app's own `User` table via `getOrCreateUserFromClerk()`.
