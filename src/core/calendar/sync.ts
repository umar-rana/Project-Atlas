import "server-only";
import { db, newId } from "@/core/db";
import { createLogger } from "@/core/logging";
import { getCalendarClient, refreshCalendarTokenIfNeeded } from "./google-client";
import type { calendar_v3 } from "googleapis";

const log = createLogger({ module: "calendar/sync" });

const SYNC_WINDOW_PAST_DAYS = 30;
const SYNC_WINDOW_FUTURE_DAYS = 365;

function syncWindowDates(): { timeMin: string; timeMax: string } {
  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setDate(timeMin.getDate() - SYNC_WINDOW_PAST_DAYS);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + SYNC_WINDOW_FUTURE_DAYS);
  return {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  };
}

function parseGoogleDateTime(dt: calendar_v3.Schema$EventDateTime | undefined): Date | null {
  if (!dt) return null;
  if (dt.dateTime) return new Date(dt.dateTime);
  if (dt.date) {
    const d = new Date(dt.date + "T00:00:00Z");
    return d;
  }
  return null;
}

function isAllDay(event: calendar_v3.Schema$Event): boolean {
  return !!(event.start?.date && !event.start?.dateTime);
}

export async function syncCalendarListForUser(userId: string): Promise<void> {
  await refreshCalendarTokenIfNeeded(userId);
  const cal = await getCalendarClient(userId);

  const listResponse = await cal.calendarList.list({ maxResults: 250 });
  const items = listResponse.data.items ?? [];

  const now = new Date();

  for (const item of items) {
    if (!item.id || !item.summary) continue;

    await db.googleCalendar.upsert({
      where: { user_id_google_id: { user_id: userId, google_id: item.id } },
      create: {
        id: newId(),
        user_id: userId,
        google_id: item.id,
        name: item.summary,
        description: item.description ?? null,
        time_zone: item.timeZone ?? null,
        is_primary: item.primary ?? false,
        access_role: item.accessRole ?? "reader",
        google_color_id: item.colorId ?? null,
        is_visible: true,
        is_synced: true,
        last_synced_at: now,
        updated_at: now,
      },
      update: {
        name: item.summary,
        description: item.description ?? null,
        time_zone: item.timeZone ?? null,
        is_primary: item.primary ?? false,
        access_role: item.accessRole ?? "reader",
        google_color_id: item.colorId ?? null,
        last_synced_at: now,
        updated_at: now,
        deleted_at: null,
      },
    });
  }

  log.info({ userId, count: items.length }, "Calendar list synced");
}

export async function syncEventsForCalendar(
  userId: string,
  calendarDbId: string,
  googleCalendarId: string,
  existingSyncToken: string | null,
): Promise<string | null> {
  await refreshCalendarTokenIfNeeded(userId);
  const cal = await getCalendarClient(userId);

  const { timeMin, timeMax } = syncWindowDates();

  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    let response: { data: { items?: calendar_v3.Schema$Event[]; nextPageToken?: string | null; nextSyncToken?: string | null } } | null = null;
    try {
      if (existingSyncToken && !pageToken) {
        response = await cal.events.list({
          calendarId: googleCalendarId,
          syncToken: existingSyncToken,
          pageToken,
          maxResults: 250,
          singleEvents: false,
        });
      } else {
        response = await cal.events.list({
          calendarId: googleCalendarId,
          timeMin,
          timeMax,
          pageToken,
          maxResults: 250,
          singleEvents: false,
        });
      }
    } catch (err: unknown) {
      const status = (err as { code?: number })?.code;
      if (status === 410) {
        log.warn({ userId, googleCalendarId }, "Sync token invalidated — doing full sync");
        return syncEventsForCalendar(userId, calendarDbId, googleCalendarId, null);
      }
      throw err;
    }

    if (!response) break;

    const events = response.data.items ?? [];

    for (const event of events) {
      await upsertGoogleEvent(userId, calendarDbId, googleCalendarId, event);
    }

    pageToken = response.data.nextPageToken ?? undefined;
    if (!pageToken && response.data.nextSyncToken) {
      nextSyncToken = response.data.nextSyncToken;
    }
  } while (pageToken);

  return nextSyncToken;
}

