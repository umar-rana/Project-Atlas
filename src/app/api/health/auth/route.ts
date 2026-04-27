import { NextRequest, NextResponse } from "next/server";
import { resolvePublicHost } from "@/core/auth/replit-oidc";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "health/auth" });

const OIDC_DISCOVERY_URL = "https://replit.com/oidc/.well-known/openid-configuration";
const OIDC_TIMEOUT_MS = 5000;

export async function GET(req: NextRequest) {
  const checks: Record<string, { ok: boolean; message?: string; latencyMs?: number }> = {};

  const oidcStart = Date.now();
  try {
    const res = await fetch(OIDC_DISCOVERY_URL, {
      signal: AbortSignal.timeout(OIDC_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - oidcStart;
    if (!res.ok) {
      const message = `OIDC discovery returned HTTP ${res.status}`;
      log.error({ status: res.status }, "Auth health check: OIDC discovery failed");
      checks.oidc = { ok: false, message, latencyMs };
    } else {
      checks.oidc = { ok: true, latencyMs };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "OIDC discovery unreachable";
    log.error({ err }, "Auth health check: OIDC discovery failed");
    checks.oidc = { ok: false, message, latencyMs: Date.now() - oidcStart };
  }

  const host = resolvePublicHost(req.headers);
  const hostOk = host !== "localhost:3000";
  if (!hostOk) {
    log.warn({ host }, "Auth health check: host resolved to localhost fallback — proxy headers may be missing");
  }
  checks.host = {
    ok: hostOk,
    message: hostOk
      ? `Resolved host: ${host}`
      : `Host resolved to fallback (${host}) — x-forwarded-host and host headers are missing`,
  };

  const allOk = Object.values(checks).every((c) => c.ok);

  if (!allOk) {
    log.warn({ checks }, "Auth health check failed");
  }

  return NextResponse.json(
    { ok: allOk, checks, ts: new Date().toISOString() },
    { status: allOk ? 200 : 503 },
  );
}
