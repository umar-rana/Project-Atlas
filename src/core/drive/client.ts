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
