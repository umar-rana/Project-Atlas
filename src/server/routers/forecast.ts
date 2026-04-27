import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/core/db";

async function applySequentialFilter<T extends { id: string; project_id: string | null; status: string; flagged: boolean }>(
  tasks: T[],
): Promise<T[]> {
  const projectIds = [...new Set(tasks.map((t) => t.project_id).filter(Boolean))] as string[];
  if (!projectIds.length) return tasks;

  const sequentialProjects = await db.project.findMany({
    where: { id: { in: projectIds }, sequential: true },
    select: { id: true },
  });
  const seqIds = new Set(sequentialProjects.map((p) => p.id));
  if (!seqIds.size) return tasks;

  const firstByProject = new Map<string, string>();
  for (const pid of seqIds) {
    const first = await db.task.findFirst({
      where: { project_id: pid, status: "active", parent_id: null, deleted_at: null },
      orderBy: [{ position: "asc" }, { created_at: "asc" }],
      select: { id: true },
    });
    if (first) firstByProject.set(pid, first.id);
  }

  return tasks.filter((t) => {
    if (!t.project_id || !seqIds.has(t.project_id)) return true;
    if (t.status !== "active") return true;
    if (t.flagged) return true;
    const firstId = firstByProject.get(t.project_id);
    return t.id === firstId;
  });
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const forecastRouter = router({
  week: protectedProcedure
    .input(
      z.object({
        start_date: z.coerce.date().optional(),
        days: z.number().int().min(7).max(14).default(7),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const today = startOfDay(new Date());
      const start = input.start_date ? startOfDay(input.start_date) : today;
      const end = endOfDay(addDays(start, input.days - 1));

      const [scheduledTasks, overdueTasks] = await Promise.all([
        db.task.findMany({
          where: {
            user_id: userId,
            status: "active",
            deleted_at: null,
            due_date: { gte: start, lte: end },
          },
          include: {
            project: { select: { id: true, title: true, color: true } },
            contexts: { include: { context: { select: { id: true, name: true } } } },
          },
          orderBy: [{ due_date: "asc" }, { flagged: "desc" }, { position: "asc" }],
        }),
        db.task.findMany({
          where: {
            user_id: userId,
            status: "active",
            deleted_at: null,
            due_date: { lt: today },
          },
          include: {
            project: { select: { id: true, title: true, color: true } },
            contexts: { include: { context: { select: { id: true, name: true } } } },
          },
          orderBy: [{ due_date: "asc" }, { flagged: "desc" }],
          take: 100,
        }),
      ]);

      const [filteredScheduled, filteredOverdue] = await Promise.all([
        applySequentialFilter(scheduledTasks),
        applySequentialFilter(overdueTasks),
      ]);

      const days: {
        date: string;
        tasks: typeof filteredScheduled;
        event_count: number;
      }[] = [];

      for (let i = 0; i < input.days; i++) {
        const day = addDays(start, i);
        const key = dateKey(day);
        const dayTasks = filteredScheduled.filter(
          (t) => t.due_date && dateKey(new Date(t.due_date)) === key,
        );
        days.push({ date: key, tasks: dayTasks, event_count: 0 });
      }

      return {
        days,
        overdue: filteredOverdue,
        calendar_connected: false,
      };
    }),

  day: protectedProcedure
    .input(z.object({ date: z.coerce.date() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const day = startOfDay(input.date);
      const end = endOfDay(day);

      const [rawTasks, rawOverdue] = await Promise.all([
        db.task.findMany({
          where: {
            user_id: userId,
            status: "active",
            deleted_at: null,
            due_date: { gte: day, lte: end },
          },
          include: {
            project: { select: { id: true, title: true, color: true } },
            contexts: { include: { context: { select: { id: true, name: true } } } },
          },
          orderBy: [{ flagged: "desc" }, { position: "asc" }],
        }),
        db.task.findMany({
          where: {
            user_id: userId,
            status: "active",
            deleted_at: null,
            due_date: { lt: day },
          },
          include: {
            project: { select: { id: true, title: true, color: true } },
            contexts: { include: { context: { select: { id: true, name: true } } } },
          },
          orderBy: [{ due_date: "asc" }, { flagged: "desc" }],
          take: 50,
        }),
      ]);

      const [tasks, overdue] = await Promise.all([
        applySequentialFilter(rawTasks),
        applySequentialFilter(rawOverdue),
      ]);

      return {
        date: dateKey(day),
        tasks,
        overdue,
        event_count: 0,
        calendar_connected: false,
      };
    }),

  dayLoad: protectedProcedure
    .input(
      z.object({
        start_date: z.coerce.date(),
        days: z.number().int().min(7).max(90).default(14),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const start = startOfDay(input.start_date);
      const end = endOfDay(addDays(start, input.days - 1));

      const tasks = await db.task.findMany({
        where: {
          user_id: userId,
          status: "active",
          deleted_at: null,
          due_date: { gte: start, lte: end },
        },
        select: { due_date: true },
      });

      const load: Record<string, number> = {};
      for (let i = 0; i < input.days; i++) {
        const key = dateKey(addDays(start, i));
        load[key] = 0;
      }
      for (const t of tasks) {
        const dd: Date | null = t.due_date;
        if (!dd) continue;
        const key = dateKey(dd);
        if (key in load) load[key] = (load[key] ?? 0) + 1;
      }

      return { load };
    }),

  reschedule: protectedProcedure
    .input(
      z.object({
        task_id: z.string().uuid(),
        due_date: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await db.task.updateMany({
        where: {
          id: input.task_id,
          user_id: ctx.user.id,
          deleted_at: null,
        },
        data: { due_date: input.due_date },
      });

      if (result.count === 0) {
        const { TRPCError } = await import("@trpc/server");
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { logActivity } = await import("@/core/audit");
      await logActivity({
        user_id: ctx.user.id,
        entity_type: "Task",
        entity_id: input.task_id,
        action: "task_rescheduled",
        meta: { due_date: input.due_date.toISOString() },
      });

      return { ok: true };
    }),
});
