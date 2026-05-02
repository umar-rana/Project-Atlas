import 'server-only';
import { google } from "googleapis";
import { db, newId } from "@/core/db";
import { decryptToken, encryptToken } from "./encrypt";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "drive/client" });

export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth env vars not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(state: string): string {
  const oauth = getOAuthClient();
  return oauth.generateAuthUrl({
    access_type: "offline",
    scope: DRIVE_SCOPES,
    state,
    prompt: "consent",
  });
}

export async function exchangeCode(code: string, userId: string) {
  const oauth = getOAuthClient();
  const { tokens } = await oauth.getToken(code);

  if (!tokens.access_token) {
    throw new Error("No access token in OAuth response");
  }

  const tokenData = JSON.stringify(tokens);
  const encrypted = encryptToken(tokenData);

  await db.integrationToken.upsert({
    where: { user_id_provider: { user_id: userId, provider: "google_drive" } },
    create: {
      id: newId(),
      user_id: userId,
      provider: "google_drive",
      encrypted_data: encrypted,
      scopes: DRIVE_SCOPES,
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
    update: {
      encrypted_data: encrypted,
      scopes: DRIVE_SCOPES,
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
  });

  log.info({ userId }, "Google Drive token stored (encrypted)");
}

export async function getDriveClient(userId: string) {
  const token = await db.integrationToken.findUnique({
    where: { user_id_provider: { user_id: userId, provider: "google_drive" } },
  });

  if (!token) {
    throw new Error("No Drive token found for user");
  }

  const oauth = getOAuthClient();
  const tokenData = JSON.parse(decryptToken(token.encrypted_data));
  oauth.setCredentials(tokenData);

  oauth.on("tokens", async (newTokens) => {
    const merged = { ...tokenData, ...newTokens };
    const encrypted = encryptToken(JSON.stringify(merged));
    await db.integrationToken.update({
      where: { user_id_provider: { user_id: userId, provider: "google_drive" } },
      data: {
        encrypted_data: encrypted,
        expires_at: newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
      },
    });
    log.info({ userId }, "Google Drive token refreshed");
  });

  return google.drive({ version: "v3", auth: oauth });
}

export async function hasDriveToken(userId: string): Promise<boolean> {
  const token = await db.integrationToken.findUnique({
    where: { user_id_provider: { user_id: userId, provider: "google_drive" } },
  });
  return !!token;
}

/**
 * Proactively refresh the Drive OAuth token for a user if it is expired or
 * about to expire within the next 5 minutes.  Persists the new token to the
 * database so subsequent getDriveClient calls receive fresh credentials.
 *
 * Throws with a descriptive message if the refresh fails (e.g. token revoked),
 * so the caller can surface the error clearly rather than failing silently
 * per-file inside a sync job.
 */
export async function refreshDriveTokenIfNeeded(userId: string): Promise<void> {
  const record = await db.integrationToken.findUnique({
    where: { user_id_provider: { user_id: userId, provider: "google_drive" } },
  });

  if (!record) {
    throw new Error("No Drive token found for user — re-link Google Drive to continue syncing");
  }

  const tokenData = JSON.parse(decryptToken(record.encrypted_data)) as {
    access_token?: string;
    refresh_token?: string;
    expiry_date?: number;
  };

  if (!tokenData.refresh_token) {
    log.warn({ userId }, "No refresh_token present — cannot proactively refresh");
    return;
  }

  const expiresAt = tokenData.expiry_date ?? 0;
  const fiveMinutesMs = 5 * 60 * 1000;
  const needsRefresh = expiresAt - Date.now() < fiveMinutesMs;

  if (!needsRefresh) {
    return;
  }

  log.info({ userId, expiresAt }, "Drive token expiring soon — proactively refreshing");

  const oauth = getOAuthClient();
  oauth.setCredentials(tokenData);

  let newTokens: { access_token?: string | null; expiry_date?: number | null };
  try {
    const refreshResult = await oauth.refreshAccessToken();
    newTokens = refreshResult.credentials;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Drive OAuth token refresh failed for user — re-link Google Drive to restore sync. Detail: ${message}`,
    );
  }

  if (!newTokens.access_token) {
    throw new Error("Drive OAuth refresh returned no access_token — re-link Google Drive to restore sync");
  }

  const merged = { ...tokenData, ...newTokens };
  const encrypted = encryptToken(JSON.stringify(merged));

  await db.integrationToken.update({
    where: { user_id_provider: { user_id: userId, provider: "google_drive" } },
    data: {
      encrypted_data: encrypted,
      expires_at: newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
    },
  });

  log.info({ userId }, "Drive token proactively refreshed before sync");
}
