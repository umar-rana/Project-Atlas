import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/sign-in",
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/logout",
  "/api/auth/test-login",
  "/api/drive/connect",
  "/api/drive/oauth-callback",
  "/api/health",
  "/api/trpc/health.ping",
  "/api/cron/cleanup-sessions",
  "/_next",
  "/favicon.ico",
  "/storybook",
];

function edgeLog(
  level: "info" | "warn",
  msg: string,
  fields: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      level: level === "info" ? 30 : 40,
      time: new Date().toISOString(),
      module: "http",
      msg,
      ...fields,
    }),
  );
}

async function verifySignedToken(
  signedToken: string,
  secret: string,
): Promise<boolean> {
  const parts = signedToken.split(".");
  if (parts.length < 3) return false;
  const providedHmac = parts[parts.length - 1] ?? "";
  const expiresMs = parts[parts.length - 2] ?? "";
  const rawToken = parts.slice(0, -2).join(".");
  if (!rawToken || rawToken.length < 32 || providedHmac.length < 32) return false;

  const expiry = parseInt(expiresMs, 10);
  if (isNaN(expiry) || expiry < Date.now()) return false;

  const payload = `${rawToken}.${expiresMs}`;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    keyMaterial,
    new TextEncoder().encode(payload),
  );
  const expectedHmac = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (providedHmac.length !== expectedHmac.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHmac.length; i++) {
    diff |= providedHmac.charCodeAt(i) ^ expectedHmac.charCodeAt(i);
  }
  return diff === 0;
}

function extractSessionId(signedToken: string): string {
  const parts = signedToken.split(".");
  const rawToken = parts.slice(0, -2).join(".");
  return rawToken.slice(0, 8);
}

export async function middleware(req: NextRequest) {
  const start = Date.now();
  const { pathname } = req.nextUrl;
  const requestId = Math.random().toString(36).slice(2, 10);
  const method = req.method;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (isPublic) {
    const response = NextResponse.next();
    response.headers.set("x-request-id", requestId);
    edgeLog("info", "http request", {
      request_id: requestId,
      method,
      path: pathname,
      ms: Date.now() - start,
      auth: "public",
    });
    return response;
  }

  // Session verification is HMAC+expiry based only (no DB round-trip) for Edge
  // performance. Downstream protectedProcedures perform DB-backed session lookups,
  // providing revocation checks for all authenticated API calls.
  const sessionSecret = process.env.SESSION_SECRET;
  const signedToken = req.cookies.get("atlas_session")?.value;
  const authed =
    !!(signedToken &&
      sessionSecret &&
      (await verifySignedToken(signedToken, sessionSecret)));

  if (!authed) {
    edgeLog("warn", "http request unauthenticated", {
      request_id: requestId,
      method,
      path: pathname,
      ms: Date.now() - start,
    });
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("from", pathname);
    return NextResponse.redirect(signIn);
  }

  const sessionPrefix = signedToken ? extractSessionId(signedToken) : "?";
  const response = NextResponse.next();
  response.headers.set("x-request-id", requestId);
  edgeLog("info", "http request", {
    request_id: requestId,
    method,
    path: pathname,
    ms: Date.now() - start,
    session: sessionPrefix,
  });
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|storybook).*)",
  ],
};
