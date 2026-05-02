import { NextRequest } from "next/server";

/**
 * Derives the correct public base URL for redirect construction inside
 * Replit's proxied Next.js environment.
 *
 * Priority order:
 *  1. APP_URL env var  — explicit override, highest priority
 *  2. x-forwarded-proto + x-forwarded-host request headers — set by Replit's proxy
 *  3. REPLIT_DEV_DOMAIN env var — Replit development domain
 *  4. req.url origin  — fallback (may resolve to 0.0.0.0 in Replit; avoid if possible)
 */
export function getBaseUrl(req: NextRequest): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, "");
  }

  // x-forwarded-proto / x-forwarded-host are set by Replit's reverse proxy and
  // are safe to trust in this deployment context. If this app is ever deployed
  // behind a non-trusted proxy where clients can spoof these headers, set APP_URL
  // explicitly to avoid host-influenced redirects.
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    const proto = (forwardedProto.split(",")[0] ?? forwardedProto).trim();
    const host = (forwardedHost.split(",")[0] ?? forwardedHost).trim();
    return `${proto}://${host}`;
  }

  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }

  const parsed = new URL(req.url);
  return parsed.origin;
}
