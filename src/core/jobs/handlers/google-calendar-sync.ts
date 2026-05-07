import "server-only";
import { db } from "@/core/db";
import { createLogger } from "@/core/logging";
import { syncAllCalendarsForUser } from "@/core/calendar/sync";
import { hasCalendarToken } from "@/core/calendar/google-client";

const log = createLogger({ module: "jobs/google-calendar-sync" });

export async function handleGoogleCalendarSync(): Promise<{
  usersProcessed: number;
  errors: number;
}> {
  log.info({}, "Starting nightly Google Calendar sync job");

  const usersWithTokens = await db.googleCalendarOAuthToken.findMany({
    select: { user_id: true },
  });

  let usersProcessed = 0;
  let errors = 0;

  for (const { user_id } of usersWithTokens) {
    try {
      const hasToken = await hasCalendarToken(user_id);
      if (!hasToken) continue;

      const result = await syncAllCalendarsForUser(user_id);
      usersProcessed++;

      log.info(
        { userId: user_id, ...result },
        "Calendar sync completed for user",
      );
    } catch (err) {
      errors++;
      log.error({ err, userId: user_id }, "Calendar sync failed for user — continuing");
    }
  }

  log.info({ usersProcessed, errors }, "Nightly Google Calendar sync job complete");
  return { usersProcessed, errors };
}
