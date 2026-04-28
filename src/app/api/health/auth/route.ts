import { NextResponse } from "next/server";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "health/auth" });

const CLERK_JWKS_URL = "https://api.clerk.com/v1/jwks";
const TIMEOUT_MS = 5000;

export async function GET() {
  const checks: Record<string, { ok: boolean; message?: string; latencyMs?: number }> = {};

  const clerkStart = Date.now();
  try {
    const res = await fetch(CLERK_JWKS_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Date.now() - clerkStart;
    if (!res.ok) {
      const message = `Clerk JWKS returned HTTP ${res.status}`;
      log.error({ status: res.status }, "Auth health check: Clerk JWKS fetch failed");
      checks.clerk = { ok: false, message, latencyMs };
    } else {
      checks.clerk = { ok: true, latencyMs };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Clerk JWKS unreachable";
    log.error({ err }, "Auth health check: Clerk JWKS fetch failed");
    checks.clerk = { ok: false, message, latencyMs: Date.now() - clerkStart };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  if (!allOk) {
    log.warn({ checks }, "Auth health check failed");
  }

  return NextResponse.json(
    { ok: allOk, checks, ts: new Date().toISOString() },
    { status: allOk ? 200 : 503 },
  );
}
