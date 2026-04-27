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
