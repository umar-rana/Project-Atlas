import { router, protectedProcedure } from "@/server/trpc";
import { db, newId } from "@/core/db";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { logActivity } from "@/core/audit";
import { calendarEventCreateSchema, calendarEventUpdateSchema, STRATUM_CALENDAR_TOKENS } from "@/core/calendar/validation";
import { expandEventsInWindow } from "@/core/calendar/rrule";
import { hasCalendarToken } from "@/core/calendar/google-client";

const CALENDAR_WINDOW_SCHEMA = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
  calendar_ids: z.array(z.string().uuid()).optional(),
  include_cancelled: z.boolean().default(false),
});

async function assertLinkedEntitiesOwnership(
  userId: string,
  input: {
    linked_task_id?: string | null;
    linked_project_id?: string | null;
    linked_note_id?: string | null;
  },
) {
  if (input.linked_task_id) {
    const task = await db.task.findFirst({ where: { id: input.linked_task_id, user_id: userId, deleted_at: null } });
    if (!task) throw new TRPCError({ code: "FORBIDDEN", message: "Task not found or not owned by user" });
  }
  if (input.linked_project_id) {
    const project = await db.project.findFirst({ where: { id: input.linked_project_id, user_id: userId, deleted_at: null } });
    if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Project not found or not owned by user" });
  }
  if (input.linked_note_id) {
    const note = await db.note.findFirst({ where: { id: input.linked_note_id, user_id: userId, deleted_at: null } });
    if (!note) throw new TRPCError({ code: "FORBIDDEN", message: "Note not found or not owned by user" });
  }
}

const EVENT_INCLUDE = {
  calendar: { select: { id: true, name: true, google_color_id: true, color_override: true } },
  attendees: { include: { person: { select: { id: true, display_name: true, given_name: true, family_name: true } } } },
  linked_task: { select: { id: true, title: true, status: true } },
  linked_project: { select: { id: true, title: true, color: true } },
  linked_note: { select: { id: true, title: true } },
} as const;

