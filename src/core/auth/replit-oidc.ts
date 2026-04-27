import * as openidClient from "openid-client";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "auth/oidc" });

let _config: openidClient.Configuration | null = null;

export async function getOidcConfig(): Promise<openidClient.Configuration> {
  if (_config) return _config;
  _config = await openidClient.discovery(
    new URL("https://replit.com/oidc"),
    process.env.REPL_ID!,
  );
  return _config;
}

/**
 * Resolves the public-facing host from request headers.
 *
 * Priority order:
 *  1. `x-forwarded-host` — set by the reverse proxy on the deployed / custom-domain app
 *  2. `host` header — the raw Host sent by the client
 *  3. `APP_URL` env variable — optional hardcoded fallback (e.g. https://atlas.insightive.io)
 *
 * Returns only the host portion (no protocol).
 */
function isInternalHost(h: string): boolean {
  return h.startsWith("0.0.0.0") || h.startsWith("127.0.0.1") || h.startsWith("localhost");
}

export function resolvePublicHost(headers: Headers): string {
  const forwardedHost = headers.get("x-forwarded-host");
  if (forwardedHost) {
    const first = forwardedHost.split(",")[0]?.trim();
    if (first && !isInternalHost(first)) return first;
  }

  const host = headers.get("host");
  if (host && !isInternalHost(host)) {
    return host;
  }

  const appUrl = process.env.APP_URL;
  if (appUrl) {
    try {
      return new URL(appUrl).host;
    } catch {
    }
  }

  const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;
  if (replitDevDomain) return replitDevDomain;

  return host ?? "localhost:3000";
}

/**
 * Resolves the full public-facing base URL (protocol + host) from request headers.
 *
 * Follows the same priority as resolvePublicHost, then determines the protocol
 * from the environment / host patterns.
 */
export function resolvePublicBaseUrl(headers: Headers): string {
  const host = resolvePublicHost(headers);
  const isSecure =
    process.env.NODE_ENV === "production" ||
    !!process.env.REPLIT_DEV_DOMAIN ||
    host.endsWith(".replit.dev") ||
    host.endsWith(".repl.co");
  const proto = isSecure ? "https" : "http";
  return `${proto}://${host}`;
}

export function getCallbackUrl(host: string): string {
  const isSecure =
    process.env.NODE_ENV === "production" ||
    !!process.env.REPLIT_DEV_DOMAIN ||
    host.endsWith(".replit.dev") ||
    host.endsWith(".repl.co");
  const proto = isSecure ? "https" : "http";
  return `${proto}://${host}/api/auth/callback`;
}

export type AuthMethod = "google" | "magic_link";

export async function buildLoginUrl(
  host: string,
  state: string,
  method: AuthMethod = "google",
): Promise<URL> {
  const config = await getOidcConfig();
  const callbackUrl = getCallbackUrl(host);

  const extraParams: Record<string, string> = {};
  if (method === "magic_link") {
    extraParams.acr_values = "magic_link";
    extraParams.prompt = "login";
  }

  const url = openidClient.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    state,
    ...extraParams,
  });

  return url;
}

export async function handleCallback(
  host: string,
  currentUrl: URL,
  expectedState: string,
): Promise<{
  sub: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
}> {
  const config = await getOidcConfig();
  const callbackUrl = getCallbackUrl(host);

  const tokens = await openidClient.authorizationCodeGrant(
    config,
    currentUrl,
    { expectedState },
    { redirect_uri: callbackUrl },
  );

  const claims = tokens.claims();
  if (!claims) throw new Error("No claims in token response");

  log.debug({ sub: claims.sub }, "OIDC callback handled");

  return {
    sub: claims.sub,
    email: claims.email as string | undefined,
    firstName: (claims as Record<string, string>).first_name,
    lastName: (claims as Record<string, string>).last_name,
    profileImageUrl: (claims as Record<string, string>).profile_image_url,
  };
}
