# Auth Login Flow — Smoke Test Results

Verified: 2026-04-27 against live Replit dev domain.

## Test Environment

- App URL: `https://<repl-id>.sisko.replit.dev`
- Auth provider: Replit OIDC (`https://replit.com/oidc`)
- Database: PostgreSQL (Replit-managed), migrations applied

## Results

| # | Route | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 1 | `GET /sign-in` | HTTP 200, renders sign-in page | HTTP 200 | PASS |
| 2 | `GET /api/auth/login?method=google` | HTTP 307 → Replit OIDC auth endpoint with correct `redirect_uri`, `scope`, `state`, `client_id` | HTTP 307 → `https://replit.com/oidc/auth?redirect_uri=…/api/auth/callback&scope=openid+email+profile+offline_access&state=<hex>&client_id=<repl_id>` | PASS |
| 3 | `GET /` (no session) | HTTP 307 → `/sign-in?from=%2F` | HTTP 307 → `/sign-in?from=%2F` | PASS |
| 4 | `GET /admin/health` (no session) | HTTP 307 → `/sign-in?from=%2Fadmin%2Fhealth` | HTTP 307 → `/sign-in?from=%2Fadmin%2Fhealth` | PASS |
| 5 | `GET /settings` (no session) | HTTP 307 → `/sign-in?from=%2Fsettings` | HTTP 307 → `/sign-in?from=%2Fsettings` | PASS |
| 6 | `GET /api/auth/logout` (no session) | HTTP 307 → `/sign-in` | HTTP 307 → `/sign-in` | PASS |
| 7 | `GET /api/auth/callback?code=fake&state=wrong` (no OIDC state cookie) | HTTP 307 → `/sign-in?error=state_missing` | HTTP 307 → `/sign-in?error=state_missing` | PASS |

## Notes

- Test 2 confirms the full OIDC authorization URL is correctly formed, including:
  - `redirect_uri` pointing back to the live app's `/api/auth/callback`
  - `scope` includes `openid email profile offline_access`
  - `state` is a fresh random 32-char hex string per request
- Tests 3–5 confirm the Edge middleware correctly blocks unauthenticated access and preserves the `from` redirect parameter
- Test 7 confirms the callback route's state validation works: missing OIDC cookie → safe redirect to sign-in

## What requires a live browser session to verify

The OIDC callback loop (Replit IdP → authorization code → token exchange → User/Session DB write → session cookie set → redirect to `/`) requires a real user browser session with Replit's identity provider. This cannot be simulated in a headless curl test.

The callback code path (`src/app/api/auth/callback/route.ts`) was verified by code review against the openid-client v6 API:
- State cookie validation (line 14–17)
- `handleCallback` exchanges authorization code for tokens (line 21)
- User is upserted in DB (lines 27–62)
- Session is created and signed (line 64–67)
- Cookie is set with `httpOnly`, `secure`, `sameSite: lax` (lines 70–76)
- State cookie is deleted after use (line 77)

## Fixes applied during this verification

1. **Applied pending Prisma migrations** (`20260427043022_wave1_foundation`, `20260427050511_wave1_uuidv7_pks`) — User, Session, and all Wave 1 tables now exist in the database.
2. **Added `serverExternalPackages: ['pino', 'pino-pretty']` to `next.config.mjs`** — Prevents Next.js from bundling pino's worker-thread-dependent transport, eliminating uncaughtException errors in dev mode.
3. **Updated `scripts/post-merge.sh`** to run `prisma generate` and `prisma migrate deploy` — ensures the Prisma client and DB schema are always ready after merges.
