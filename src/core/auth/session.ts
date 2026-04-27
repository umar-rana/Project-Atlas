import { cookies } from "next/headers";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import { randomBytes, createHmac } from "crypto";

const log = createLogger({ module: "auth/session" });
const SESSION_COOKIE = "atlas_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_PROBABILITY = 0.05;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is not set");
  return secret;
}

export function signSessionToken(rawToken: string, expiresAt: Date): string {
  const expiresMs = expiresAt.getTime().toString();
  const payload = `${rawToken}.${expiresMs}`;
  const hmac = createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  return `${payload}.${hmac}`;
}

export function verifySessionToken(signedToken: string): string | null {
  const parts = signedToken.split(".");
  if (parts.length < 3) return null;
  const providedHmac = parts[parts.length - 1] ?? "";
  const expiresMs = parts[parts.length - 2] ?? "";
  const rawToken = parts.slice(0, -2).join(".");
  if (!rawToken || rawToken.length < 32) return null;
  const payload = `${rawToken}.${expiresMs}`;
  const expectedHmac = createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  if (providedHmac !== expectedHmac) return null;
  if (parseInt(expiresMs, 10) < Date.now()) return null;
  return rawToken;
}

export async function purgeExpiredSessions(): Promise<number> {
  const result = await db.session.deleteMany({
    where: { expires_at: { lt: new Date() } },
  });
  if (result.count > 0) {
    log.info({ count: result.count }, "Purged expired sessions");
  }
  return result.count;
}

export async function createSession(
  userId: string,
  meta?: { userAgent?: string; ipAddress?: string },
): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.session.create({
    data: {
      id: newId(),
      user_id: userId,
      token: rawToken,
      expires_at: expiresAt,
      user_agent: meta?.userAgent ?? null,
      ip_address: meta?.ipAddress ?? null,
    },
  });

  log.debug({ userId }, "Session created");
  return signSessionToken(rawToken, expiresAt);
}

async function resolveSession(signedToken: string, warnOnHmacFailure = false) {
  const rawToken = verifySessionToken(signedToken);
  if (!rawToken) {
    if (warnOnHmacFailure) {
      log.warn("Session token HMAC verification failed — rejecting");
    }
    return null;
  }

  const session = await db.session.findUnique({
    where: { token: rawToken },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expires_at < new Date()) {
    await db.session.delete({ where: { token: rawToken } });
    return null;
  }

  await db.session.update({
    where: { token: rawToken },
    data: { last_seen: new Date() },
  });

  if (Math.random() < CLEANUP_PROBABILITY) {
    purgeExpiredSessions().catch((err) =>
      log.warn({ err }, "Background session purge failed"),
    );
  }

  return session;
}

export async function getSessionUser(signedToken: string) {
  const session = await resolveSession(signedToken, true);
  return session?.user ?? null;
}

export async function getSessionInfo(signedToken: string) {
  const session = await resolveSession(signedToken, false);
  if (!session) return null;
  return { user: session.user, sessionId: session.id };
}

export async function deleteSession(signedToken: string): Promise<void> {
  const rawToken = verifySessionToken(signedToken);
  if (!rawToken) return;
  await db.session.deleteMany({ where: { token: rawToken } });
}

export async function getServerSession() {
  const cookieStore = await cookies();
  const signedToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!signedToken) return null;
  return getSessionUser(signedToken);
}

export async function getServerSessionInfo() {
  const cookieStore = await cookies();
  const signedToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!signedToken) return null;
  return getSessionInfo(signedToken);
}

export function SESSION_COOKIE_NAME() {
  return SESSION_COOKIE;
}

export function SESSION_MAX_AGE() {
  return SESSION_TTL_MS / 1000;
}
