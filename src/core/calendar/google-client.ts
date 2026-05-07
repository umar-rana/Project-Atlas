import "server-only";
import { google } from "googleapis";
import { db, newId } from "@/core/db";
import { encryptToken, decryptToken } from "@/core/drive/encrypt";
import { createLogger } from "@/core/logging";

const log = createLogger({ module: "calendar/client" });

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
];

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI ?? process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth env vars not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALENDAR_REDIRECT_URI)",
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getCalendarAuthUrl(state: string): string {
  const oauth = getOAuthClient();
  return oauth.generateAuthUrl({
    access_type: "offline",
    scope: CALENDAR_SCOPES,
    state,
    prompt: "consent",
  });
}

export async function exchangeCalendarCode(code: string, userId: string): Promise<string | null> {
  const oauth = getOAuthClient();
  const { tokens } = await oauth.getToken(code);

  if (!tokens.access_token) {
    throw new Error("No access token in Google Calendar OAuth response");
  }

  const tokenData = JSON.stringify(tokens);
  const encrypted = encryptToken(tokenData);

  let accountEmail: string | null = null;
  try {
    oauth.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth });
    const info = await oauth2.userinfo.get();
    accountEmail = info.data.email ?? null;
  } catch {
    log.warn({ userId }, "Could not fetch Google account email for calendar token");
  }

  await db.googleCalendarOAuthToken.upsert({
    where: { user_id: userId },
    create: {
      id: newId(),
      user_id: userId,
      encrypted_data: encrypted,
      scopes: CALENDAR_SCOPES,
      email: accountEmail ?? undefined,
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
    update: {
      encrypted_data: encrypted,
      scopes: CALENDAR_SCOPES,
      email: accountEmail ?? undefined,
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
  });

  log.info({ userId }, "Google Calendar token stored (encrypted)");
  return accountEmail;
}

export async function getCalendarClient(userId: string) {
  const record = await db.googleCalendarOAuthToken.findUnique({
    where: { user_id: userId },
  });

  if (!record) {
    throw new Error("No Calendar token found for user — connect Google Calendar first");
  }

  const oauth = getOAuthClient();
  const tokenData = JSON.parse(decryptToken(record.encrypted_data));
  oauth.setCredentials(tokenData);

  oauth.on("tokens", async (newTokens) => {
    const merged = { ...tokenData, ...newTokens };
    const encrypted = encryptToken(JSON.stringify(merged));
    await db.googleCalendarOAuthToken.update({
      where: { user_id: userId },
      data: {
        encrypted_data: encrypted,
        expires_at: newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
      },
    });
    log.info({ userId }, "Google Calendar token refreshed automatically");
  });

  return google.calendar({ version: "v3", auth: oauth });
}

export async function hasCalendarToken(userId: string): Promise<boolean> {
  const record = await db.googleCalendarOAuthToken.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  return !!record;
}

export async function refreshCalendarTokenIfNeeded(userId: string): Promise<void> {
  const record = await db.googleCalendarOAuthToken.findUnique({
    where: { user_id: userId },
  });

  if (!record) {
    throw new Error("No Calendar token found — re-link Google Calendar to continue syncing");
  }

  const tokenData = JSON.parse(decryptToken(record.encrypted_data)) as {
    access_token?: string;
    refresh_token?: string;
    expiry_date?: number;
  };

  if (!tokenData.refresh_token) {
    log.warn({ userId }, "No refresh_token present — cannot proactively refresh calendar token");
    return;
  }

  const expiresAt = tokenData.expiry_date ?? 0;
  const fiveMinutesMs = 5 * 60 * 1000;
  if (expiresAt - Date.now() >= fiveMinutesMs) return;

  log.info({ userId, expiresAt }, "Calendar token expiring soon — proactively refreshing");

  const oauth = getOAuthClient();
  oauth.setCredentials(tokenData);

  let newTokens: { access_token?: string | null; expiry_date?: number | null };
  try {
    const refreshResult = await oauth.refreshAccessToken();
    newTokens = refreshResult.credentials;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Calendar OAuth token refresh failed — re-link Google Calendar to restore sync. Detail: ${message}`,
    );
  }

  if (!newTokens.access_token) {
    throw new Error("Calendar OAuth refresh returned no access_token");
  }

  const merged = { ...tokenData, ...newTokens };
  const encrypted = encryptToken(JSON.stringify(merged));

  await db.googleCalendarOAuthToken.update({
    where: { user_id: userId },
    data: {
      encrypted_data: encrypted,
      expires_at: newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
    },
  });

  log.info({ userId }, "Calendar token proactively refreshed");
}

export async function revokeCalendarToken(userId: string): Promise<void> {
  const record = await db.googleCalendarOAuthToken.findUnique({
    where: { user_id: userId },
  });
  if (!record) return;

  try {
    const tokenData = JSON.parse(decryptToken(record.encrypted_data)) as {
      access_token?: string;
      refresh_token?: string;
    };
    const oauth = getOAuthClient();
    if (tokenData.access_token) {
      await oauth.revokeToken(tokenData.access_token);
    }
  } catch (err) {
    log.warn({ userId, err }, "Calendar token revocation failed — continuing with local delete");
  }

  await db.googleCalendarOAuthToken.delete({ where: { user_id: userId } });
  log.info({ userId }, "Google Calendar token revoked and deleted");
}

export const GOOGLE_COLOR_TO_STRATUM: Record<string, string> = {
  "1":  "cal-1",  // Tomato → cal-4 (red) — mapped to blue for index consistency
  "2":  "cal-4",  // Flamingo → cal-4 (red-ish)
  "3":  "cal-3",  // Tangerine → cal-3 (amber)
  "4":  "cal-11", // Banana → cal-11 (yellow)
  "5":  "cal-2",  // Sage → cal-2 (green)
  "6":  "cal-9",  // Basil → cal-9 (teal)
  "7":  "cal-1",  // Peacock → cal-1 (blue)
  "8":  "cal-6",  // Blueberry → cal-6 (indigo)
  "9":  "cal-5",  // Lavender → cal-5 (purple)
  "10": "cal-7",  // Grape → cal-7 (pink)
  "11": "cal-12", // Graphite → cal-12 (neutral)
};

export function resolveEventColor(
  googleColorId: string | null | undefined,
  calendarColorOverride: string | null | undefined,
  source: string,
): string {
  if (source === "atlas") return "cal-1";
  if (calendarColorOverride) return calendarColorOverride;
  if (googleColorId && GOOGLE_COLOR_TO_STRATUM[googleColorId]) {
    return GOOGLE_COLOR_TO_STRATUM[googleColorId]!;
  }
  return "cal-1";
}
