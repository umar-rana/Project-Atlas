// CI-only auth shortcut.
//
// This route is FULLY DISABLED in production. It returns 404 unless ALL of
// the following are true:
//   1. `E2E_AUTH_SECRET` is set with a value of length >= 32
//   2. EITHER `NODE_ENV !== "production"` OR `E2E_ALLOW_IN_PRODUCTION === "1"`
//      is also set (defense in depth).
//
// When enabled, callers must present the secret via the `Authorization:
// Bearer <secret>` header. On success the route finds or creates the
// deterministic test user (e2e@atlas.test) in both Clerk and Prisma, then
// creates a Clerk sign-in token and returns a JSON payload with:
//   { ok, signInUrl, user }
//
// The E2E runner should navigate the browser to `signInUrl` and wait for
// the redirect to complete before proceeding with the test.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "auth/test-login" });

const TEST_USER_EMAIL = "e2e.atlas@example.com";
const TEST_USER_NAME = "Atlas E2E";

function getConfiguredSecret(): string | null {
  const secret = process.env.E2E_AUTH_SECRET;
  if (!secret || secret.length < 32) return null;

  if (process.env.NODE_ENV === "production" && process.env.E2E_ALLOW_IN_PRODUCTION !== "1") {
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

  const clerk = await clerkClient();

  // Find or create the test user in Clerk
  let clerkUserId: string;
  const clerkUsers = await clerk.users.getUserList({
    emailAddress: [TEST_USER_EMAIL],
  });

  if (clerkUsers.totalCount > 0 && clerkUsers.data[0]) {
    clerkUserId = clerkUsers.data[0].id;
  } else {
    const created = await clerk.users.createUser({
      emailAddress: [TEST_USER_EMAIL],
      firstName: "Atlas",
      lastName: "E2E",
      skipPasswordRequirement: true,
    });
    clerkUserId = created.id;
  }

  // Find or create the test user in Prisma
  let user = await db.user.findUnique({ where: { clerk_id: clerkUserId } });
  if (!user) {
    user = await db.user.findUnique({ where: { email: TEST_USER_EMAIL } });
    if (user) {
      user = await db.user.update({
        where: { id: user.id },
        data: { clerk_id: clerkUserId },
      });
    } else {
      user = await db.user.create({
        data: {
          id: newId(),
          clerk_id: clerkUserId,
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
  }

  // Create a Clerk sign-in token (valid for 5 minutes)
  const signInToken = await clerk.signInTokens.createSignInToken({
    userId: clerkUserId,
    expiresInSeconds: 300,
  });

  log.warn(
    { userId: user.id, email: user.email },
    "test-login granted sign-in token (E2E_AUTH_SECRET must NOT be set in production)",
  );

  const signInUrl = `/sign-in#/?__clerk_ticket=${signInToken.token}`;

  return NextResponse.json({
    ok: true,
    signInUrl,
    user: { id: user.id, email: user.email },
  });
}
