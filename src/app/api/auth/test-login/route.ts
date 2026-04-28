// CI-only auth shortcut.
//
// This route is FULLY DISABLED in production. It returns 404 unless ALL of
// the following are true:
//   1. `E2E_AUTH_SECRET` is set with a value of length >= 32
//   2. EITHER `NODE_ENV !== "production"` OR `E2E_ALLOW_IN_PRODUCTION === "1"`
//      is also set (defense in depth — `next start` forces NODE_ENV to
//      "production" even in CI, so the CI job opts in explicitly).
//
// In the real production deployment neither env var is set, so the route
// 404s and the bypass effectively does not exist.
//
// When enabled, callers must present the secret via the `Authorization:
// Bearer <secret>` header. On success the route provisions a deterministic
// test user (e2e@atlas.test), mints a session, and writes the session cookie
// — exactly the same cookie the OIDC callback would set.
//
// This exists so the end-to-end suite can sign in headlessly inside CI
// without a human-copied cookie. See `e2e/task-list.e2e.mjs` and
// `.github/workflows/ci.yml`.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db, newId } from "@/core/db";
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/core/auth/session";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "auth/test-login" });

const TEST_USER_EMAIL = "e2e@atlas.test";
const TEST_USER_NAME = "Atlas E2E";

function getConfiguredSecret(): string | null {
  const secret = process.env.E2E_AUTH_SECRET;
  if (!secret || secret.length < 32) return null;

  // Defense in depth: even if E2E_AUTH_SECRET is somehow set in production,
  // the route stays disabled unless the operator also sets
  // E2E_ALLOW_IN_PRODUCTION=1. CI sets both because `next start` forces
  // NODE_ENV=production; the real production deployment sets neither.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.E2E_ALLOW_IN_PRODUCTION !== "1"
  ) {
    return null;
  }

  return secret;
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function POST(req: NextRequest) {
  const configuredSecret = getConfiguredSecret();
  if (!configuredSecret) {
    // Endpoint is disabled — pretend it doesn't exist.
    return new NextResponse("Not Found", { status: 404 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!provided || !constantTimeEquals(provided, configuredSecret)) {
    log.warn("test-login secret mismatch");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let user = await db.user.findUnique({ where: { email: TEST_USER_EMAIL } });
  if (!user) {
    user = await db.user.create({
      data: {
        id: newId(),
        email: TEST_USER_EMAIL,
        name: TEST_USER_NAME,
        timezone: "UTC",
        date_format: "DD/MM/YYYY",
        time_format: "24h",
        week_start: "monday",
        theme: "dark",
      },
    });
  }

  const token = await createSession(user.id, {
    userAgent: req.headers.get("user-agent") ?? "atlas-e2e",
    ipAddress:
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      undefined,
  });

  log.warn(
    { userId: user.id, email: user.email },
    "test-login granted session (E2E_AUTH_SECRET is enabled — must NOT be set in production)",
  );

  const cookieName = SESSION_COOKIE_NAME();
  const response = NextResponse.json({
    ok: true,
    cookieName,
    cookieValue: token,
    user: { id: user.id, email: user.email },
  });
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE(),
    path: "/",
  });
  return response;
}