const eventsRouter = router({
  list: protectedProcedure
    .input(CALENDAR_WINDOW_SCHEMA)
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const visibleCalendarIds = input.calendar_ids?.length
        ? (await db.googleCalendar.findMany({
            where: { id: { in: input.calendar_ids }, user_id: userId, deleted_at: null, is_visible: true },
            select: { id: true },
          })).map((c) => c.id)
        : (await db.googleCalendar.findMany({
            where: { user_id: userId, deleted_at: null, is_visible: true },
            select: { id: true },
          })).map((c) => c.id);

      const statusFilter = input.include_cancelled ? undefined : { not: "cancelled" as const };

      const calendarFilter = visibleCalendarIds.length > 0
        ? { OR: [{ calendar_id: { in: visibleCalendarIds } }, { calendar_id: null }] }
        : { calendar_id: null };

      const [nonRecurring, recurringMasters, overrideInstances] = await Promise.all([
        db.calendarEvent.findMany({
          where: {
            user_id: userId,
            deleted_at: null,
            recurrence_rule: null,
            recurrence_master_id: null,
            start_at: { lte: input.end },
            end_at: { gte: input.start },
            ...(statusFilter && { status: statusFilter }),
            ...calendarFilter,
          },
          include: EVENT_INCLUDE,
          orderBy: { start_at: "asc" },
        }),
        db.calendarEvent.findMany({
          where: {
            user_id: userId,
            deleted_at: null,
            recurrence_rule: { not: null },
            recurrence_master_id: null,
            start_at: { lte: input.end },
            ...(statusFilter && { status: statusFilter }),
            ...calendarFilter,
          },
          include: EVENT_INCLUDE,
          orderBy: { start_at: "asc" },
        }),
        db.calendarEvent.findMany({
          where: {
            user_id: userId,
            deleted_at: null,
            recurrence_master_id: { not: null },
            start_at: { lte: input.end },
            end_at: { gte: input.start },
          },
          include: EVENT_INCLUDE,
          orderBy: { start_at: "asc" },
        }),
      ]);

      const allEvents = [...recurringMasters, ...overrideInstances, ...nonRecurring];
      return expandEventsInWindow(allEvents, input.start, input.end);
    }),

  today: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const events = await db.calendarEvent.findMany({
      where: {
        user_id: ctx.user.id,
        deleted_at: null,
        status: { not: "cancelled" },
        start_at: { gte: today, lt: tomorrow },
      },
      include: {
        calendar: { select: { id: true, name: true, google_color_id: true, color_override: true } },
      },
      orderBy: { start_at: "asc" },
      take: 5,
    });

    return events;
  }),

  create: protectedProcedure
    .input(calendarEventCreateSchema)
    .mutation(async ({ ctx, input }) => {
      await assertLinkedEntitiesOwnership(ctx.user.id, input);

      const id = newId();
      const now = new Date();

      const event = await db.calendarEvent.create({
        data: {
          id,
          user_id: ctx.user.id,
          source: "atlas",
          title: input.title,
          description: input.description ?? null,
          location: null,
          start_at: input.start_at,
          end_at: input.end_at,
          all_day: input.all_day,
          linked_task_id: input.linked_task_id ?? null,
          linked_project_id: input.linked_project_id ?? null,
          linked_note_id: input.linked_note_id ?? null,
          updated_at: now,
        },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "CalendarEvent",
        entity_id: id,
        action: "create",
        after: { title: input.title, source: "atlas" },
      });

      return event;
    }),

  update: protectedProcedure
    .input(calendarEventUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await db.calendarEvent.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
      });

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.source !== "atlas") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot edit Google-sourced events" });
      }

      await assertLinkedEntitiesOwnership(ctx.user.id, input);

      const updated = await db.calendarEvent.update({
        where: { id: input.id },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.start_at !== undefined && { start_at: input.start_at }),
          ...(input.end_at !== undefined && { end_at: input.end_at }),
          ...(input.all_day !== undefined && { all_day: input.all_day }),
          ...("description" in input && { description: input.description }),
          ...("location" in input && { location: input.location }),
          ...("linked_task_id" in input && { linked_task_id: input.linked_task_id }),
          ...("linked_project_id" in input && { linked_project_id: input.linked_project_id }),
          ...("linked_note_id" in input && { linked_note_id: input.linked_note_id }),
          updated_at: new Date(),
        },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "CalendarEvent",
        entity_id: input.id,
        action: "update",
        before: existing as Record<string, unknown>,
        after: updated as Record<string, unknown>,
      });

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.calendarEvent.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.source !== "atlas") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete Google-sourced events" });
      }

      await db.calendarEvent.update({
        where: { id: input.id },
        data: { deleted_at: new Date(), updated_at: new Date() },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "CalendarEvent",
        entity_id: input.id,
        action: "delete",
        before: existing as Record<string, unknown>,
      });

      return { ok: true };
    }),

  link: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      linked_task_id: z.string().uuid().optional().nullable(),
      linked_project_id: z.string().uuid().optional().nullable(),
      linked_note_id: z.string().uuid().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.calendarEvent.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await assertLinkedEntitiesOwnership(ctx.user.id, input);

      const updated = await db.calendarEvent.update({
        where: { id: input.id },
        data: {
          ...("linked_task_id" in input && { linked_task_id: input.linked_task_id }),
          ...("linked_project_id" in input && { linked_project_id: input.linked_project_id }),
          ...("linked_note_id" in input && { linked_note_id: input.linked_note_id }),
          updated_at: new Date(),
        },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "CalendarEvent",
        entity_id: input.id,
        action: "calendar:link_updated",
        before: {
          linked_task_id: existing.linked_task_id,
          linked_project_id: existing.linked_project_id,
          linked_note_id: existing.linked_note_id,
        },
        after: {
          linked_task_id: updated.linked_task_id,
          linked_project_id: updated.linked_project_id,
          linked_note_id: updated.linked_note_id,
        },
      });

      return updated;
    }),
});

const calendarsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const calendars = await db.googleCalendar.findMany({
      where: { user_id: ctx.user.id, deleted_at: null },
      orderBy: [{ is_primary: "desc" }, { name: "asc" }],
    });

    const eventCounts = await Promise.all(
      calendars.map((c) =>
        db.calendarEvent.count({
          where: { calendar_id: c.id, deleted_at: null, status: { not: "cancelled" } },
        }),
      ),
    );

    return calendars.map((c, i) => ({ ...c, event_count: eventCounts[i] ?? 0 }));
  }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      is_visible: z.boolean().optional(),
      is_synced: z.boolean().optional(),
      color_override: z.enum(STRATUM_CALENDAR_TOKENS).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.googleCalendar.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const updated = await db.googleCalendar.update({
        where: { id: input.id },
        data: {
          ...(input.is_visible !== undefined && { is_visible: input.is_visible }),
          ...(input.is_synced !== undefined && { is_synced: input.is_synced }),
          ...("color_override" in input && { color_override: input.color_override }),
          updated_at: new Date(),
        },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "GoogleCalendar",
        entity_id: input.id,
        action: "calendar:settings_updated",
        before: { is_visible: existing.is_visible, is_synced: existing.is_synced, color_override: existing.color_override },
        after: { is_visible: updated.is_visible, is_synced: updated.is_synced, color_override: updated.color_override },
      });

      return updated;
    }),

  purge: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.googleCalendar.findFirst({
        where: { id: input.id, user_id: ctx.user.id, deleted_at: null },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const { count } = await db.calendarEvent.updateMany({
        where: { calendar_id: input.id, user_id: ctx.user.id, source: "google" },
        data: { deleted_at: new Date(), updated_at: new Date() },
      });

      await logActivity({
        user_id: ctx.user.id,
        entity_type: "GoogleCalendar",
        entity_id: input.id,
        action: "calendar:events_purged",
        meta: { purged_count: count, calendar_id: input.id },
      });

      return { ok: true, purged: count };
    }),
});

const calendarTasksRouter = router({
  scheduled: protectedProcedure
    .input(z.object({ task_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const task = await db.task.findFirst({
        where: { id: input.task_id, user_id: ctx.user.id, deleted_at: null },
        select: { id: true },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      return db.calendarEvent.findMany({
        where: {
          linked_task_id: input.task_id,
          user_id: ctx.user.id,
          deleted_at: null,
          status: { not: "cancelled" },
        },
        include: {
          calendar: { select: { id: true, name: true, color_override: true, google_color_id: true } },
        },
        orderBy: { start_at: "asc" },
      });
    }),
});

export const calendarRouter = router({
  connected: protectedProcedure.query(async ({ ctx }) => {
    const hasToken = await hasCalendarToken(ctx.user.id);
    if (!hasToken) return { connected: false, email: null, calendarCount: 0, eventCount: 0, lastSynced: null };

    const [calCount, evtCount, token] = await Promise.all([
      db.googleCalendar.count({ where: { user_id: ctx.user.id, deleted_at: null } }),
      db.calendarEvent.count({ where: { user_id: ctx.user.id, source: "google", deleted_at: null } }),
      db.googleCalendarOAuthToken.findUnique({
        where: { user_id: ctx.user.id },
        select: { email: true, updated_at: true },
      }),
    ]);

    const lastSynced = await db.googleCalendar.findFirst({
      where: { user_id: ctx.user.id, deleted_at: null },
      orderBy: { last_synced_at: "desc" },
      select: { last_synced_at: true },
    });

    return {
      connected: true,
      email: token?.email ?? null,
      calendarCount: calCount,
      eventCount: evtCount,
      lastSynced: lastSynced?.last_synced_at ?? null,
    };
  }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    const { revokeCalendarToken } = await import("@/core/calendar/google-client");
    await revokeCalendarToken(ctx.user.id);

    await db.googleCalendar.updateMany({
      where: { user_id: ctx.user.id },
      data: { deleted_at: new Date(), updated_at: new Date() },
    });

    await db.calendarEvent.updateMany({
      where: { user_id: ctx.user.id, source: "google" },
      data: { deleted_at: new Date(), updated_at: new Date() },
    });

    await logActivity({
      user_id: ctx.user.id,
      entity_type: "User",
      entity_id: ctx.user.id,
      action: "calendar:disconnected",
    });

    return { ok: true };
  }),

  events: eventsRouter,
  calendars: calendarsRouter,
  tasks: calendarTasksRouter,
});
