import { z } from "zod";

export const calendarEventCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  start_at: z.coerce.date(),
  end_at: z.coerce.date(),
  all_day: z.boolean().default(false),
  description: z.string().max(10000).optional(),
  location: z.string().max(500).optional(),
  linked_task_id: z.string().uuid().optional(),
  linked_project_id: z.string().uuid().optional(),
  linked_note_id: z.string().uuid().optional(),
}).refine((d) => d.end_at >= d.start_at, {
  message: "End time must be after start time",
  path: ["end_at"],
});

export const calendarEventUpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  start_at: z.coerce.date().optional(),
  end_at: z.coerce.date().optional(),
  all_day: z.boolean().optional(),
  description: z.string().max(10000).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  linked_task_id: z.string().uuid().optional().nullable(),
  linked_project_id: z.string().uuid().optional().nullable(),
  linked_note_id: z.string().uuid().optional().nullable(),
});

export const calendarWindowSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
  calendar_ids: z.array(z.string().uuid()).optional(),
  include_cancelled: z.boolean().default(false),
});

export const STRATUM_CALENDAR_TOKENS = [
  "cal-1", "cal-2", "cal-3", "cal-4", "cal-5", "cal-6",
  "cal-7", "cal-8", "cal-9", "cal-10", "cal-11", "cal-12",
] as const;

export type StratumCalendarToken = typeof STRATUM_CALENDAR_TOKENS[number];