async function upsertGoogleEvent(
  userId: string,
  calendarDbId: string,
  googleCalendarId: string,
  event: calendar_v3.Schema$Event,
): Promise<void> {
  if (!event.id) return;

  const allDay = isAllDay(event);
  const startAt = parseGoogleDateTime(event.start ?? undefined);
  const endAt = parseGoogleDateTime(event.end ?? undefined);

  if (!startAt || !endAt) {
    log.debug({ userId, eventId: event.id }, "Skipping event with no start/end date");
    return;
  }

  const isCancelled = event.status === "cancelled";
  const now = new Date();

  const rrule = event.recurrence?.find((r) => r.startsWith("RRULE:"))?.slice(6) ?? null;
  const recurrenceMasterGoogleId = event.recurringEventId ?? null;

  let recurrenceMasterId: string | null = null;
  if (recurrenceMasterGoogleId) {
    const master = await db.calendarEvent.findFirst({
      where: {
        user_id: userId,
        google_event_id: recurrenceMasterGoogleId,
        calendar_id: calendarDbId,
      },
      select: { id: true },
    });
    recurrenceMasterId = master?.id ?? null;
  }

  const existing = await db.calendarEvent.findFirst({
    where: {
      user_id: userId,
      google_event_id: event.id,
      calendar_id: calendarDbId,
    },
    select: { id: true },
  });

  const eventData = {
    calendar_id: calendarDbId,
    source: "google" as const,
    title: event.summary ?? "",
    description: event.description ?? null,
    location: event.location ?? null,
    start_at: startAt,
    end_at: endAt,
    all_day: allDay,
    status: isCancelled ? "cancelled" : (event.status ?? "confirmed"),
    recurrence_rule: rrule,
    recurrence_master_id: recurrenceMasterId,
    external_url: event.htmlLink ?? null,
    organizer_email: event.organizer?.email ?? null,
    organizer_name: event.organizer?.displayName ?? null,
    deleted_at: isCancelled ? now : null,
    updated_at: now,
  };

  let calendarEventId: string;

  if (existing) {
    await db.calendarEvent.update({
      where: { id: existing.id },
      data: eventData,
    });
    calendarEventId = existing.id;
  } else {
    calendarEventId = newId();
    await db.calendarEvent.create({
      data: {
        id: calendarEventId,
        user_id: userId,
        google_event_id: event.id,
        ...eventData,
      },
    });
  }

  if (!isCancelled) {
    await syncAttendees(userId, calendarEventId, event.attendees ?? []);
  }
}

async function syncAttendees(
  userId: string,
  calendarEventId: string,
  attendees: calendar_v3.Schema$EventAttendee[],
): Promise<void> {
  for (const attendee of attendees) {
    if (!attendee.email) continue;

    const personMatch = await db.personEmail.findFirst({
      where: {
        email: { equals: attendee.email, mode: "insensitive" },
        person: { user_id: userId, deleted_at: null },
        deleted_at: null,
      },
      select: { person_id: true },
    });

    const now = new Date();

    await db.calendarEventAttendee.upsert({
      where: { event_id_email: { event_id: calendarEventId, email: attendee.email } },
      create: {
        id: newId(),
        event_id: calendarEventId,
        email: attendee.email,
        display_name: attendee.displayName ?? null,
        response_status: attendee.responseStatus ?? "needsAction",
        is_organizer: attendee.organizer ?? false,
        is_self: attendee.self ?? false,
        person_id: personMatch?.person_id ?? null,
        updated_at: now,
      },
      update: {
        display_name: attendee.displayName ?? null,
        response_status: attendee.responseStatus ?? "needsAction",
        is_organizer: attendee.organizer ?? false,
        is_self: attendee.self ?? false,
        person_id: personMatch?.person_id ?? null,
        updated_at: now,
      },
    });
  }
}

export async function syncAllCalendarsForUser(userId: string): Promise<{
  calendarsSynced: number;
  eventsSynced: number;
}> {
  await syncCalendarListForUser(userId);

  const calendars = await db.googleCalendar.findMany({
    where: { user_id: userId, is_synced: true, deleted_at: null },
    select: { id: true, google_id: true, next_sync_token: true },
  });

  let totalEventsSynced = 0;

  for (const calendar of calendars) {
    try {
      const eventCountBefore = await db.calendarEvent.count({
        where: { calendar_id: calendar.id },
      });

      const newSyncToken = await syncEventsForCalendar(
        userId,
        calendar.id,
        calendar.google_id,
        calendar.next_sync_token,
      );

      const eventCountAfter = await db.calendarEvent.count({
        where: { calendar_id: calendar.id },
      });
      totalEventsSynced += Math.abs(eventCountAfter - eventCountBefore);

      await db.googleCalendar.update({
        where: { id: calendar.id },
        data: {
          next_sync_token: newSyncToken ?? calendar.next_sync_token,
          last_synced_at: new Date(),
          updated_at: new Date(),
        },
      });
    } catch (err) {
      log.error({ err, userId, calendarId: calendar.id }, "Error syncing calendar events — skipping");
    }
  }

  return { calendarsSynced: calendars.length, eventsSynced: totalEventsSynced };
}
